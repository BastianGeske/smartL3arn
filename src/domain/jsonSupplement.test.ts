import { describe, expect, it } from 'vitest'
import { planJsonSupplement, SupplementError } from './jsonSupplement'
import { createCard } from './importExport'
import type { Deck } from './types'

function fixture(): Deck {
  return { id: 'deck', name: 'Original', cards: [
    { ...createCard('Question', 'Old answer'), id: 'old', interval: 20, repetitions: 8, stability: 12, difficulty: 4, lastReview: '2026-11-12' },
    { ...createCard('Unchanged question', 'Unchanged answer'), id: 'untouched' },
  ], cardStats: { old: { reviews: 8, again: 1, hard: 2 } } }
}
describe('JSON supplements', () => {
  it('updates by ID, adds cards and ignores imported learning data without changing the source', () => {
    const deck = fixture(), original = JSON.stringify(deck)
    const plan = planJsonSupplement(deck, { name: 'Ignored', cards: [
      { id: 'old', front: 'Better question', back: 'Better answer', interval: 0, repetitions: 0 },
      { id: 'new', front: 'New question', back: 'New answer', repetitions: 99, stability: 10 },
    ] })
    expect(plan).toMatchObject({ added: 1, updated: 1, unchanged: 0 })
    expect(plan.cards[0]).toEqual({ ...deck.cards[0], front: 'Better question', back: 'Better answer' })
    expect(plan.cards[1]).toEqual(deck.cards[1])
    expect(plan.cards[2]).toMatchObject({ id: 'new', interval: 0, repetitions: 0 })
    expect(plan.cards[2]!.stability).toBeUndefined()
    expect(JSON.stringify(deck)).toBe(original)
  })
  it('matches an exact question without ID, preserves omitted fields and skips unchanged entries', () => {
    const deck = fixture()
    const plan = planJsonSupplement(deck, [{ front: 'Question', back: 'Extended answer' }, { id: 'untouched' }])
    expect(plan).toMatchObject({ added: 0, updated: 1, unchanged: 1 })
    expect(plan.changes[0]).toMatchObject({ before: { id: 'old' }, after: { id: 'old', front: 'Question', back: 'Extended answer' } })
    expect(planJsonSupplement(deck, [{ front: 'question', back: 'Different case' }]).added).toBe(1)
  })
  it('uses IDs before question matching, including new IDs with the same question', () => {
    expect(planJsonSupplement(fixture(), [{ id: 'another', front: 'Question', back: 'Answer' }])).toMatchObject({ added: 1, updated: 0 })
  })
  it('retains, replaces, and explicitly removes complete task definitions', () => {
    const deck = fixture()
    deck.cards[0] = { ...deck.cards[0]!, task: { kind: 'true_false', correct: true }, back: 'True' }
    expect(planJsonSupplement(deck, [{ id: 'old', front: 'Updated claim' }]).cards[0]!.task).toEqual(deck.cards[0]!.task)
    const replacement = planJsonSupplement(deck, [{ id: 'old', task: { kind: 'true_false', correct: false, explanation: 'Reason' } }])
    expect(replacement.cards[0]!.task).toMatchObject({ correct: false, explanation: 'Reason' })
    expect(replacement.cards[0]!.back).toContain('Reason')
    const removed = planJsonSupplement(deck, [{ id: 'old', back: 'Text answer', task: null }])
    expect(removed.cards[0]!.task).toBeUndefined()
    expect(removed.cards[0]!.back).toBe('Text answer')
  })
  it('rejects ambiguous questions while allowing explicit ID targeting', () => {
    const deck = fixture(); deck.cards.push({ ...deck.cards[0]!, id: 'duplicate-question' })
    expect(() => planJsonSupplement(deck, [{ front: 'Question', back: 'Updated' }])).toThrowError(expect.objectContaining({ key: 'supplement.ambiguous' }))
    expect(planJsonSupplement(deck, [{ id: 'old', back: 'Updated' }]).updated).toBe(1)
  })
  it.each([
    [{ id: 'old', back: 'One' }, { front: 'Question', back: 'Two' }],
    [{ id: 'new', front: 'New', back: 'One' }, { id: 'new', front: 'Other', back: 'Two' }],
    [{ front: 'New', back: 'One' }, { front: 'New', back: 'Two' }],
  ])('rejects duplicate targets atomically: %j', (...rows) => {
    expect(() => planJsonSupplement(fixture(), rows)).toThrowError(expect.objectContaining({ key: 'supplement.duplicate' }))
  })
  it.each([
    { decks: [] }, { cards: [] }, { cards: [null] }, [{ id: 'missing', back: 'Partial' }],
    [{ id: '__proto__', front: 'Q', back: 'A' }], [{ id: 12, front: 'Q', back: 'A' }],
    [{ front: 'New', back: ' ' }], [{ id: 'old', front: null }],
    [{ id: 'old', task: { kind: 'unknown' } }], [{ id: 'old', back: 'a'.repeat(20_001) }],
  ].map(payload => ({ payload })))('rejects invalid input without modifying the deck: %j', ({ payload }) => {
    const deck = fixture(), original = JSON.stringify(deck)
    expect(() => planJsonSupplement(deck, payload)).toThrow(SupplementError)
    expect(JSON.stringify(deck)).toBe(original)
  })
  it('is idempotent when re-importing the same additions', () => {
    const deck = fixture(), payload = [{ front: 'New', back: 'New answer' }, { id: 'old', back: 'Revised answer' }]
    deck.cards = planJsonSupplement(deck, payload).cards
    expect(planJsonSupplement(deck, payload)).toMatchObject({ added: 0, updated: 0, unchanged: 2, changes: [] })
  })
})


it('rejects net additions above the whole-library limit while allowing updates at capacity', () => {
  const deck = { id: 'deck', name: 'Test', cards: [createCard('Existing', 'Original')] }
  const additions = Array.from({ length: 11_000 }, (_, index) => ({ id: 'new' + index, front: 'Q', back: 'A' }))
  expect(() => planJsonSupplement(deck, additions, 90_000)).toThrowError(expect.objectContaining({ key: 'supplement.cardLimit' }))
  expect(planJsonSupplement(deck, [{ id: deck.cards[0].id, back: 'Revised' }], 100_000).updated).toBe(1)
})
