import { todayStr } from './dates'
import type { Card, Deck } from './types'

export interface ParsedCard {
  front: string
  back: string
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36)
}

export function createCard(front: string, back: string): Card {
  return {
    id: genId(),
    front,
    back,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    dueDate: todayStr(),
  }
}

export function parseCards(text: string): ParsedCard[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  if (!lines.length) return []
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const cards: ParsedCard[] = []
  lines.forEach((line) => {
    const parts = delimiter === '\t' ? line.split('\t') : parseCsvLine(line)
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      cards.push({ front: parts[0].trim(), back: parts[1].trim() })
    }
  })
  return cards
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let inQuote = false
  let current = ''
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (inQuote && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuote = !inQuote
      }
    } else if (character === ',' && !inQuote) {
      result.push(current)
      current = ''
    } else {
      current += character
    }
  }
  result.push(current)
  return result.map((field) => field.trim())
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function deckFilename(name: string): string {
  return (name || 'deck').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, '_')
}

export function deckToCsv(deck: Deck): string {
  return [
    ['front', 'back'],
    ...deck.cards.map((card) => [csvEscape(card.front), csvEscape(card.back)]),
  ].map((row) => row.join(',')).join('\n')
}

export function deckToAnkiText(deck: Deck): string {
  const field = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, '<br>')
  return deck.cards.map((card) => `${field(card.front)}\t${field(card.back)}`).join('\n')
}
