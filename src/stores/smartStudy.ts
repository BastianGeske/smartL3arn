import { useStudyAvailability } from '../composables/useStudyAvailability'
import { advanceReady, practiceReady, recordPractice, retryLimit } from '../domain/study/practice'
import { locale, type TranslationKey } from '../i18n'
import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { buildSmartStudyQueue } from '../domain/study/smartQueue'
import { scheduleCard } from '../domain/scheduling/fsrs'
import {
  emptySessionStats,
  ratingKey,
  type ConfidenceLevel,
  type Card,
  type Deck,
  type Rating,
  type SmartSessionState,
  type StudyResponse,
} from '../domain/types'
import { AI_TEXT_LIMIT, initialResponse, evaluateResponse, aiEvaluationScope, responseError, responseText, workingText, taskReferenceAnswer } from '../domain/tasks'
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

const POMODORO_MINUTES = 25
const BREAK_MINUTES = 7

function unansweredEvaluation(card: Card) {
  return (card.task && !['short_text', 'long_text'].includes(card.task.kind) ? evaluateResponse(card, { kind: 'text', value: '' }) : null)
    ?? null
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

  const { availability, refreshAvailability } = useStudyAvailability(selectedDecks)
  const content = computed(() => {
    const card = currentCard.value
    return card && JSON.stringify([currentItem.value?.deckId, card.id, card.front, card.back, card.task])
  })
  let attemptContent: string | undefined

  function resetAttempt(value: SmartSessionState) {
    evaluationSequence++
    attemptContent = content.value
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
  }

  function refreshAttempt(): boolean {
    const value = session.value
    if (!value || value.timeUp || !currentCard.value || content.value === attemptContent) return false
    resetAttempt(value)
    return true
  }

  async function start(): Promise<boolean> {
    if (library.transactionBusy) return false
    let started = false
    await library.persist(() => {
      const decks = selectedDecks()
      const duration = settings.smartConfig.duration
      const breakUntil = getPomodoroBreakUntil()
      const resumeBreak = duration === POMODORO_MINUTES && breakUntil > Date.now()
      const plan = resumeBreak ? { queue: [], mode: 'practice' as const } : buildSmartStudyQueue(decks, settings.smartConfig)
      if (!resumeBreak && !plan.queue.length) return false

      const historyChanged = appendSessions(session.value)
      if (!resumeBreak) {
        for (const deck of decks) {
          deck.smartSessionSeq = (deck.smartSessionSeq || 0) + 1
          for (const stats of Object.values(deck.cardStats || {})) {
            delete stats.smartBlockedUntil
            delete stats.smartSkipUntilSession
          }
        }
      }
      session.value = {
        queue: plan.queue,
        mode: plan.mode,
        index: 0,
        phase: resumeBreak ? 'break' : 'asking',
        typedAnswer: '',
        response: null, working: [], workingEvaluation: null, selfAssessment: false,
        evaluation: null,
        isEvaluating: false,
        confidenceLevel: null,
        elaboration: '',
        startTime: Date.now(),
        durationMs: resumeBreak ? 0 : duration * 60_000,
        timeUp: resumeBreak,
        ...(resumeBreak ? {
          breakStartTime: breakUntil - BREAK_MINUTES * 60_000,
          breakDurationMs: BREAK_MINUTES * 60_000,
          breakDone: false,
        } : {}),
        sessionStats: emptySessionStats(),
        perDeck: new Map(),
        requeues: Object.create(null),
        sessionSaved: resumeBreak,
      }
      if (!resumeBreak) resetAttempt(session.value)
      startTimer()
      started = true
      return historyChanged || !resumeBreak
    }).catch(() => undefined)
    return started
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
    if (!value || value.timeUp || value.index >= value.queue.length) return
    value.timeUp = true
    value.isEvaluating = false
    if (value.durationMs === POMODORO_MINUTES * 60_000) {
      value.phase = 'break'
      value.breakStartTime = Date.now()
      value.breakDurationMs = BREAK_MINUTES * 60_000
      value.breakDone = false
      saveBreak(value.breakStartTime + value.breakDurationMs)
      startTimer()
    } else {
      stopTimer()
    }
    await saveSessions()
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
    if (!value || !card || !deck || value.timeUp || value.phase !== 'asking' || value.isEvaluating || refreshAttempt()) return

    const response = card.task ? value.response ?? initialResponse(card.task) : { kind: 'text' as const, value: value.typedAnswer }
    inputError.value = responseError(card.task, response)
    // In AI mode, written numbers and alternate notation can be interpreted semantically.
    if (inputError.value === 'task.invalidMath' && settings.smartConfig.evaluationMode === 'openrouter'
      && card.task?.kind === 'calculation' && ['number', 'fraction'].includes(card.task.answer.kind)
      && response.kind === 'text' && response.value.trim()) inputError.value = null
    if (inputError.value) return
    const typedAnswer = responseText(response, card.task).trim()
    value.typedAnswer = typedAnswer
    evaluationError.value = null
    value.workingEvaluation = null
    value.selfAssessment = false
    if (!typedAnswer) {
      value.evaluation = unansweredEvaluation(card)
      value.selfAssessment = value.evaluation === null
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
    const scope = aiEvaluationScope(card, response, Boolean(working))
    value.evaluation = deterministic && (!scope || scope === 'working') ? evaluateResponse(card, response) : null
    if (!scope) { value.phase = 'reviewing'; return }
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
        evaluationScope: scope,
        ...(working ? {
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
      || refreshAttempt()
    ) return

    value.isEvaluating = false
    if (result.ok && result.result && (scope !== 'answer_and_working' || result.result.working)) {
      const evaluated = {
        source: 'openrouter',
        verdict: result.result.verdict,
        feedback: result.result.feedback,
        ...(result.result.model ? { model: result.result.model } : {}),
      } as const
      if (scope === 'working') value.workingEvaluation = evaluated
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
    refreshAttempt()
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
    value.selfAssessment = value.evaluation === null
    value.phase = 'reviewing'
  }

  function reveal(): void {
    refreshAttempt()
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
    const index = value?.index
    if (!value || !item || value.phase !== 'reviewing' || value.timeUp || value.sessionSaved || refreshAttempt()) return
    await library.persist(() => {
      const deck = currentDeck.value
      const card = currentCard.value
      if (session.value !== value || value.index !== index || currentItem.value !== item || !deck || !card
        || value.phase !== 'reviewing' || value.timeUp || value.sessionSaved || refreshAttempt()
        || (value.durationMs && Date.now() >= value.startTime + value.durationMs)
        || !practiceReady(deck, card.id)) return false

      const key = ratingKey(rating)
      const queueKey = `${item.deckId}:${item.cardId}`
      const requeueCount = value.requeues[queueKey] || 0

      value.sessionStats.reviewed += 1
      value.sessionStats[key] += 1
      const deckStats = value.perDeck.get(item.deckId) ?? emptySessionStats()
      deckStats.reviewed += 1
      deckStats[key] += 1
      value.perDeck.set(item.deckId, deckStats)

      const cardIndex = deck.cards.findIndex((entry) => entry.id === card.id)
      if (item.purpose !== 'practice') deck.cards[cardIndex] = scheduleCard(card, rating)

      const stats = cardStatsFor(deck, card.id)
      recordPractice(deck, card, rating, item.purpose || 'review')
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

      if (requeueCount < retryLimit(rating)) {
        value.requeues[queueKey] = requeueCount + 1
        value.queue.push({ ...item, purpose: item.purpose === 'practice' ? 'practice' : 'relearning' })
      }

      value.index += 1
      advanceReady(value.queue, value.index, entry => {
        const entryDeck = library.deckById(entry.deckId)
        return Boolean(entryDeck && practiceReady(entryDeck, entry.cardId))
      })
      resetAttempt(value)
      if (value.index >= value.queue.length) {
        stopTimer()
        appendSessions(value)
      }
      return true
    }).catch(() => undefined)
  }

  function appendSessions(value: SmartSessionState | null): boolean {
    if (!value || value.sessionSaved || !value.sessionStats.reviewed) return false
    for (const [deckId, stats] of value.perDeck) {
      const deck = library.deckById(deckId)
      if (!deck || !stats.reviewed) continue
      const entry = { date: todayStr(), ...stats, smart: true, practice: value.mode === 'practice' }
      deck.sessions = [...(deck.sessions || []), entry].slice(-90)
    }
    value.sessionSaved = true
    return true
  }

  async function saveSessions(closing = false): Promise<void> {
    const value = session.value
    if (!value) return
    await library.persist(() => {
      const changed = appendSessions(value) || (value.sessionSaved && library.persistenceIssue === 'save')
      if (closing) value.sessionSaved = true
      return changed
    }).catch(() => undefined)
  }

  async function end(): Promise<void> {
    const value = session.value
    stopTimer()
    await saveSessions(true)
    if (session.value === value) session.value = null
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
    availability,
    refreshAvailability,
    refreshAttempt,
    end,
    start,
    saveSessions,
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
