import { IDBDatabase, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserStorage, LibraryConflict } from './browserStorage'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())
const legacy = { decks: [{ id: 'original', name: 'Original', cards: [] }] }

it('migrates once even if two tabs first open a legacy library together', async () => {
  localStorage.setItem('ankiweb_v1', JSON.stringify(legacy))
  const first = new BrowserStorage(), second = new BrowserStorage()
  const snapshots = await Promise.all([first.load(), second.load()])
  expect(snapshots).toEqual([legacy, legacy])
  expect(localStorage.getItem('ankiweb_v1')).toBeNull()
  const changed = { decks: [...legacy.decks, { id: 'added', name: 'Added', cards: [] }] }
  await first.save(changed)
  await expect(second.save(legacy)).rejects.toBeInstanceOf(LibraryConflict)
  localStorage.setItem('ankiweb_v1', 'stale legacy data')
  expect(await second.load()).toEqual(changed)
  expect(localStorage.getItem('ankiweb_v1')).toBeNull()
  await second.save(changed)
  expect(await new BrowserStorage().load()).toEqual(changed)
})

it('commits only one of two simultaneous writes of the same revision', async () => {
  const tabs = [new BrowserStorage(), new BrowserStorage()]
  const snapshots = await Promise.all(tabs.map(tab => tab.load()))
  snapshots.forEach((data, i) => data.decks.push({ id: String(i), name: 'Deck ' + i, cards: [] }))
  const results = await Promise.allSettled(tabs.map((tab, i) => tab.save(snapshots[i])))
  const winner = results.findIndex(result => result.status === 'fulfilled')
  expect(winner).toBeGreaterThanOrEqual(0)
  expect(results[1 - winner]).toMatchObject({ status: 'rejected', reason: expect.any(LibraryConflict) })
  expect(await new BrowserStorage().load()).toEqual(snapshots[winner])
})

it('persists repaired IDs before returning the first migrated snapshot', async () => {
  localStorage.setItem('ankiweb_v1', JSON.stringify({ decks: [
    { id: 'original', cards: [
      { id: 'card', front: 'A', back: 'a' }, { id: 'card', front: 'B', back: 'b' },
      { id: 'bad id', front: 'C', back: 'c' }, { front: 'D', back: 'd' },
    ] },
    { id: 'original', cards: [] }, { id: 'bad id', cards: [] }, { cards: [] },
  ] }))
  const [first, second] = await Promise.all([new BrowserStorage().load(), new BrowserStorage().load()])
  const deckIds = first.decks.map(deck => deck.id)
  const cardIds = first.decks[0]!.cards.map(card => card.id)
  expect(new Set(deckIds).size).toBe(4)
  expect(new Set(cardIds).size).toBe(4)
  expect([...deckIds, ...cardIds].every(id => /^[\w-]+$/.test(id))).toBe(true)
  expect(second).toEqual(first)
  expect(await new BrowserStorage().load()).toEqual(first)
})

it('can retry migration after the legacy source is repaired', async () => {
  const tab = new BrowserStorage()
  localStorage.setItem('ankiweb_v1', 'invalid')
  await expect(tab.load()).rejects.toThrow()
  expect(localStorage.getItem('ankiweb_v1')).toBe('invalid')
  localStorage.setItem('ankiweb_v1', JSON.stringify(legacy))
  expect(await tab.load()).toEqual(legacy)
})

it('preserves the legacy library if IndexedDB aborts after the put succeeds', async () => {
  const raw = JSON.stringify(legacy)
  localStorage.setItem('ankiweb_v1', raw)
  const put = IDBObjectStore.prototype.put
  const abortingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value, key) {
    const request = put.call(this, value, key)
    request.addEventListener('success', () => this.transaction.abort())
    return request
  })

  const tab = new BrowserStorage()
  try {
    await expect(tab.load()).rejects.toThrow()
    expect(localStorage.getItem('ankiweb_v1')).toBe(raw)
  } finally {
    abortingPut.mockRestore()
  }

  expect(await tab.load()).toEqual(legacy)
  expect(localStorage.getItem('ankiweb_v1')).toBeNull()
})

it.each(['ignores', 'rejects'])('keeps the legacy library when IndexedDB %s strict durability', async behavior => {
  const raw = JSON.stringify(legacy)
  localStorage.setItem('ankiweb_v1', raw)
  const transaction = IDBDatabase.prototype.transaction
  const olderBrowser = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase, stores, mode, options,
  ) {
    if (options && behavior === 'rejects') throw new TypeError('Unsupported transaction options')
    return transaction.call(this, stores, mode)
  })

  const tab = new BrowserStorage()
  expect(await tab.load()).toEqual(legacy)
  const changed = { decks: [...legacy.decks, { id: 'added', name: 'Added', cards: [] }] }
  await tab.save(changed)
  expect(await new BrowserStorage().load()).toEqual(changed)
  expect(localStorage.getItem('ankiweb_v1')).toBe(raw)

  olderBrowser.mockRestore()
  const put = vi.spyOn(IDBObjectStore.prototype, 'put')
  expect(await tab.load()).toEqual(changed)
  expect(put).toHaveBeenCalledOnce()
  expect(localStorage.getItem('ankiweb_v1')).toBeNull()
})
