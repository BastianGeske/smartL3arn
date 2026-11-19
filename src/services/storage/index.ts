import { BrowserStorage } from './browserStorage'
import type { StorageRepository } from './StorageRepository'

const electronStorage: StorageRepository = {
  async load() {
    return window.smartL3arn!.loadData()
  },
  async save(data) {
    await window.smartL3arn!.saveData(data)
  },
}

export function getStorageRepository(): StorageRepository {
  return window.smartL3arn ? electronStorage : new BrowserStorage()
}
