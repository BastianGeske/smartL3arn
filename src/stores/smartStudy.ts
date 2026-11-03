import { locale, type TranslationKey } from '../i18n'
import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { localEvaluation } from '../domain/study/answerSimilarity'
import { buildSmartStudyQueue } from '../domain/study/smartQueue'
import { scheduleCard } from '../domain/scheduling/fsrs'
import {
  emptySessionStats,
  ratingKey,
  type ConfidenceLevel,
  type Card,
  type Deck,
  type Rating,
  type RatingKey,
  type SmartSessionState,
  type StudyResponse,
} from '../domain/types'
import { AI_TEXT_LIMIT, initialResponse, evaluateResponse, responseError, responseText, workingText, taskReferenceAnswer } from '../domain/tasks'
import { todayStr } from '../domain/dates'
import {
  getPomodoroBreakUntil,
  setPomodoroBreakUntil,
} from '../services/settings'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'
import { getAiBridge } from '../services/ai'
import { cardStatsFor } from '../domain/cardStats'

const REQUEUE_LIMITS: Record<RatingKey, number> = {
  again: 2,
  hard: 1,
  good: 0,
  easy: 0,
}
const POMODORO_MINUTES = 25
const BREAK_MINUTES = 7

function unansweredEvaluation(card: Card) {
  return (card.task && !['short_text', 'long_text'].includes(card.task.kind) ? evaluateResponse(card, { kind: 'text', value: '' }) : null)
    ?? { ...localEvaluation('', card.back), verdict: 'incorrect' as const, localSimilarity: 0 }
}

const fallbackMessages: Record<string, TranslationKey> = {
  'not-configured': 'ai.notConfigured',
  auth: 'ai.auth',
  forbidden: 'ai.forbidden',
  credits: 'ai.credits',
  'model-unavailable': 'ai.modelUnavailable',
  'rate-limit': 'ai.rateLimit',
  timeout: 'ai.timeout',
  'invalid-response': 'ai.invalidResponse',
  'invalid-input': 'ai.invalidInput',
  unavailable: 'ai.unavailable',
}

