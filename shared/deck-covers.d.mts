export type DeckCoverId = 'violet' | 'teal' | 'apricot' | 'navy' | 'rose' | 'sage' | 'sky' | 'terracotta' | 'indigo' | 'mint' | 'sand' | 'coral' | 'graphite'
export interface DeckCover { readonly id: DeckCoverId; readonly de: string; readonly en: string; readonly icon: string }
export const DECK_COVERS: readonly DeckCover[]
export function isDeckCoverId(value: unknown): value is DeckCoverId
