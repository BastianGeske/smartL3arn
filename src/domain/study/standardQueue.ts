import { isDue, todayStr } from '../dates'
import type { Deck } from '../types'

export function shuffleInPlace<T>(items: T[], random = Math.random): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[items[index], items[other]] = [items[other], items[index]]
  }
  return items
}

export function buildStandardQueue(
  deck: Deck,
  today = todayStr(),
  random = Math.random,
): string[] {
  const overdue = deck.cards
    .filter((card) => isDue(card, today) && card.dueDate && card.dueDate < today)
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map((card) => card.id)
  shuffleInPlace(overdue, random)

  const dueToday = deck.cards
    .filter((card) => isDue(card, today) && (!card.dueDate || card.dueDate === today))
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map((card) => card.id)
  shuffleInPlace(dueToday, random)

  const queue = [...overdue, ...dueToday]
  if (queue.length) return queue
  return shuffleInPlace(deck.cards.map((card) => card.id), random)
}
