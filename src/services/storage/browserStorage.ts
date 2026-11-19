import { checkDataSize, normalizeAppData } from '../../../shared/data-validation.mjs'
import { todayStr } from '../../domain/dates'
import type { AppData } from '../../domain/types'
import type { StorageRepository } from './StorageRepository'

const LEGACY_KEY = 'ankiweb_v1'
const STORE = 'library'
const KEY = 'current'
interface Snapshot { revision: number; raw: string }

export class LibraryConflict extends Error {
  constructor() { super('The library was changed in another tab.') }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('smartL3arn', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function openTransaction(db: IDBDatabase, strict: boolean): IDBTransaction {
  if (strict) {
    try { return db.transaction(STORE, 'readwrite', { durability: 'strict' }) }
    catch (error) {
      if (!(error instanceof TypeError)) throw error
      // Older implementations may reject the options argument.
    }
  }
  return db.transaction(STORE, 'readwrite')
}

// Read and conditionally replace the single snapshot in one cross-tab transaction.
async function transaction<T>(action: (snapshot: Snapshot | undefined, store: IDBObjectStore) => T, strict = false): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = openTransaction(db, strict)
      const store = tx.objectStore(STORE)
      const request = store.get(KEY)
      let result: T
      let failure: unknown
      request.onsuccess = () => {
        try { result = action(request.result, store) }
        catch (error) { failure = error; tx.abort() }
      }
      tx.onabort = () => reject(failure ?? tx.error)
      tx.oncomplete = () => resolve(result)
    })
  } finally { db.close() }
}

export class BrowserStorage implements StorageRepository {
  private revision = 0

  async load(): Promise<AppData> {
    const { revision, data, legacyToRemove } = await transaction((snapshot, store) => {
      const strict = store.transaction.durability === 'strict'
      if (snapshot !== undefined) {
        if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) throw new Error('Invalid library revision.')
        checkDataSize(snapshot.raw)
        const data = JSON.parse(snapshot.raw) as AppData
        const legacyToRemove = strict ? localStorage.getItem(LEGACY_KEY) : null
        // The existing snapshot may have been written with relaxed durability.
        if (legacyToRemove !== null) store.put(snapshot, KEY)
        return { revision: snapshot.revision, data, legacyToRemove }
      }
      const raw = localStorage.getItem(LEGACY_KEY)
      if (raw === null) return { revision: 0, data: { decks: [] }, legacyToRemove: null }
      checkDataSize(raw)
      const data = normalizeAppData(JSON.parse(raw), todayStr())
      const normalized = JSON.stringify(data)
      checkDataSize(normalized)
      store.put({ revision: 1, raw: normalized }, KEY)
      return { revision: 1, data, legacyToRemove: strict ? raw : null }
    }, true)
    if (legacyToRemove !== null) {
      try {
        if (localStorage.getItem(LEGACY_KEY) === legacyToRemove) localStorage.removeItem(LEGACY_KEY)
      } catch { /* IndexedDB can still be used if legacy cleanup fails. */ }
    }
    this.revision = revision
    return data
  }

  async save(data: AppData): Promise<void> {
    const raw = JSON.stringify(data)
    checkDataSize(raw)
    const expected = this.revision
    this.revision = await transaction((snapshot, store) => {
      if ((snapshot?.revision ?? 0) !== expected || (!snapshot && localStorage.getItem(LEGACY_KEY) !== null)) {
        throw new LibraryConflict()
      }
      const revision = expected + 1
      store.put({ revision, raw }, KEY)
      return revision
    })
  }
}
