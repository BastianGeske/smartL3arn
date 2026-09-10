import { describe, expect, it } from 'vitest'
import { importJsonFile } from './importer'

describe('JSON import', () => {
  it('preserves card IDs and matching statistics when restoring a full backup', async () => {
    const file = new File([JSON.stringify({
      decks: [{
        id: 'old-deck',
        name: 'Backup',
        cards: [{
          id: 'card-1',
          front: 'Question',
          back: 'Answer',
          interval: 4,
          repetitions: 2,
          easeFactor: 2.5,
          dueDate: '2026-08-07',
        }],
        cardStats: {
          'card-1': { reviews: 2, again: 1, hard: 0 },
        },
      }],
    })], 'backup.json')

    const [deck] = await importJsonFile(file)

    expect(deck.id).not.toBe('old-deck')
    expect(deck.cards[0].id).toBe('card-1')
    expect(deck.cardStats?.['card-1']?.reviews).toBe(2)
  })
})
