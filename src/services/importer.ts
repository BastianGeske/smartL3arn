import { t } from '../i18n'
import { createCard, genId, parseCards } from '../domain/importExport'
import { todayStr } from '../domain/dates'
import type { AppData, Card, Deck } from '../domain/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cardFromUnknown(value: unknown, preserveId = false): Card | null {
  if (!isRecord(value) || !value.front || !value.back) return null
  return {
    id: preserveId && typeof value.id === 'string' ? value.id : genId(),
    front: String(value.front),
    back: String(value.back),
    interval: typeof value.interval === 'number' ? value.interval : 0,
    repetitions: typeof value.repetitions === 'number' ? value.repetitions : 0,
    easeFactor: typeof value.easeFactor === 'number' ? value.easeFactor : 2.5,
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : todayStr(),
    ...(typeof value.stability === 'number' ? { stability: value.stability } : {}),
    ...(typeof value.difficulty === 'number' ? { difficulty: value.difficulty } : {}),
    ...(typeof value.lastReview === 'string' ? { lastReview: value.lastReview } : {}),
  }
}

function deckFromBackup(value: unknown): Deck | null {
  if (!isRecord(value) || !Array.isArray(value.cards)) return null
  const cards = value.cards
    .map((card) => cardFromUnknown(card, true))
    .filter((card): card is Card => Boolean(card))
  const deck: Deck = {
    ...(value as unknown as Deck),
    id: genId(),
    name: typeof value.name === 'string' && value.name ? value.name : t('import.defaultDeck'),
    cards,
  }
  return deck
}

export async function importJsonFile(file: File): Promise<Deck[]> {
  const content = await file.text()
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new Error(t('import.parseError')) }
  if (isRecord(parsed) && Array.isArray((parsed as unknown as AppData).decks)) {
    const decks = (parsed as unknown as AppData).decks
      .map(deckFromBackup)
      .filter((deck): deck is Deck => Boolean(deck))
    if (!decks.length) throw new Error(t('import.noDecks'))
    return decks
  }

  let name: string
  let rawCards: unknown[]
  if (Array.isArray(parsed)) {
    name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || t('import.defaultDeck')
    rawCards = parsed
  } else if (isRecord(parsed) && Array.isArray(parsed.cards)) {
    name = typeof parsed.name === 'string'
      ? parsed.name
      : file.name.replace(/\.[^.]+$/, '')
    rawCards = parsed.cards
  } else {
    throw new Error(t('import.invalidJson'))
  }

  const cards = rawCards
    .map((card) => cardFromUnknown(card))
    .filter((card): card is Card => Boolean(card))
  if (!cards.length) throw new Error(t('import.noCards'))
  return [{ id: genId(), name, cards }]
}

export async function importTextFile(file: File): Promise<Deck> {
  const parsed = parseCards(await file.text())
  if (!parsed.length) {
    throw new Error(t('import.invalidText'))
  }
  return {
    id: genId(),
    name: file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || t('import.defaultDeck'),
    cards: parsed.map(({ front, back }) => createCard(front, back)),
  }
}

export async function cardsFromTextFile(file: File): Promise<Card[]> {
  const parsed = parseCards(await file.text())
  if (!parsed.length) {
    throw new Error(t('import.invalidText'))
  }
  return parsed.map(({ front, back }) => createCard(front, back))
}
