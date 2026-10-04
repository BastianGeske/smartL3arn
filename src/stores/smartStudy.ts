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
  type Deck,
  type Rating,
  type RatingKey,
  type SmartSessionState,
} from '../domain/types'
import { todayStr } from '../domain/dates'
import {
  getPomodoroBreakUntil,
  setPomodoroBreakUntil,
} from '../services/settings'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'

const REQUEUE_LIMITS: Record<RatingKey, number> = {
  again: 2,
  hard: 1,
  good: 0,
  easy: 0,
}
const POMODORO_MINUTES = 25
const BREAK_MINUTES = 7

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
  const session = ref<SmartSessionState | null>(null)
  const clockNow = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  let evaluationSequence = 0

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
      if (changed) await library.persist()
      return false
    }

    decks.forEach((deck) => {
      deck.smartSessionSeq = (deck.smartSessionSeq || 0) + 1
    })
    await library.persist()

    session.value = {
      queue: result.queue,
      mode: result.mode,
      index: 0,
      phase: 'asking',
      typedAnswer: '',
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
          setPomodoroBreakUntil(0)
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
      setPomodoroBreakUntil(value.breakStartTime + value.breakDurationMs)
      startTimer()
    } else {
      stopTimer()
    }
  }

  function setConfidence(level: ConfidenceLevel): void {
    if (session.value) session.value.confidenceLevel = level
  }

  async function checkAnswer(): Promise<void> {
    const value = session.value
    const card = currentCard.value
    const deck = currentDeck.value
    if (!value || !card || !deck || value.phase !== 'asking' || value.isEvaluating) return

    const typedAnswer = value.typedAnswer.trim()
    if (!typedAnswer) {
      value.evaluation = localEvaluation('', card.back)
      value.phase = 'reviewing'
      return
    }

    if (settings.smartConfig.evaluationMode !== 'openrouter' || !window.smartL3arn) {
      value.evaluation = localEvaluation(typedAnswer, card.back)
      value.phase = 'reviewing'
      return
    }

    const sequence = ++evaluationSequence
    const cardId = card.id
    const index = value.index
    value.isEvaluating = true

    let result
    try {
      result = await window.smartL3arn.evaluateAnswer({
        deckName: deck.name,
        question: card.front,
        referenceAnswer: card.back,
        userAnswer: typedAnswer,
        language: locale.value,
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
    if (result.ok && result.result) {
      value.evaluation = {
        source: 'openrouter',
        verdict: result.result.verdict,
        feedback: result.result.feedback,
        ...(result.result.model ? { model: result.result.model } : {}),
      }
    } else {
      const reason = result.reason || 'unavailable'
      value.evaluation = localEvaluation(
        typedAnswer,
        card.back,
        fallbackMessages[reason] || fallbackMessages.unavailable,
      )
    }
    value.phase = 'reviewing'
  }

  function skip(): void {
    const value = session.value
    const card = currentCard.value
    if (!value || !card || value.phase !== 'asking' || value.isEvaluating) return
    value.typedAnswer = ''
    value.evaluation = localEvaluation('', card.back)
    value.phase = 'reviewing'
  }

  function reveal(): void {
    const value = session.value
    if (!value || value.phase !== 'asking' || value.isEvaluating) return
    value.evaluation = null
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

    deck.cardStats ||= {}
    const stats = deck.cardStats[card.id] || { reviews: 0, again: 0, hard: 0 }
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
    deck.cardStats[card.id] = stats

    if (requeueCount < REQUEUE_LIMITS[key]) {
      value.requeues[queueKey] = requeueCount + 1
      value.queue.push({ ...item })
    }

    value.index += 1
    value.typedAnswer = ''
    value.evaluation = null
    value.isEvaluating = false
    value.confidenceLevel = null
    value.elaboration = ''
    value.phase = 'asking'

    if (value.index >= value.queue.length) {
      await saveSessions()
      stopTimer()
    } else {
      await library.persist()
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
    await library.persist()
  }

  onScopeDispose(stopTimer)

  return {
    session,
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
    checkAnswer,
    skip,
    reveal,
    rate,
  }
})
