import { t, type TranslationKey } from '../i18n'
import { createCard, genId, parseCards } from '../domain/importExport'
import { todayStr } from '../domain/dates'
import { checkDataSize, MAX_CARDS, MAX_FILE_BYTES, normalizeDeck } from '../../shared/data-validation.mjs'
import type { AppData, Card, Deck } from '../domain/types'

export class ImportError extends Error {
  constructor(readonly key: TranslationKey) { super(t(key)) }
}
export function importErrorKey(error: unknown): TranslationKey {
  return error instanceof ImportError ? error.key : 'notifications.importFailed'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function deckFromBackup(value: unknown, fallbackName = t('import.defaultDeck')): Deck | null {
  if (!isRecord(value) || !Array.isArray(value.cards)) return null
  try { return normalizeDeck(value, { today: todayStr(), name: fallbackName.slice(0, 120), newDeckId: true }) }
  catch { throw new ImportError('import.invalidBackup') }
}

async function readImportFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError('import.tooLarge')
  const content = await file.text()
  try { checkDataSize(content) } catch { throw new ImportError('import.tooLarge') }
  return content
}

export async function importJsonFile(file: File): Promise<Deck[]> {
  const content = await readImportFile(file)
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new ImportError('import.parseError') }
  if (isRecord(parsed) && Array.isArray((parsed as unknown as AppData).decks)) {
    if ((parsed as unknown as AppData).decks.length > 1000) throw new ImportError('import.tooLarge')
    const decks = (parsed as unknown as AppData).decks
      .map((deck) => deckFromBackup(deck))
      .filter((deck): deck is Deck => Boolean(deck))
    if (decks.reduce((count, deck) => count + deck.cards.length, 0) > MAX_CARDS) throw new ImportError('import.tooLarge')
    if (!decks.length) throw new ImportError('import.noDecks')
    return decks
  }

  if (isRecord(parsed) && Array.isArray(parsed.cards)) {
    const fallbackName = typeof parsed.name === 'string'
      ? parsed.name : file.name.replace(/\.[^.]+$/, '')
    const deck = deckFromBackup(parsed, fallbackName)
    if (!deck?.cards.length) throw new ImportError('import.noCards')
    return [deck]
  }
  if (!Array.isArray(parsed)) throw new ImportError('import.invalidJson')
  const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || t('import.defaultDeck')
  const deck = deckFromBackup({ cards: parsed }, name)
  if (!deck?.cards.length) throw new ImportError('import.noCards')
  return [deck]
}

export async function importTextFile(file: File): Promise<Deck> {
  const parsed = await parsedCardsFromFile(file)
  return {
    id: genId(),
    name: (file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || t('import.defaultDeck')).slice(0, 120),
    cards: parsed.map(({ front, back }) => createCard(front, back)),
  }
}

export async function cardsFromTextFile(file: File): Promise<Card[]> {
  const parsed = await parsedCardsFromFile(file)
  return parsed.map(({ front, back }) => createCard(front, back))
}

async function parsedCardsFromFile(file: File) {
  const content = await readImportFile(file)
  let parsed
  try {
    parsed = parseCards(content)
  } catch (error) {
    if (error instanceof SyntaxError) throw new ImportError('import.invalidCsv')
    throw error
  }
  if (parsed.length > MAX_CARDS || parsed.some(card => card.front.length > 20_000 || card.back.length > 20_000)) throw new ImportError('import.tooLarge')
  if (!parsed.length) {
    throw new ImportError('import.invalidText')
  }
  return parsed
}
