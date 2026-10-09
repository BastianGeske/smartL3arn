import { describe, expect, it } from 'vitest'
import type { Deck, SmartConfig } from '../types'
import { buildSmartStudyQueue, smartCoreCardsForDeck } from './smartQueue'
import { buildStandardQueue } from './standardQueue'

const deck = (id: string, dates: string[]): Deck => ({
  id,
  name: id,
  cards: dates.map((dueDate, index) => ({
    id: `${id}-${index}`,
    front: `Q${index}`,
    back: `A${index}`,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    dueDate,
  })),
})

const config: SmartConfig = {
  deckIds: ['a', 'b'],
  techniques: {
    typeRecall: true,
    confidenceCheck: true,
    whyPrompt: false,
    interleaving: true,
  },
  duration: 25,
  evaluationMode: 'local',
}

const sequence = (...values: number[]) => {
  let index = 0
  return () => values[index++] ?? 0.5
}

describe('study queues', () => {
  it('places overdue cards before cards due today', () => {
    const source = deck('a', ['2026-08-03', '2026-08-01'])
    const queue = buildStandardQueue(source, '2026-08-03', () => 0.5)

    expect(queue).toEqual(['a-1', 'a-0'])
  })

  it('falls back to a voluntary practice queue when nothing is due', () => {
    const source = deck('a', ['2999-08-10', '2999-08-11'])
    const result = buildSmartStudyQueue([source], config, () => 0.5)

    expect(result.mode).toBe('practice')
    expect(result.queue).toHaveLength(2)
  })

  it('interleaves selected decks', () => {
    const result = buildSmartStudyQueue(
      [deck('a', ['2026-08-03', '2026-08-03']), deck('b', ['2026-08-03', '2026-08-03'])],
      config,
      () => 0.5,
    )

    expect(result.queue.map((item) => item.deckId)).toEqual(['a', 'b', 'a', 'b'])
  })

  it.each(['2026-08-01', '2026-08-03', '2999-08-03'])(
    'shuffles standard overdue, due and practice cards (%s) without changing the deck',
    (dueDate) => {
      const source = deck('a', [dueDate, dueDate, dueDate])
      const before = structuredClone(source)
      const first = buildStandardQueue(source, '2026-08-03', () => 0)
      const second = buildStandardQueue(source, '2026-08-03', () => 0.99)
      expect(first).not.toEqual(second)
      expect([...first].sort()).toEqual(['a-0', 'a-1', 'a-2'])
      expect([...second].sort()).toEqual([...first].sort())
      expect(source).toEqual(before)
    },
  )

  it.each(['2000-01-01', '2999-01-01'])(
    'varies smart card order even with different weakness scores in core/practice (%s)',
    (dueDate) => {
      const source = deck('a', [dueDate, dueDate, dueDate])
      source.cards.forEach((card, index) => { card.difficulty = index * 4 + 1 })
      source.cardStats = { 'a-2': { reviews: 10, again: 8, hard: 2 } }
      const before = structuredClone(source)
      const first = buildSmartStudyQueue([source], config, sequence(0.01, 0.5, 0.99))
      const second = buildSmartStudyQueue([source], config, sequence(0.99, 0.5, 0.01))
      expect(first.queue.map((item) => item.cardId)).toEqual(['a-0', 'a-1', 'a-2'])
      expect(second.queue.map((item) => item.cardId)).toEqual(['a-2', 'a-1', 'a-0'])
      expect(source).toEqual(before)
    },
  )

  it('keeps smart overdue, extra practice and due/new priorities when shuffling', () => {
    const source = deck('a', ['2026-08-03', '2999-08-03', '2026-08-01', '2999-08-04', ''])
    source.cardStats = { 'a-1': { reviews: 1, again: 1, hard: 0, smartNeedsPractice: true } }
    const cards = smartCoreCardsForDeck(source, '2026-08-03', sequence(0.01, 0.99, 0.5, 0.1))
    expect(cards.map((card) => card.id)).toEqual(['a-2', 'a-1', 'a-4', 'a-0'])
  })

  it.each([true, false])('varies the starting deck while preserving interleaving=%s', (interleaving) => {
    const sources = [deck('a', ['2000-01-01', '2000-01-01']), deck('b', ['2000-01-01'])]
    const before = structuredClone(sources)
    const settings = { ...config, techniques: { ...config.techniques, interleaving } }
    const first = buildSmartStudyQueue(sources, settings, sequence(0.1, 0.2, 0.3, 0.99))
    const second = buildSmartStudyQueue(sources, settings, sequence(0.1, 0.2, 0.3, 0))
    expect(first.queue.map((item) => item.deckId)).toEqual(interleaving ? ['a', 'b', 'a'] : ['a', 'a', 'b'])
    expect(second.queue.map((item) => item.deckId)).toEqual(['b', 'a', 'a'])
    expect(second.queue.map((item) => item.cardId).sort()).toEqual(['a-0', 'a-1', 'b-0'])
    expect(sources).toEqual(before)
  })
})
