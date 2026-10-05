import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, test } from 'vitest'
import { importJsonFile } from '../../src/services/importer'
import { deckToCsv } from '../../src/domain/importExport'
import { useLibraryStore } from '../../src/stores/library'
import { useStudyStore } from '../../src/stores/study'

// Regression checks updated after the fixes; the original findings are preserved in REPORT.md.
afterEach(() => {
  for (const key of ['reviews', 'again', 'hard']) Reflect.deleteProperty(Object.prototype, key)
  localStorage.clear()
})

test('a reserved backup card ID cannot mutate Object.prototype when rated', async () => {
  setActivePinia(createPinia())
  const file = { name: 'untrusted.json', text: async () => JSON.stringify({
    name: 'Audit fixture', cards: [{ id: '__proto__', front: 'Question', back: 'Answer', dueDate: '2000-01-01' }],
  }) } as File
  const [deck] = await importJsonFile(file)
  const library = useLibraryStore()
  await library.hydrate()
  await library.addDeck(deck)
  const study = useStudyStore()
  expect(study.start(deck.id)).toBe(true)
  expect(Object.hasOwn(Object.prototype, 'reviews')).toBe(false)
  await study.rate(2)
  expect(deck.cards[0].id).not.toBe('__proto__')
  expect(Object.hasOwn(Object.prototype, 'reviews')).toBe(false)
})

test('CSV export neutralizes spreadsheet formulas', () => {
  const csv = deckToCsv({ id: 'audit', name: 'Audit fixture', cards: [{
    id: 'card', front: '=1+1', back: 'Answer', interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: '2000-01-01',
  }] })
  expect(csv).toContain(`\n"'=1+1",Answer`)
})

test('import rejects invalid statistics and oversized card strings', async () => {
  const file = { name: 'untrusted.json', text: async () => JSON.stringify({
    name: 'Audit fixture', cardStats: 'invalid', sessions: 'invalid',
    cards: [{ id: 'card', front: 'x'.repeat(100_000), back: 'Answer' }],
  }) } as File
  await expect(importJsonFile(file)).rejects.toThrow()
})
