import type { AppData } from '../../domain/types'

export interface StorageRepository {
  load(): Promise<AppData>
  save(data: AppData): Promise<void>
}
