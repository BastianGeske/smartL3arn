import { checkDataSize } from '../../../shared/data-validation.mjs'
import type { StorageRepository } from './StorageRepository'

const STORAGE_KEY = 'ankiweb_v1'

export const browserStorage: StorageRepository = {
  async load() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { decks: [] }
    checkDataSize(raw)
    return JSON.parse(raw)
  },
  async save(data) {
    const raw = JSON.stringify(data)
    checkDataSize(raw)
    localStorage.setItem(STORAGE_KEY, raw)
  },
}