export const useSmartStudyStore = defineStore('smart-study', () => {
  const library = useLibraryStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  const session = ref<SmartSessionState | null>(null)
  const evaluationError = ref<TranslationKey | null>(null)
  const inputError = ref<TranslationKey | null>(null)
  const clockNow = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  let evaluationSequence = 0

  function saveBreak(timestamp: number): void {
    try { setPomodoroBreakUntil(timestamp) }
    catch { ui.showError('notifications.smartConfigFailed') }
  }

  const currentItem = computed(() => session.value?.queue[session.value.index])
  const currentDeck = computed(() => {
    const item = currentItem.value
    return item ? library.deckById(item.deckId) : undefined
  })
  const currentCard = computed(() => {
    const item = currentItem.value
    return currentDeck.value?.cards.find((card) => card.id === item?.cardId)
  })
  const remainingMs = computed(() => {
    const value = session.value
    if (!value?.durationMs) return 0
    return Math.max(0, value.durationMs - (clockNow.value - value.startTime))
  })
  const breakRemainingMs = computed(() => {
    const value = session.value
    if (!value?.breakDurationMs || !value.breakStartTime) return 0
    return Math.max(0, value.breakDurationMs - (clockNow.value - value.breakStartTime))
  })
  const isBreak = computed(() => Boolean(session.value?.breakStartTime))
  const isDone = computed(() => Boolean(
    session.value
    && !isBreak.value
    && (session.value.timeUp || session.value.index >= session.value.queue.length),
  ))

  function selectedDecks(): Deck[] {
    return settings.smartConfig.deckIds
      .map((id) => library.deckById(id))
      .filter((deck): deck is Deck => Boolean(deck))
  }

  function availableQueue() {
    return buildSmartStudyQueue(selectedDecks(), settings.smartConfig)
  }

  async function start(): Promise<boolean> {
    evaluationError.value = null
    const breakUntil = getPomodoroBreakUntil()
    if (
      settings.smartConfig.duration === POMODORO_MINUTES
      && breakUntil > Date.now()
    ) {
      session.value = {
        queue: [],
        mode: 'practice',
        index: 0,
        phase: 'break',
        typedAnswer: '',
        response: null, working: [], workingEvaluation: null, selfAssessment: false,
        evaluation: null,
        isEvaluating: false,
        confidenceLevel: null,
        elaboration: '',
        startTime: Date.now(),
        durationMs: 0,
        timeUp: true,
        breakStartTime: breakUntil - BREAK_MINUTES * 60_000,
        breakDurationMs: BREAK_MINUTES * 60_000,
        breakDone: false,
        sessionStats: emptySessionStats(),
        perDeck: {},
        requeues: {},
        sessionSaved: true,
      }
      startTimer()
      return true
    }

    const decks = selectedDecks()
    let changed = false
    decks.forEach((deck) => {
      Object.values(deck.cardStats || {}).forEach((stats) => {
        if ('smartBlockedUntil' in stats) {
          delete stats.smartBlockedUntil
          changed = true
        }
        if ('smartSkipUntilSession' in stats) {
          delete stats.smartSkipUntilSession
          changed = true
        }
      })
    })

    const result = buildSmartStudyQueue(decks, settings.smartConfig)
    if (!result.queue.length) {
      if (changed) await library.persist().catch(() => undefined)
      return false
    }

    decks.forEach((deck) => {
      deck.smartSessionSeq = (deck.smartSessionSeq || 0) + 1
    })
    await library.persist().catch(() => undefined)

    session.value = {
      queue: result.queue,
      mode: result.mode,
      index: 0,
      phase: 'asking',
      typedAnswer: '',
      response: null, working: [], workingEvaluation: null, selfAssessment: false,
      evaluation: null,
      isEvaluating: false,
      confidenceLevel: null,
      elaboration: '',
      startTime: Date.now(),
      durationMs: settings.smartConfig.duration > 0
        ? settings.smartConfig.duration * 60_000
        : 0,
      timeUp: false,
      sessionStats: emptySessionStats(),
      perDeck: {},
      requeues: {},
      sessionSaved: false,
    }
    session.value.response = currentCard.value?.task ? initialResponse(currentCard.value.task) : null
    inputError.value = null
    startTimer()
    return true
  }

  function startTimer(): void {
    stopTimer()
    clockNow.value = Date.now()
    timer = setInterval(() => {
      clockNow.value = Date.now()
      const value = session.value
      if (!value) return
      if (value.breakStartTime) {
        if (breakRemainingMs.value <= 0) {
          value.breakDone = true
          saveBreak(0)
          stopTimer()
        }
        return
      }
      if (value.durationMs && remainingMs.value <= 0 && !value.timeUp) {
        void finishForTimeLimit()
      }
    }, 500)
  }

  function stopTimer(): void {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  async function finishForTimeLimit(): Promise<void> {
    const value = session.value
    if (!value) return
    await saveSessions()
    value.timeUp = true
    if (settings.smartConfig.duration === POMODORO_MINUTES) {
      value.phase = 'break'
      value.breakStartTime = Date.now()
      value.breakDurationMs = BREAK_MINUTES * 60_000
      value.breakDone = false
      saveBreak(value.breakStartTime + value.breakDurationMs)
      startTimer()
    } else {
      stopTimer()
    }
  }

  function setConfidence(level: ConfidenceLevel): void {
    if (session.value) session.value.confidenceLevel = level
  }
  function setResponse(response: StudyResponse): void {
    const value = session.value
    if (!value || value.phase !== 'asking' || value.isEvaluating) return
    value.response = response
    value.typedAnswer = responseText(response, currentCard.value?.task)
    inputError.value = null
  }

  async function checkAnswer(): Promise<void> {
    const value = session.value
    const card = currentCard.value
    const deck = currentDeck.value
    if (!value || !card || !deck || value.phase !== 'asking' || value.isEvaluating) return

    const response = card.task ? value.response ?? initialResponse(card.task) : { kind: 'text' as const, value: value.typedAnswer }
    inputError.value = responseError(card.task, response)
    if (inputError.value) return
    const typedAnswer = responseText(response, card.task).trim()
    value.typedAnswer = typedAnswer
    evaluationError.value = null
    value.workingEvaluation = null
    value.selfAssessment = false
    if (!typedAnswer) {
      value.evaluation = unansweredEvaluation(card)
      value.phase = 'reviewing'
      return
    }

    const working = card.task?.kind === 'calculation' ? workingText(value.working) : ''
    const deterministic = Boolean(card.task && !['short_text', 'long_text'].includes(card.task.kind) && !(card.task.kind === 'calculation' && card.task.answer.kind === 'formula'))
    if (settings.smartConfig.evaluationMode !== 'openrouter') {
      const local = evaluateResponse(card, response)
      value.evaluation = local
      value.selfAssessment = local === null
      value.phase = 'reviewing'
      return
    }
    if (deterministic) value.evaluation = evaluateResponse(card, response)
    if (deterministic && !working) { value.phase = 'reviewing'; return }
    const referenceAnswer = taskReferenceAnswer(card)
    const referenceWorking = working && card.task?.kind === 'calculation' ? workingText(card.task.solutionSteps || []) : ''
    const fields: [string, TranslationKey][] = [
      [deck.name, 'task.aiDeckTooLong'],
      [card.front, 'task.aiQuestionTooLong'],
      [referenceAnswer, 'task.aiReferenceTooLong'],
      [typedAnswer, 'task.aiAnswerTooLong'],
      [referenceWorking, 'task.aiReferenceWorkingTooLong'],
      [working, 'task.aiWorkingTooLong'],
    ]
    inputError.value = fields.find(([text]) => text.length > AI_TEXT_LIMIT)?.[1] ?? null
    if (inputError.value) return
    const ai = getAiBridge()
    if (!ai) {
      evaluationError.value = 'ai.unavailable'
      return
    }

    const sequence = ++evaluationSequence
    const cardId = card.id
    const index = value.index
    value.isEvaluating = true

    let result
    try {
      result = await ai.evaluateAnswer({
        deckName: deck.name,
        question: card.front,
        referenceAnswer,
        userAnswer: typedAnswer,
        language: locale.value,
        ...(working ? {
          evaluationScope: deterministic ? 'working' as const : 'answer_and_working' as const,
          referenceWorking,
          userWorking: working,
        } : {}),
      })
    } catch {
      result = { ok: false, reason: 'unavailable' }
    }

    if (
      sequence !== evaluationSequence
      || session.value !== value
      || value.index !== index
      || value.phase !== 'asking'
      || value.timeUp
      || currentCard.value?.id !== cardId
    ) return

    value.isEvaluating = false
    if (result.ok && result.result && (!working || deterministic || result.result.working)) {
      const evaluated = {
        source: 'openrouter',
        verdict: result.result.verdict,
        feedback: result.result.feedback,
        ...(result.result.model ? { model: result.result.model } : {}),
      } as const
      if (deterministic && working) value.workingEvaluation = evaluated
      else {
        value.evaluation = evaluated
        if (working && result.result.working) value.workingEvaluation = { source: 'openrouter', ...result.result.working }
      }
    } else {
      const reason = result.ok ? 'invalid-response' : result.reason || 'unavailable'
      evaluationError.value = fallbackMessages[reason] || fallbackMessages.unavailable
      return
    }
    value.phase = 'reviewing'
  }

  function skip(): void {
    evaluationError.value = null
    const value = session.value
    const card = currentCard.value
    if (!value || !card || value.phase !== 'asking' || value.isEvaluating) return
    value.typedAnswer = ''
    value.response = null
    value.workingEvaluation = null
    value.selfAssessment = false
    inputError.value = null
    value.evaluation = unansweredEvaluation(card)
    value.phase = 'reviewing'
  }

  function reveal(): void {
    const value = session.value
    if (!value || value.phase !== 'asking' || value.isEvaluating) return
    value.evaluation = null
    value.workingEvaluation = null
    value.selfAssessment = false
    value.phase = 'reviewing'
  }

  async function rate(rating: Rating): Promise<void> {
    const value = session.value
    const item = currentItem.value
    const deck = currentDeck.value
    const card = currentCard.value
    if (!value || !item || !deck || !card || value.phase !== 'reviewing' || value.timeUp) {
      return
    }

    const key = ratingKey(rating)
    const queueKey = `${item.deckId}:${item.cardId}`
    const requeueCount = value.requeues[queueKey] || 0

    value.sessionStats.reviewed += 1
    value.sessionStats[key] += 1
    const deckStats = value.perDeck[item.deckId] || emptySessionStats()
    deckStats.reviewed += 1
    deckStats[key] += 1
    value.perDeck[item.deckId] = deckStats

    const cardIndex = deck.cards.findIndex((entry) => entry.id === card.id)
    deck.cards[cardIndex] = scheduleCard(card, rating)

    const stats = cardStatsFor(deck, card.id)
    stats.reviews += 1
    if (rating === 0) stats.again += 1
    if (rating === 1) stats.hard += 1
    if (settings.smartConfig.techniques.whyPrompt && value.elaboration.trim()) {
      stats.elaborations ||= []
      stats.elaborations.push({
        date: todayStr(),
        text: value.elaboration.trim().slice(0, 500),
      })
      if (stats.elaborations.length > 3) {
        stats.elaborations = stats.elaborations.slice(-3)
      }
    }
    delete stats.smartBlockedUntil
    delete stats.smartSkipUntilSession
    stats.smartLastGrade = key
    stats.smartLastReviewedSession = deck.smartSessionSeq || 0
    if (key === 'again' || key === 'hard') stats.smartNeedsPractice = true
    else delete stats.smartNeedsPractice

    if (requeueCount < REQUEUE_LIMITS[key]) {
      value.requeues[queueKey] = requeueCount + 1
      value.queue.push({ ...item })
    }

    value.index += 1
    value.typedAnswer = ''
    value.response = currentCard.value?.task ? initialResponse(currentCard.value.task) : null
    value.working = []
    value.workingEvaluation = null
    value.selfAssessment = false
    inputError.value = null
    evaluationError.value = null
    value.evaluation = null
    value.isEvaluating = false
    value.confidenceLevel = null
    value.elaboration = ''
    value.phase = 'asking'

    if (value.index >= value.queue.length) {
      await saveSessions()
      stopTimer()
    } else {
      await library.persist().catch(() => undefined)
    }
  }

  async function saveSessions(): Promise<void> {
    const value = session.value
    if (!value || value.sessionSaved) return
    Object.entries(value.perDeck).forEach(([deckId, stats]) => {
      const deck = library.deckById(deckId)
      if (!deck) return
      deck.sessions ||= []
      deck.sessions.push({ date: todayStr(), ...stats, smart: true })
      if (deck.sessions.length > 90) deck.sessions = deck.sessions.slice(-90)
    })
    value.sessionSaved = true
    // Sessions remain in memory for the next save; do not append them twice on retry.
    await library.persist().catch(() => undefined)
  }

  onScopeDispose(stopTimer)

  return {
    session,
    evaluationError,
    inputError,
    clockNow,
    currentItem,
    currentDeck,
    currentCard,
    remainingMs,
    breakRemainingMs,
    isBreak,
    isDone,
    availableQueue,
    start,
    startTimer,
    stopTimer,
    setConfidence,
    setResponse,
    checkAnswer,
    skip,
    reveal,
    rate,
  }
})
