import type { Card, Deck, Rating, StudyPurpose } from '../types'
import { isDue, todayStr } from '../dates'
import { cardStatsFor } from '../cardStats'

export const PRACTICE_DELAY_MS = 10 * 60_000
export const retryLimit = (rating: Rating) => rating === 0 ? 2 : rating === 1 ? 1 : 0
export function practiceReady(deck: Deck, cardId: string, now = Date.now()): boolean {
  return (deck.cardStats?.[cardId]?.practiceAvailableAt || 0) <= now
}
export function studyPurpose(deck: Deck, card: Card, today = todayStr()): StudyPurpose {
  return isDue(card, today) ? 'review' : deck.cardStats?.[card.id]?.smartNeedsPractice ? 'relearning' : 'practice'
}
export function recordPractice(deck: Deck, card: Card, rating: Rating, purpose: StudyPurpose, now = Date.now()): void {
  const stats = cardStatsFor(deck, card.id)
  stats.reviews += 1
  if (rating === 0) stats.again += 1
  if (rating === 1) stats.hard += 1
  if (rating <= 1) stats.practiceAvailableAt = now + PRACTICE_DELAY_MS
  else delete stats.practiceAvailableAt
  if (purpose !== 'practice') {
    if (rating <= 1) stats.smartNeedsPractice = true
    else delete stats.smartNeedsPractice
  }
}
/** Select only between attempts: never replace an answer currently being edited. */
export function advanceReady<T>(queue: T[], index: number, ready: (item: T) => boolean): void {
  const next = queue.findIndex((item, i) => i >= index && ready(item))
  if (next < 0) queue.splice(index)
  else if (next !== index) queue.splice(index, 0, queue.splice(next, 1)[0]!)
}
export function nextPracticeAt(decks: Deck[], now = Date.now()): number | null {
  const times = decks.flatMap(deck => deck.cards.map(card => deck.cardStats?.[card.id]?.practiceAvailableAt || 0)).filter(time => time > now)
  return times.length ? Math.min(...times) : null
}
