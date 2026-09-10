import { isDue, todayStr } from '../dates'
import type { Card, Deck, SmartConfig, SmartQueueItem } from '../types'

export function isSmartNeedsPracticeCard(deck: Deck, cardId: string): boolean {
  return deck.cardStats?.[cardId]?.smartNeedsPractice === true
}

function smartWeaknessScore(deck: Deck, card: Card): number {
  const stats = deck.cardStats?.[card.id]
  const reviews = stats?.reviews || 0
  const againRate = reviews ? (stats?.again || 0) / reviews : 0
  const hardRate = reviews ? (stats?.hard || 0) / reviews : 0
  const difficulty = (card.difficulty || 5) / 10
  const focusBonus = isSmartNeedsPracticeCard(deck, card.id) ? 2 : 0
  return focusBonus + againRate + hardRate * 0.5 + difficulty * 0.25
}

function sortSmartCards(deck: Deck, cards: Card[], random = Math.random): Card[] {
  return cards
    .map((card) => ({ card, score: smartWeaknessScore(deck, card), tie: random() }))
    .sort((left, right) => (right.score - left.score) || (left.tie - right.tie))
    .map((item) => item.card)
}

export function smartCoreCardsForDeck(
  deck: Deck,
  today = todayStr(),
  random = Math.random,
): Card[] {
  const overdue: Card[] = []
  const focus: Card[] = []
  const dueToday: Card[] = []

  deck.cards.forEach((card) => {
    const due = isDue(card, today)
    if (due && card.dueDate && card.dueDate < today) overdue.push(card)
    else if (due) dueToday.push(card)
    else if (isSmartNeedsPracticeCard(deck, card.id)) focus.push(card)
  })

  return [
    ...sortSmartCards(deck, overdue, random),
    ...sortSmartCards(deck, focus, random),
    ...sortSmartCards(deck, dueToday, random),
  ]
}

interface SmartBucket {
  deckId: string
  cards: Card[]
}

export function buildSmartQueueFromBuckets(
  sourceBuckets: SmartBucket[],
  interleaving: boolean,
): SmartQueueItem[] {
  const buckets = sourceBuckets.map((bucket) => ({ ...bucket, cards: [...bucket.cards] }))
  if (!interleaving) {
    return buckets.flatMap((bucket) => bucket.cards.map((card) => ({
      deckId: bucket.deckId,
      cardId: card.id,
    })))
  }

  const queue: SmartQueueItem[] = []
  let added = true
  while (added) {
    added = false
    buckets.forEach((bucket) => {
      const card = bucket.cards.shift()
      if (!card) return
      queue.push({ deckId: bucket.deckId, cardId: card.id })
      added = true
    })
  }
  return queue
}

export function buildSmartStudyQueue(
  selectedDecks: Deck[],
  config: SmartConfig,
  random = Math.random,
): { queue: SmartQueueItem[]; mode: 'core' | 'practice'; hasCore: boolean } {
  const coreBuckets = selectedDecks
    .map((deck) => ({
      deckId: deck.id,
      cards: smartCoreCardsForDeck(deck, todayStr(), random),
    }))
    .filter((bucket) => bucket.cards.length > 0)

  const hasCore = coreBuckets.length > 0
  const buckets = hasCore
    ? coreBuckets
    : selectedDecks
      .map((deck) => ({
        deckId: deck.id,
        cards: sortSmartCards(deck, [...deck.cards], random),
      }))
      .filter((bucket) => bucket.cards.length > 0)

  return {
    queue: buildSmartQueueFromBuckets(buckets, config.techniques.interleaving),
    mode: hasCore ? 'core' : 'practice',
    hasCore,
  }
}
