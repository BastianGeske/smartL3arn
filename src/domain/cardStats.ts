import type { CardStats, Deck } from './types'

export function cardStatsFor(deck: Deck, cardId: string): CardStats {
  deck.cardStats ||= Object.create(null) as Record<string, CardStats>
  if (Object.prototype.hasOwnProperty.call(deck.cardStats, cardId)) return deck.cardStats[cardId]
  const stats = { reviews: 0, again: 0, hard: 0 }
  if (cardId === '__proto__') {
    Object.defineProperty(deck.cardStats, cardId, { value: stats, enumerable: true, writable: true, configurable: true })
  } else {
    deck.cardStats[cardId] = stats
  }
  return deck.cardStats[cardId]
}
