import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { useUiStore } from './ui'
import { useStudyStore } from './study'
import { planJsonSupplement } from '../domain/jsonSupplement'
const repo = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('../services/storage', () => ({ getStorageRepository: () => repo }))
let pinia: ReturnType<typeof createPinia>
const payload = [{ id: 'card', back: 'Revised' }, { front: 'New', back: 'Answer' }]
beforeEach(() => {
  pinia = createPinia(); setActivePinia(pinia)
  repo.load.mockResolvedValue({ decks: [{ id: 'deck', name: 'D', smartSessionSeq: 5,
    cards: [{ id: 'card', front: 'Q', back: 'A', repetitions: 7, interval: 15, stability: 12, dueDate: '2026-11-12' }],
    cardStats: { card: { reviews: 9, again: 1, hard: 2, elaborations: [{ date: '2026-11-12', text: 'My explanation' }] } },
    sessions: [{ date: '2026-11-12', reviewed: 1, again: 0, hard: 0, good: 1, easy: 0 }],
  }] })
  repo.save.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { disposePinia(pinia) })
async function setup() {
  const library = useLibraryStore(); await library.hydrate()
  const plan = planJsonSupplement(library.decks[0]!, payload)
  return { library, plan }
}
it('saves the entire supplement once and retains deck metadata, scheduling, statistics and sessions', async () => {
  const { library, plan } = await setup(), before = JSON.parse(JSON.stringify(library.decks[0]))
  await library.applyJsonSupplement('deck', payload, plan.source)
  expect(repo.save).toHaveBeenCalledTimes(1)
  expect(library.decks[0]).toMatchObject({ ...before, cards: [{ ...before.cards[0], back: 'Revised' }, expect.objectContaining({ front: 'New', repetitions: 0 })] })
})
it('keeps the original on failure and allows retrying the same preview', async () => {
  const { library, plan } = await setup(), before = JSON.stringify(library.data)
  repo.save.mockRejectedValueOnce(new Error('Disk full'))
  await expect(library.applyJsonSupplement('deck', payload, plan.source)).rejects.toThrow('Disk full')
  expect(JSON.stringify(library.data)).toBe(before)
  expect(library.persistenceIssue).toBe('save'); expect(library.transactionBusy).toBe(false)
  await library.applyJsonSupplement('deck', payload, plan.source)
  expect(library.decks[0]!.cards).toHaveLength(2)
  expect(library.persistenceIssue).toBeNull()
})
it('rejects a stale preview or active study without writing', async () => {
  const { library, plan } = await setup()
  library.decks[0]!.cards[0]!.back = 'Manually changed'
  await expect(library.applyJsonSupplement('deck', payload, plan.source)).rejects.toMatchObject({ key: 'supplement.stale' })
  useUiStore().studyActive = true
  await expect(library.applyJsonSupplement('deck', payload, plan.source)).rejects.toMatchObject({ key: 'supplement.studyActive' })
  expect(repo.save).not.toHaveBeenCalled()
})
it('blocks conflicting writes and study starts and publishes only after a successful save', async () => {
  const { library, plan } = await setup()
  let release!: () => void
  repo.save.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const pending = library.applyJsonSupplement('deck', payload, plan.source)
  await vi.waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1))
  expect(library.decks[0]!.cards[0]!.back).toBe('A')
  await expect(library.addCard('deck', 'Other', 'Answer')).rejects.toThrow('transaction')
  expect(useStudyStore().start('deck')).toBe(false)
  release(); await pending
  expect(library.decks[0]!.cards[0]!.back).toBe('Revised')
})
it('waits for pending saves and keeps later learning progress', async () => {
  const { library, plan } = await setup()
  let release!: () => void
  repo.save.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  library.decks[0]!.cards[0]!.interval = 30
  const earlier = library.persist()
  await vi.waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1))
  const pending = library.applyJsonSupplement('deck', payload, plan.source)
  expect(repo.save).toHaveBeenCalledTimes(1)
  release(); await earlier; await pending
  expect(library.decks[0]!.cards[0]!.interval).toBe(30)
  expect(repo.save).toHaveBeenCalledTimes(2)
})
