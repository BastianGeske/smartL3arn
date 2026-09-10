import { describe, expect, it } from 'vitest'
import type { Deck, SmartConfig } from '../types'
import { buildSmartStudyQueue } from './smartQueue'
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
}

describe('study queues', () => {
  it('places overdue cards before cards due today', () => {
    const source = deck('a', ['2026-08-03', '2026-08-01'])
    const queue = buildStandardQueue(source, '2026-08-03', () => 0.5)

    expect(queue).toEqual(['a-1', 'a-0'])
  })

  it('falls back to a voluntary practice queue when nothing is due', () => {
    const source = deck('a', ['2026-08-10', '2026-08-11'])
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
})
