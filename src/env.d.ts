/// <reference types="vite/client" />

import type { AppData } from './domain/types'

declare global {
  interface Window {
    smartL3arn?: {
      loadData: () => Promise<AppData>
      saveData: (data: AppData) => Promise<void>
    }
  }
}

export {}
