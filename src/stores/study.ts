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
import { cardStatsFor } from '../domain/cardStats'

export const useStudyStore = defineStore('study', () => {
  const library = useLibraryStore()
  const deckId = ref<string | null>(null)
  const mainQueue = ref<string[]>([])
  const learningQueue = ref<string[]>([])
  const phase = ref<'main' | 'learning'>('main')
  const index = ref(0)
  const flipped = ref(false)
  const sessionStats = ref<SessionStats>(emptySessionStats())

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
    const nextDeck = library.deckById(nextDeckId)
    if (!nextDeck?.cards.length) return false
    deckId.value = nextDeckId
    mainQueue.value = buildStandardQueue(nextDeck)
    learningQueue.value = []
    phase.value = 'main'
    index.value = 0
    flipped.value = false
    sessionStats.value = emptySessionStats()
    return true
  }

  function flip(): void {
    flipped.value = !flipped.value
  }

  async function rate(rating: Rating): Promise<void> {
    const currentDeck = deck.value
    const card = currentCard.value
    if (!currentDeck || !card) return

    const key = ratingKey(rating)
    sessionStats.value.reviewed += 1
    sessionStats.value[key] += 1
    const cardIndex = currentDeck.cards.findIndex((item) => item.id === card.id)
    currentDeck.cards[cardIndex] = scheduleCard(card, rating)

    const stats = cardStatsFor(currentDeck, card.id)
    stats.reviews += 1
    if (rating === 0) stats.again += 1
    if (rating === 1) stats.hard += 1

    if (rating === 0) learningQueue.value.push(card.id)
    index.value += 1

    if (
      phase.value === 'main'
      && index.value >= mainQueue.value.length
      && learningQueue.value.length > 0
    ) {
      phase.value = 'learning'
      index.value = 0
    }

    if (complete.value) {
      currentDeck.sessions ||= []
      currentDeck.sessions.push({ date: todayStr(), ...sessionStats.value })
      if (currentDeck.sessions.length > 90) {
        currentDeck.sessions = currentDeck.sessions.slice(-90)
      }
    }

    flipped.value = false
    await library.persist()
  }

  return {
    deckId,
    mainQueue,
    learningQueue,
    phase,
    index,
    flipped,
    sessionStats,
    deck,
    currentCard,
    complete,
    start,
    flip,
    rate,
  }
})
