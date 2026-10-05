import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test } from 'vitest'
import { importJsonFile, importTextFile } from './importer'
import { csvEscape } from '../domain/importExport'
import { cardStatsFor } from '../domain/cardStats'
import { normalizeAppData, MAX_FILE_BYTES } from '../../shared/data-validation.mjs'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
const card = { front: 'Question', back: 'Answer', dueDate: '2000-01-01' }
const file = (value: unknown) => new File([JSON.stringify(value)], 'backup.json')

test.each(['__proto__', 'constructor', 'prototype'])('reserved ID %s is repaired without global mutations', async id => {
  const [deck] = await importJsonFile(file({ name: 'Test', cards: [{ ...card, id }] }))
  expect(deck.cards[0].id).not.toBe(id)
  const library = useLibraryStore()
  await library.hydrate()
  await library.addDeck(deck)
  const study = useStudyStore()
  study.start(deck.id)
  await study.rate(2)
  expect(Object.hasOwn(Object.prototype, 'reviews')).toBe(false)
  expect(deck.cardStats?.[deck.cards[0].id]?.reviews).toBe(1)
})
test('statistics access is safe even before IDs have been normalized', () => {
  const deck = { id: 'deck', name: 'Test', cards: [], cardStats: {} }
  cardStatsFor(deck, '__proto__').reviews++
  expect(Object.hasOwn(deck.cardStats, '__proto__')).toBe(true)
  expect(Object.hasOwn(Object.prototype, 'reviews')).toBe(false)
})
test.each([{ sessions: 'invalid' }, { cardStats: 'invalid' }, { cards: [{ ...card, front: 'x'.repeat(20_001) }] }])('malformed backup is rejected', async extra => {
  await expect(importJsonFile(file({ name: 'Test', cards: [card], ...extra }))).rejects.toThrow()
})
test('backup schema drops unknown properties and repairs duplicate IDs', async () => {
  const [deck] = await importJsonFile(file({ name: 'Test', privateKey: 'discard', cards: [{ ...card, id: 'same' }, { ...card, id: 'same' }] }))
  expect(deck).not.toHaveProperty('privateKey')
  expect(new Set(deck.cards.map(c => c.id)).size).toBe(2)
})
test('oversized files are rejected before reading at both import entry points', async () => {
  let read = false
  const oversized = { size: MAX_FILE_BYTES + 1, text: async () => { read = true; return '' } } as File
  await expect(importJsonFile(oversized)).rejects.toThrow()
  await expect(importTextFile(oversized)).rejects.toThrow()
  expect(read).toBe(false)
})
test.each(['=1+1', ' +1', '-1', '@SUM(A1)', '\t=1+1', '\r=1+1'])('CSV neutralizes %j', value => {
  expect(csvEscape(value)).toBe(`"'${value}"`)
})
test('loading also normalizes reserved IDs and statistics maps', () => {
  const data = normalizeAppData({ decks: [{ id: '__proto__', name: 'Test', cards: [{ ...card, id: '__proto__' }] }] }, '2026-10-05')
  expect(data.decks[0].id).not.toBe('__proto__')
  expect(data.decks[0].cards[0].id).not.toBe('__proto__')
})
test('invalid saved data remains untouched and cannot be overwritten', async () => {
  const raw = '{"decks":[{"name":"broken","cards":"invalid"}]}'
  localStorage.setItem('ankiweb_v1', raw)
  const library = useLibraryStore()
  await library.hydrate()
  expect(library.ready).toBe(true)
  expect(library.saveError).toBeTruthy()
  await expect(library.createDeck('New')).rejects.toThrow()
  expect(localStorage.getItem('ankiweb_v1')).toBe(raw)
})
