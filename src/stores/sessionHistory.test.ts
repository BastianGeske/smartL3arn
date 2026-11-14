import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { useStudyStore } from './study'
import { useSmartStudyStore } from './smartStudy'

vi.mock('../services/native', () => ({ syncStatusBar: async () => undefined }))
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => { disposePinia(pinia); vi.restoreAllMocks() })

async function setup(mode: 'standard' | 'smart', practice = false) {
  const library = useLibraryStore()
  const deck = await library.createDeck('History')
  await library.addCard(deck.id, 'First', 'Answer')
  await library.addCard(deck.id, 'Second', 'Answer')
  if (practice) deck.cards.forEach(card => { card.dueDate = '2099-01-01' })
  const settings = useSettingsStore()
  settings.smartConfig.deckIds = [deck.id]
  settings.smartConfig.duration = 0
  const store = mode === 'standard' ? useStudyStore() : useSmartStudyStore()
  const start = () => mode === 'standard' ? useStudyStore().start(deck.id) : useSmartStudyStore().start()
  await start()
  const rate = async () => {
    if (mode === 'standard') useStudyStore().flip()
    else useSmartStudyStore().reveal()
    await store.rate(3)
  }
  return { library, deck, store, start, rate }
}

it.each(['standard', 'smart'] as const)('finalizes partial %s history once even if persistence fails', async mode => {
  const { library, deck, store, rate, start } = await setup(mode)
  await rate()
  const persist = vi.spyOn(library, 'persist').mockRejectedValue(new Error('Disk full'))
  await store.saveSessions()
  await store.saveSessions()
  expect(deck.sessions).toHaveLength(1)
  expect(deck.sessions![0]).toMatchObject({ reviewed: 1, easy: 1, practice: false })
  expect(persist).toHaveBeenCalledOnce()
  persist.mockRestore()
  await start()
  expect(mode === 'standard' ? useStudyStore().sessionStats.reviewed : useSmartStudyStore().session!.sessionStats.reviewed).toBe(0)
})

it.each(['standard', 'smart'] as const)('does not create empty %s history', async mode => {
  const { deck, store } = await setup(mode)
  await store.saveSessions()
  expect(deck.sessions || []).toHaveLength(0)
})

it.each(['standard', 'smart'] as const)('does not duplicate completed %s history', async mode => {
  const { deck, store, rate } = await setup(mode)
  await rate()
  await rate()
  await store.saveSessions()
  expect(deck.sessions).toHaveLength(1)
  expect(deck.sessions![0]).toMatchObject({ reviewed: 2, easy: 2 })
})

it.each(['resolve', 'reject'] as const)('keeps a restarted standard answer revealed when the previous save settles (%s)', async outcome => {
  const { library, deck, rate } = await setup('standard')
  const study = useStudyStore()
  await rate()
  let resolveSave!: () => void
  let rejectSave!: (error: Error) => void
  const pendingSave = new Promise<void>((resolve, reject) => {
    resolveSave = resolve
    rejectSave = reject
  })
  const persist = vi.spyOn(library, 'persist').mockReturnValueOnce(pendingSave)

  study.flip()
  const finishing = study.rate(3)
  expect.soft(study.complete).toBe(true)
  expect.soft(study.flipped).toBe(false)
  expect.soft(persist).toHaveBeenCalledOnce()

  expect.soft(study.start(deck.id)).toBe(true)
  study.flip()
  const newCardId = study.currentCard?.id
  const newStats = { ...study.sessionStats }
  expect.soft(newCardId).toBeDefined()
  expect.soft(study.flipped).toBe(true)

  if (outcome === 'resolve') resolveSave()
  else rejectSave(new Error('Disk full'))
  await finishing

  expect(study.flipped).toBe(true)
  expect(study.currentCard?.id).toBe(newCardId)
  expect(study.complete).toBe(false)
  expect(study.sessionStats).toEqual(newStats)
  expect(study.sessionStats.reviewed).toBe(0)
  await study.saveSessions()
  expect(deck.sessions).toHaveLength(1)
  expect(deck.sessions![0]).toMatchObject({ reviewed: 2, easy: 2, practice: false })
  expect(persist).toHaveBeenCalledOnce()
})

it.each(['standard', 'smart'] as const)('retains %s practice metadata', async mode => {
  const { deck, store, rate } = await setup(mode, true)
  await rate()
  await store.saveSessions()
  expect(deck.sessions![0]).toMatchObject({ reviewed: 1, practice: true, ...(mode === 'smart' ? { smart: true } : {}) })
})

it('finalizes Smart Study totals for surviving decks when another deck is deleted', async () => {
  const { library, deck, store } = await setup('smart')
  const other = await library.createDeck('Deleted')
  await library.addCard(other.id, 'Other', 'Answer')
  useSettingsStore().smartConfig.deckIds = [deck.id, other.id]
  const smart = useSmartStudyStore()
  await smart.start()
  // Review one card from each deck, leaving the third queued.
  smart.session!.queue.sort((a, b) => Number(b.deckId === other.id) - Number(a.deckId === other.id))
  smart.reveal(); await smart.rate(3)
  smart.reveal(); await smart.rate(2)
  library.decks.splice(library.decks.findIndex(item => item.id === other.id), 1)
  await store.saveSessions()
  await store.saveSessions()
  expect(deck.sessions).toHaveLength(1)
  expect(deck.sessions![0]).toMatchObject({ reviewed: 1, good: 1, smart: true })
})
