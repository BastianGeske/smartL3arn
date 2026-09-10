import type { AppData } from '../../domain/types'
import type { StorageRepository } from './StorageRepository'

const STORAGE_KEY = 'ankiweb_v1'

function isAppData(value: unknown): value is AppData {
  return Boolean(
    value
    && typeof value === 'object'
    && Array.isArray((value as { decks?: unknown }).decks),
  )
}

export const browserStorage: StorageRepository = {
  async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return { decks: [] }
      const parsed: unknown = JSON.parse(raw)
      return isAppData(parsed) ? parsed : { decks: [] }
    } catch {
      return { decks: [] }
    }
  },
  async save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },
}
