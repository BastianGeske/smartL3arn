import { useStudyAvailability } from '../composables/useStudyAvailability'
import { advanceReady, practiceReady, recordPractice, retryLimit, studyPurpose } from '../domain/study/practice'
import type { StudyPurpose } from '../domain/types'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { buildStandardQueue } from '../domain/study/standardQueue'
import { scheduleCard } from '../domain/scheduling/fsrs'
import {
  emptySessionStats,
  ratingKey,
  type Rating,
  type SessionStats,
} from '../domain/types'
import { todayStr } from '../domain/dates'
import { useLibraryStore } from './library'

interface StandardSession {
  deckId: string | null
  stats: SessionStats
  practice: boolean
  saved: boolean
}

export const useStudyStore = defineStore('study', () => {
  const library = useLibraryStore()
  const session = ref<StandardSession>({ deckId: null, stats: emptySessionStats(), practice: false, saved: false })
  const deckId = computed(() => session.value.deckId)
  const mainQueue = ref<string[]>([])
  const learningQueue = ref<string[]>([])
  const phase = ref<'main' | 'learning'>('main')
  const index = ref(0)
  const flipped = ref(false)
  const purposes = ref<Record<string, StudyPurpose>>({})
  const retries = ref<Record<string, number>>(Object.create(null))
  const currentPurpose = computed(() => phase.value === 'learning' && purposes.value[currentCard.value?.id || ''] !== 'practice' ? 'relearning' : purposes.value[currentCard.value?.id || ''])
  const sessionStats = computed(() => session.value.stats)
  let ratingWaiting = false
  let pendingRating: Promise<void> | undefined

  const deck = computed(() => deckId.value ? library.deckById(deckId.value) : undefined)
  const currentQueue = computed(() => (
    phase.value === 'main' ? mainQueue.value : learningQueue.value
  ))
  const currentCard = computed(() => (
    deck.value?.cards.find((card) => card.id === currentQueue.value[index.value])
  ))
  const complete = computed(() => (
    phase.value === 'main'
      ? index.value >= mainQueue.value.length && learningQueue.value.length === 0
      : index.value >= learningQueue.value.length
  ))

  const { availability, refreshAvailability } = useStudyAvailability(() => deck.value ? [deck.value] : [])

  function start(nextDeckId: string): boolean {
    if (library.transactionBusy || ratingWaiting || library.persistenceIssue === 'conflict' || library.persistenceIssue === 'load') return false
    const nextDeck = library.deckById(nextDeckId)
    if (!nextDeck?.cards.length) return false
    const queue = buildStandardQueue(nextDeck)
    if (!queue.length) return false
    void saveSessions()
    mainQueue.value = queue
    purposes.value = Object.fromEntries(nextDeck.cards.map(card => [card.id, studyPurpose(nextDeck, card)]))
    retries.value = Object.create(null)
    session.value = {
      deckId: nextDeckId,
      stats: emptySessionStats(),
      practice: queue.every(id => purposes.value[id] === 'practice'),
      saved: false,
    }
    learningQueue.value = []
    phase.value = 'main'
    index.value = 0
    flipped.value = false
    return true
  }

  function flip(): void {
    flipped.value = !flipped.value
  }

  async function rate(rating: Rating): Promise<void> {
    const cardId = currentCard.value?.id
    if (!cardId || !deck.value || !flipped.value || session.value.saved || ratingWaiting
      || !practiceReady(deck.value, cardId)) return
    ratingWaiting = true
    const request = library.persist(() => {
      ratingWaiting = false
      const currentDeck = deck.value
      const card = currentCard.value
      if (!currentDeck || !card || card.id !== cardId || session.value.saved || !flipped.value
        || !practiceReady(currentDeck, cardId)) return false

      const key = ratingKey(rating)
      sessionStats.value.reviewed += 1
      sessionStats.value[key] += 1
      const cardIndex = currentDeck.cards.findIndex((item) => item.id === card.id)
      if (currentPurpose.value !== 'practice') currentDeck.cards[cardIndex] = scheduleCard(card, rating)

      recordPractice(currentDeck, card, rating, currentPurpose.value || 'review')
      const count = retries.value[card.id] || 0
      if (count < retryLimit(rating)) {
        retries.value[card.id] = count + 1
        learningQueue.value.push(card.id)
      }
      index.value += 1

      if (
        phase.value === 'main'
        && index.value >= mainQueue.value.length
        && learningQueue.value.length > 0
      ) {
        phase.value = 'learning'
        index.value = 0
      }

      advanceReady(currentQueue.value, index.value, id => practiceReady(currentDeck, id))

      flipped.value = false
      if (complete.value) appendSession(session.value)
      return true
    })
    pendingRating = request
    try { await request } catch { /* The library notice reports write failures. */ }
    finally {
      if (pendingRating === request) { pendingRating = undefined; ratingWaiting = false }
    }
  }

  function appendSession(value: StandardSession): boolean {
    if (!value.deckId || value.saved || !value.stats.reviewed) return false
    const target = library.deckById(value.deckId)
    if (!target) return false
    const entry = { date: todayStr(), ...value.stats, practice: value.practice }
    target.sessions = [...(target.sessions || []), entry].slice(-90)
    value.saved = true
    return true
  }

  async function saveSessions(closing = false): Promise<void> {
    // Capture this session even if start() replaces it while the write is queued.
    const value = session.value
    if (!closing && !ratingWaiting && (!value.stats.reviewed || (value.saved && library.persistenceIssue !== 'save'))) return
    await library.persist(() => {
      const changed = appendSession(value) || (value.saved && library.persistenceIssue === 'save')
      if (closing) value.saved = true
      return changed
    }).catch(() => undefined)
  }

  async function end(): Promise<void> {
    const value = session.value
    await saveSessions(true)
    if (session.value === value) value.deckId = null
  }

  return {
    deckId,
    mainQueue,
    learningQueue,
    phase,
    index,
    flipped,
    currentPurpose,
    availability,
    refreshAvailability,
    end,
    sessionStats,
    deck,
    currentCard,
    complete,
    start,
    saveSessions,
    flip,
    rate,
  }
})
