import { normalizePaths } from '../../shared/learning-paths.mjs'
import { t, type TranslationKey } from '../i18n'
import { createCard, genId, parseCards } from '../domain/importExport'
import { todayStr } from '../domain/dates'
import { checkDataSize, MAX_CARDS, MAX_FILE_BYTES, normalizeDeck } from '../../shared/data-validation.mjs'
import type { AppData, Card, Deck } from '../domain/types'
import { TaskValidationError } from '../../shared/tasks.mjs'
import { SupplementError } from '../domain/jsonSupplement'

export class ImportError extends Error {
  constructor(readonly key: TranslationKey, readonly params: Record<string, string | number> = {}) { super(t(key, params)) }
}
export function importErrorKey(error: unknown): TranslationKey {
  return error instanceof ImportError || error instanceof SupplementError ? error.key : 'notifications.importFailed'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function deckFromBackup(value: unknown, fallbackName = t('import.defaultDeck'), keepDeckId = false): Deck {
  try { return normalizeDeck(value, { today: todayStr(), name: fallbackName.slice(0, 120), newDeckId: !keepDeckId }) }
  catch (error) { throw new ImportError(error instanceof TaskValidationError ? `task.${error.code}` as TranslationKey : 'import.invalidBackup') }
}

async function readImportFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError('import.tooLarge')
  const content = await file.text()
  try { checkDataSize(content) } catch { throw new ImportError('import.tooLarge') }
  return content
}

export async function readJsonSupplement(file: File): Promise<unknown> {
  const content = await readImportFile(file)
  try { return JSON.parse(content.replace(/^\uFEFF/, '')) }
  catch { throw new ImportError('import.parseError') }
}

export async function importJsonFile(file: File, { keepDeckIds = false } = {}): Promise<Deck[]> {
  return (await importLibraryFile(file, { keepDeckIds })).decks
}

export async function importLibraryFile(file: File, { keepDeckIds = false } = {}): Promise<AppData> {
  const parsed = await readJsonSupplement(file)
  if (isRecord(parsed) && Array.isArray(parsed.decks)) {
    if (parsed.decks.length > 1000) throw new ImportError('import.tooLarge')
    const decks = parsed.decks.map((deck, index) => {
      try { return deckFromBackup(deck, undefined, keepDeckIds) }
      catch {
        const label = isRecord(deck) && typeof deck.name === 'string' && deck.name.trim()
          ? deck.name.slice(0, 120) : index + 1
        throw new ImportError('import.invalidBackupDeck', { deck: label })
      }
    })
    if (decks.reduce((count, deck) => count + deck.cards.length, 0) > MAX_CARDS) throw new ImportError('import.tooLarge')
    if (parsed.learningPaths !== undefined) {
      try { return { decks, learningPaths: normalizePaths(parsed.learningPaths) } }
      catch { throw new ImportError('import.invalidBackup') }
    }
    if (!decks.length) throw new ImportError('import.noDecks')
    return { decks }
  }

  if (isRecord(parsed) && Array.isArray(parsed.cards)) {
    const fallbackName = typeof parsed.name === 'string'
      ? parsed.name : file.name.replace(/\.[^.]+$/, '')
    const deck = deckFromBackup(parsed, fallbackName, keepDeckIds)
    if (!deck.cards.length && typeof parsed.name !== 'string') throw new ImportError('import.noCards')
    return { decks: [deck] }
  }
  if (!Array.isArray(parsed)) throw new ImportError('import.invalidJson')
  const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || t('import.defaultDeck')
  const deck = deckFromBackup({ cards: parsed }, name)
  if (!deck.cards.length) throw new ImportError('import.noCards')
  return { decks: [deck] }
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
