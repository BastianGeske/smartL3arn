import type { AppData, Deck } from '../src/domain/types'
export const MAX_FILE_BYTES: number
export const MAX_CARDS: number
export function normalizeDeck(value: unknown, options: { today: string; name?: string; newDeckId?: boolean }): Deck
export function normalizeAppData(value: unknown, today: string): AppData
export function checkDataSize(raw: string): void
