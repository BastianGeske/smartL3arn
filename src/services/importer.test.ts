import { BrowserStorage } from './storage/browserStorage'
import { MAX_FILE_BYTES } from '../../shared/data-validation.mjs'
import { describe, expect, it } from 'vitest'
import { cardsFromTextFile, importJsonFile, importTextFile, readJsonSupplement } from './importer'
import { setLanguage, t } from '../i18n'
import { backupJson, createCard, deckToAnkiText, deckToCsv } from '../domain/importExport'

describe('JSON import', () => {
  it('reads supplementary JSON including a BOM without normalizing partial updates', async () => {
    const payload = [{ id: 'existing', back: 'More detail' }]
    expect(await readJsonSupplement(new File(['\uFEFF' + JSON.stringify(payload)], 'extra.json'))).toEqual(payload)
    await expect(readJsonSupplement(new File(['{bad'], 'extra.json'))).rejects.toMatchObject({ key: 'import.parseError' })
    const oversized = new File(['[]'], 'extra.json')
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 })
    await expect(readJsonSupplement(oversized)).rejects.toMatchObject({ key: 'import.tooLarge' })
  })
  it('round-trips all 55,000 short cards within the import byte limit', async () => {
    const template = createCard('Q', 'A')
    const cards = Array.from({ length: 55_000 }, (_, index) => ({ ...template, id: 'card' + index }))
    const deck = { id: 'large', name: 'Large', cards }
    expect(new Blob([JSON.stringify({ decks: [deck] }, null, 2)]).size).toBeGreaterThan(MAX_FILE_BYTES)
    for (const payload of [deck, { decks: [deck] }]) {
      const file = new File([backupJson(payload)], 'backup.json')
      expect(file.size).toBeLessThanOrEqual(MAX_FILE_BYTES)
      const [restored] = await importJsonFile(file)
      expect(restored.cards).toHaveLength(cards.length)
      expect(restored.cards[54_999]).toEqual(cards[54_999])
    }
  })

  it('restores an exact-limit UTF-8 backup into an empty library at its original size', async () => {
    const cards = Array.from({ length: 300 }, (_, id) => ({ ...createCard('Q', 'A'), id: String(id) }))
    const deck = { id: 'd', name: 'Exact', coverId: 'sage' as const, cards }
    const data = { decks: [deck] }
    let remaining = MAX_FILE_BYTES - new Blob([backupJson(data)]).size
    for (const card of cards) {
      const pairs = Math.min(19_998, Math.floor(remaining / 2))
      card.back += 'ä'.repeat(pairs)
      remaining -= pairs * 2
      if (remaining === 1) { card.back += 'x'; remaining-- }
      if (!remaining) break
    }
    expect(remaining).toBe(0)
    const file = new File([backupJson(data)], 'backup.json')
    expect(file.size).toBe(MAX_FILE_BYTES)
    const restored = await importJsonFile(file, { keepDeckIds: true })
    expect(restored[0].id).toBe(deck.id)
    expect(new Blob([backupJson({ decks: restored })]).size).toBe(MAX_FILE_BYTES)
    await new BrowserStorage().save({ decks: restored })
    expect((await new BrowserStorage().load()).decks[0].cards).toHaveLength(cards.length)
    cards[0].front += '!'
    expect(() => backupJson(data)).toThrow()
  })

  it('rejects a mixed backup with the failing deck name or position', async () => {
    for (const [invalid, label] of [[{ name: 'Broken', cards: null }, 'Broken'], [null, 2]] as const) {
      const file = new File([JSON.stringify({ decks: [{ name: 'Valid', cards: [] }, invalid] })], 'mixed.json')
      await expect(importJsonFile(file)).rejects.toMatchObject({ key: 'import.invalidBackupDeck', params: { deck: label } })
    }
  })

  it('restores a named empty single deck with its cover and history', async () => {
    const original = { id: 'old', name: 'Archived', coverId: 'sage', cards: [],
      sessions: [{ date: '2026-11-19', reviewed: 1, good: 1, easy: 0, hard: 0, again: 0 }] }
    const [restored] = await importJsonFile(new File([JSON.stringify(original)], 'empty.json'))
    expect(restored).toMatchObject({ name: original.name, coverId: original.coverId, sessions: original.sessions, cards: [] })
    for (const payload of [[], { cards: [] }]) {
      await expect(importJsonFile(new File([JSON.stringify(payload)], 'empty.json'))).rejects.toMatchObject({ key: 'import.noCards' })
    }
  })

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
      createCard('#include <stdio.h>', 'A preprocessor directive'),
      createCard('"#already quoted"', 'Literal quotes'),
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
