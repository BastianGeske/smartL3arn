import { describe, expect, it } from 'vitest'
import { cardsFromTextFile, importJsonFile, importTextFile } from './importer'
import { setLanguage, t } from '../i18n'
import { createCard, deckToAnkiText, deckToCsv } from '../domain/importExport'

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

  it.each(['single', 'backup'])('restores complete learning data from a %s deck export', async (format) => {
    const original = {
      id: 'old-deck', name: 'Review', smartSessionSeq: 7,
      cards: [{
        id: 'card-1', front: 'Question', back: 'Answer', interval: 4,
        repetitions: 2, easeFactor: 2.5, dueDate: '2026-10-06',
        stability: 4.2, difficulty: 5.3, lastReview: '2026-10-02',
      }],
      cardStats: { 'card-1': {
        reviews: 2, again: 1, hard: 0, smartNeedsPractice: true,
        smartLastGrade: 'again', smartLastReviewedSession: 7,
        elaborations: [{ date: '2026-10-02', text: 'Explanation' }],
      } },
      sessions: [{ date: '2026-10-02', reviewed: 2, again: 1, hard: 0, good: 1, easy: 0, smart: true }],
    }
    const payload = format === 'single' ? original : { decks: [original] }
    const [restored] = await importJsonFile(new File([JSON.stringify(payload)], 'review.json'))
    expect(restored.id).not.toBe(original.id)
    expect({ ...restored, id: original.id }).toEqual(original)
  })

  it('generates missing card IDs and retains the filename fallback for a plain deck', async () => {
    const [deck] = await importJsonFile(new File([
      JSON.stringify({ cards: [{ front: 'Question', back: 'Answer' }] }),
    ], 'plain-deck.json'))
    expect(deck.name).toBe('plain-deck')
    expect(deck.cards[0].id).toBeTruthy()
  })

  it('continues importing bare arrays with a name derived from the filename', async () => {
    const [deck] = await importJsonFile(new File([
      JSON.stringify([{ front: 'Question', back: 'Answer' }]),
    ], 'plain_cards.json'))
    expect(deck.name).toBe('plain cards')
    expect(deck.cards).toHaveLength(1)
  })

  it.each(['en', 'de'] as const)('rejects malformed CSV with a localized %s error at both import entry points', async (language) => {
    setLanguage(language)
    try {
      const file = new File(['Question,Answer\n"Incomplete,answer'], 'cards.csv')
      await expect(importTextFile(file)).rejects.toThrow(t('import.invalidCsv'))
      await expect(cardsFromTextFile(file)).rejects.toThrow(t('import.invalidCsv'))
    } finally {
      setLanguage('en')
    }
  })
})

describe('text import', () => {
  it.each(['txt', 'tsv'])('preserves literal quotes from a .%s file at both entry points', async (extension) => {
    const front = 'Convert 6" to centimetres'
    const back = '15.24 cm; the " symbol means inches'
    const file = new File([`\uFEFF# Ignore "comment\n${front}\t${back}`], `measurements.${extension}`)
    const deck = await importTextFile(file)
    const cards = await cardsFromTextFile(file)
    expect(deck.name).toBe('measurements')
    expect(deck.cards.map(({ front, back }) => ({ front, back }))).toEqual([{ front, back }])
    expect(cards.map(({ front, back }) => ({ front, back }))).toEqual([{ front, back }])
  })

  it.each(['txt', 'csv'])('re-imports app-exported .%s files at both entry points', async (format) => {
    const original = { id: 'deck', name: 'Deck', cards: [
      createCard('Convert 6" to centimetres', '15.24 cm'),
      createCard('Read "six inches" aloud', 'The " symbol means inches'),
    ] }
    const content = format === 'txt' ? deckToAnkiText(original) : deckToCsv(original)
    const file = new File([content], `measurements.${format}`)
    const deck = await importTextFile(file)
    const cards = await cardsFromTextFile(file)
    const expected = original.cards.map(({ front, back }) => ({ front, back }))
    expect(deck.cards.map(({ front, back }) => ({ front, back }))).toEqual(expected)
    expect(cards.map(({ front, back }) => ({ front, back }))).toEqual(expected)
  })
})
