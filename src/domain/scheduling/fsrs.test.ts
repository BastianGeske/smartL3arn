import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { previewIntervals, scheduleCard } from './fsrs'

const newCard = (): Card => ({
  id: 'card-1',
  front: 'Question',
  back: 'Answer',
  interval: 0,
  repetitions: 0,
  easeFactor: 2.5,
  dueDate: '2026-08-03',
})

describe('FSRS scheduling', () => {
  it('initializes a new card and schedules it after a good rating', () => {
    const scheduled = scheduleCard(newCard(), 2, '2026-08-03')

    expect(scheduled.stability).toBeGreaterThan(0)
    expect(scheduled.difficulty).toBeGreaterThanOrEqual(1)
    expect(scheduled.dueDate).toBe('2026-08-06')
    expect(scheduled.repetitions).toBe(1)
  })

  it('resets repetitions and uses a one-day interval after again', () => {
    const reviewed = {
      ...newCard(),
      stability: 4,
      difficulty: 5,
      lastReview: '2026-08-01',
      repetitions: 4,
    }
    const scheduled = scheduleCard(reviewed, 0, '2026-08-03')

    expect(scheduled.interval).toBe(1)
    expect(scheduled.dueDate).toBe('2026-08-04')
    expect(scheduled.repetitions).toBe(0)
  })

  it('shows the actual intervals for a new card', () => {
    expect(previewIntervals(newCard(), '2026-08-03')).toEqual(['1d', '1d', '3d', '15d'])
  })

  it.each([0, 4, 80])('matches previews to saved due dates with stability %s', (stability) => {
    const card = { ...newCard(), stability, difficulty: 5, lastReview: '2026-08-01' }
    const previews = previewIntervals(card, '2026-08-03')
    const original = { ...card }
    for (const rating of [0, 1, 2, 3] as const) {
      const scheduled = scheduleCard(card, rating, '2026-08-03')
      const dueDays = (Date.parse(scheduled.dueDate) - Date.parse('2026-08-03')) / 86_400_000
      expect(previews[rating]).toBe(dueDays < 30 ? `${dueDays}d` : `${Math.round(dueDays / 30)}mo`)
    }
    expect(card).toEqual(original)
  })
})

// Numerical reference values from FSRS-5 equations, with this project's retained weights.
describe('FSRS-5 reference cases', () => {
  it.each([[0, 1.5031], [1, 2.5195], [2, 4.2233], [3, 7.0793]])('uses the same-day equation for rating %s', (rating, expected) => {
    const card = { ...newCard(), stability: 3, difficulty: 5, lastReview: '2026-08-03' }
    expect(scheduleCard(card, rating as 0 | 1 | 2 | 3, '2026-08-03').stability).toBeCloseTo(expected, 3)
  })
  it('damps difficulty changes instead of applying the full delta', () => {
    const card = { ...newCard(), stability: 3.1262, difficulty: 5.3146, lastReview: '2026-08-03' }
    expect(scheduleCard(card, 1, '2026-08-03').difficulty).toBe(5.7097)
    expect(scheduleCard(card, 3, '2026-08-03').stability).toBe(7.3771)
  })
})


describe('calendar boundaries', () => {
  it.each([['2026-03-28', '2026-03-29'], ['2026-10-24', '2026-10-25'], ['2026-12-31', '2027-01-01']])('uses calendar days from %s to %s', (previous, today) => {
    const card = { ...newCard(), stability: 3, difficulty: 5, lastReview: previous }
    const result = scheduleCard(card, 2, today)
    expect(result.stability).toBeGreaterThan(3)
    expect(result.lastReview).toBe(today)
    expect(result.dueDate > today).toBe(true)
    expect(card.lastReview).toBe(previous)
  })
})
