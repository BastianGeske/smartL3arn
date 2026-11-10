import { practiceReady } from './practice'
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
  const cards = deck.cards.filter(card => practiceReady(deck, card.id))
  const overdue = cards
    .filter((card) => isDue(card, today) && card.dueDate && card.dueDate < today)
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map((card) => card.id)
  shuffleInPlace(overdue, random)

  const dueToday = cards
    .filter((card) => isDue(card, today) && (!card.dueDate || card.dueDate === today))
    .sort((a, b) => (b.difficulty || 5) - (a.difficulty || 5))
    .map((card) => card.id)
  shuffleInPlace(dueToday, random)

  const focus = cards.filter(card => !isDue(card, today) && deck.cardStats?.[card.id]?.smartNeedsPractice).map(card => card.id)
  const queue = [...overdue, ...focus, ...dueToday]
  if (queue.length) return queue
  return shuffleInPlace(cards.map((card) => card.id), random)
}
