import { advanceReady, nextPracticeAt, practiceReady, recordPractice, retryLimit, studyPurpose } from '../domain/study/practice'
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

export const useStudyStore = defineStore('study', () => {
  const library = useLibraryStore()
  const deckId = ref<string | null>(null)
  const mainQueue = ref<string[]>([])
  const learningQueue = ref<string[]>([])
  const phase = ref<'main' | 'learning'>('main')
  const index = ref(0)
  const flipped = ref(false)
  const purposes = ref<Record<string, StudyPurpose>>({})
  const retries = ref<Record<string, number>>(Object.create(null))
  const practiceSession = ref(false)
  const currentPurpose = computed(() => phase.value === 'learning' && purposes.value[currentCard.value?.id || ''] !== 'practice' ? 'relearning' : purposes.value[currentCard.value?.id || ''])
  const sessionStats = ref<SessionStats>(emptySessionStats())
  let sessionSaved = false

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

  function start(nextDeckId: string): boolean {
    if (library.transactionBusy) return false
    const nextDeck = library.deckById(nextDeckId)
    if (!nextDeck?.cards.length) return false
    deckId.value = nextDeckId
    mainQueue.value = buildStandardQueue(nextDeck)
    purposes.value = Object.fromEntries(nextDeck.cards.map(card => [card.id, studyPurpose(nextDeck, card)]))
    retries.value = Object.create(null)
    practiceSession.value = mainQueue.value.length > 0 && mainQueue.value.every(id => purposes.value[id] === 'practice')
    learningQueue.value = []
    phase.value = 'main'
    index.value = 0
    flipped.value = false
    sessionStats.value = emptySessionStats()
    sessionSaved = false
    return true
  }

  function flip(): void {
    flipped.value = !flipped.value
  }

  async function rate(rating: Rating): Promise<void> {
    const currentDeck = deck.value
    const card = currentCard.value
    if (!currentDeck || !card || !flipped.value) return
    if (!practiceReady(currentDeck, card.id)) return

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

    const finished = complete.value
    flipped.value = false
    if (finished) await saveSessions()

    // Keep unsaved progress in memory; the global persistence notice stays visible.
    if (!finished) await library.persist().catch(() => undefined)
  }

  async function saveSessions(): Promise<void> {
    const currentDeck = deck.value
    if (!currentDeck || sessionSaved || !sessionStats.value.reviewed) return
    currentDeck.sessions ||= []
    currentDeck.sessions.push({ date: todayStr(), ...sessionStats.value, practice: practiceSession.value })
    if (currentDeck.sessions.length > 90) currentDeck.sessions = currentDeck.sessions.slice(-90)
    sessionSaved = true
    // Keep history in memory on failure, without appending it again on retry.
    await library.persist().catch(() => undefined)
  }

  return {
    deckId,
    mainQueue,
    learningQueue,
    phase,
    index,
    flipped,
    currentPurpose,
    nextPracticeAt: computed(() => nextPracticeAt(deck.value ? [deck.value] : [])),
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
