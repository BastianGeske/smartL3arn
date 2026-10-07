import { DECK_COVERS, type DeckCoverId } from '../../shared/deck-covers.mjs'
import type { Deck } from './types'

export { DECK_COVERS }
export function defaultCover(index: number): DeckCoverId {
  return DECK_COVERS[Math.max(0, index) % DECK_COVERS.length]!.id
}
export function coverFor(deck: Deck, legacyIndex = 0) {
  return DECK_COVERS.find(cover => cover.id === deck.coverId)
    || DECK_COVERS[Math.max(0, legacyIndex) % 3]!
}
export function coverUrl(id: DeckCoverId): string {
  return `${import.meta.env.BASE_URL}design/deck-${id}.png`
}
