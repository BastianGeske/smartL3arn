import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { useStudyStore } from './study'
import { BrowserStorage } from '../services/storage/browserStorage'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => { disposePinia(pinia); vi.restoreAllMocks() })

it.each(['edit', 'rating'] as const)('keeps a rolled-back deletion on disk across a queued %s', async action => {
  const library = useLibraryStore()
  await library.hydrate()
  const deck = await library.createDeck('Concurrent')
  const a = (await library.addCard(deck.id, 'A', 'Original'))!
  const b = (await library.addCard(deck.id, 'B', 'Original'))!
  const study = useStudyStore()
  study.start(deck.id)
  study.mainQueue = [b.id]
  study.flip()

  let fail!: (error: Error) => void
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
    .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject }))
  const deleting = library.deleteCard(deck.id, a.id)
  const later = action === 'edit'
    ? library.updateCard(deck.id, b.id, { front: 'B', back: 'Edited' })
    : study.rate(2)
  expect(save).toHaveBeenCalledOnce()
  expect(study.sessionStats.reviewed).toBe(0)
  expect(b.back).toBe('Original')
  fail(new Error('Disk full'))
  await expect(deleting).rejects.toThrow('Disk full')
  await later

  const saved = (await new BrowserStorage().load()).decks[0]
  expect(saved.cards.map(card => card.id)).toEqual([a.id, b.id])
  if (action === 'edit') expect(saved.cards[1].back).toBe('Edited')
  else {
    expect(saved.cards[1].repetitions).toBe(1)
    expect(saved.sessions).toMatchObject([{ reviewed: 1, good: 1 }])
  }
})
