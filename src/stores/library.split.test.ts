import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { useUiStore } from './ui'
import { useStudyStore } from './study'
import { useSmartStudyStore } from './smartStudy'
import { matchingDrafts, type SplitDraft } from '../domain/splitMatching'
import type { AppData } from '../domain/types'
const repo = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('../services/storage', () => ({ getStorageRepository: () => repo }))
let pinia: ReturnType<typeof createPinia>
function fixture(): AppData { return { decks: [{ id: 'deck', name: 'D', cards: [{ id: 'source', front: 'Ordne zu', back: 'A → 1\nB → 2', task: { kind: 'matching', pairs: [{ id: 'a', left: 'A', right: '1' }, { id: 'b', left: 'B', right: '2' }], explanation: 'Context explanation' }, interval: 20, repetitions: 8, easeFactor: 2.5, dueDate: '2026-11-13', stability: 5 }], cardStats: { source: { reviews: 8, again: 1, hard: 2 } } }] } }
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); repo.load.mockResolvedValue(fixture()); repo.save.mockReset().mockResolvedValue(undefined) })
afterEach(() => { disposePinia(pinia) })
async function setup() { const library = useLibraryStore(); await library.hydrate(); const source = library.decks[0]!.cards[0]!; const drafts = matchingDrafts(source).map(draft => ({ ...draft, front: `Context: what matches ${draft.pairId}?` })); return { library, source, drafts } }
it('keeps the original and its history, saves once and gives each new card a fresh history', async () => {
  const { library, source, drafts } = await setup()
  const old = JSON.stringify(source)
  const created = await library.splitMatchingCard('deck', 'source', drafts)
  expect(repo.save).toHaveBeenCalledTimes(1)
  expect(library.decks[0]!.cards).toHaveLength(3)
  expect(JSON.stringify(library.decks[0]!.cards[0])).toBe(old)
  expect(library.decks[0]!.cardStats!.source!.reviews).toBe(8)
  expect(new Set(created.map(card => card.id)).size).toBe(2)
  for (const card of created) {
    expect(card.id).not.toBe(source.id); expect(card.repetitions).toBe(0); expect(card.interval).toBe(0)
    expect(card.stability).toBeUndefined(); expect(library.decks[0]!.cardStats![card.id]).toBeUndefined()
    expect(card.back).not.toContain('Context explanation')
  }
})
it('replaces the source and its per-card statistics only when explicitly requested', async () => {
  const { library, drafts } = await setup()
  const created = await library.splitMatchingCard('deck', 'source', drafts, true)
  expect(library.decks[0]!.cards.map(card => card.id)).toEqual(created.map(card => card.id))
  expect(library.decks[0]!.cardStats!.source).toBeUndefined()
  expect(repo.save.mock.calls[0]![0].decks[0].cards).toHaveLength(2)
})
it('preserves the entire original on a storage failure, including replacement and statistics', async () => {
  const { library, drafts } = await setup(); const before = JSON.stringify(library.data)
  repo.save.mockRejectedValue(new Error('Disk full'))
  await expect(library.splitMatchingCard('deck', 'source', drafts, true)).rejects.toThrow('Disk full')
  expect(JSON.stringify(library.data)).toBe(before)
  expect(library.transactionBusy).toBe(false)
})
it('does not publish partial cards while saving and prevents conflicting writes or study starts', async () => {
  const { library, drafts } = await setup()
  let release!: () => void
  repo.save.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
  const pending = library.splitMatchingCard('deck', 'source', drafts)
  await vi.waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1))
  expect(library.decks[0]!.cards).toHaveLength(1)
  await expect(library.addCard('deck', 'Q', 'A')).rejects.toThrow('transaction')
  expect(useStudyStore().start('deck')).toBe(false)
  expect(await useSmartStudyStore().start()).toBe(false)
  release(); await pending
  expect(library.decks[0]!.cards).toHaveLength(3)
})
it('rejects splitting during an active study session without a write', async () => {
  const { library, drafts } = await setup(); useUiStore().studyActive = true
  await expect(library.splitMatchingCard('deck', 'source', drafts)).rejects.toThrow('study')
  expect(repo.save).not.toHaveBeenCalled()
})
it('rejects stale source content and invalid or duplicate selected pairs without mutating data', async () => {
  const { library, drafts } = await setup(); const before = JSON.stringify(library.data)
  await expect(library.splitMatchingCard('deck', 'source', drafts, false, 'stale')).rejects.toThrow('changed')
  await expect(library.splitMatchingCard('deck', 'source', [{ ...drafts[0]!, pairId: 'unknown' }])).rejects.toThrow('pairs')
  await expect(library.splitMatchingCard('deck', 'source', [drafts[0]!, drafts[0]!])).rejects.toThrow('pairs')
  expect(repo.save).not.toHaveBeenCalled(); expect(JSON.stringify(library.data)).toBe(before)
  expect(library.persistenceIssue).toBeNull()
})
it.each<{ drafts: SplitDraft[] }>([{ drafts: [] }, { drafts: [{ pairId: 'a', selected: true, front: ' ', back: 'A' }] }])('does not save an empty or incomplete selection', async ({ drafts }) => {
  const { library } = await setup()
  await expect(library.splitMatchingCard('deck', 'source', drafts as SplitDraft[])).rejects.toThrow('Invalid')
  expect(repo.save).not.toHaveBeenCalled()
})

it('waits for an earlier save before constructing the atomic snapshot', async () => {
  const { library, drafts } = await setup()
  let release!: () => void
  repo.save.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const earlier = library.addCard('deck', 'A separate new fact?', 'Answer')
  await vi.waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1))
  const pending = library.splitMatchingCard('deck', 'source', drafts)
  expect(repo.save).toHaveBeenCalledTimes(1)
  release(); await earlier; await pending
  expect(repo.save).toHaveBeenCalledTimes(2)
  expect(library.decks[0]!.cards).toHaveLength(4)
  expect(repo.save.mock.calls[1]![0].decks[0].cards).toHaveLength(4)
})

it('schedules and reviews the new cards independently after splitting', async () => {
  const { library, drafts } = await setup()
  const created = await library.splitMatchingCard('deck', 'source', drafts)
  const study = useStudyStore()
  expect(study.start('deck')).toBe(true)
  expect(study.mainQueue).toEqual(expect.arrayContaining(created.map(card => card.id)))
  study.mainQueue = created.map(card => card.id); study.index = 0; study.flipped = true
  await study.rate(2)
  expect(library.decks[0]!.cards.find(card => card.id === created[0]!.id)!.repetitions).toBe(1)
  expect(library.decks[0]!.cards.find(card => card.id === created[1]!.id)!.repetitions).toBe(0)
  expect(library.decks[0]!.cards.find(card => card.id === 'source')!.repetitions).toBe(8)
})
