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
  const content = text.replace(/^\uFEFF/, '')
  const firstLine = content
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))
  if (!firstLine) return []
  let inQuote = false
  let atFieldStart = true
  let tabDelimited = false
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index]
    if (inQuote) {
      if (character === '"') {
        if (firstLine[index + 1] === '"') index += 1
        else inQuote = false
      }
    } else if (character === '\t') {
      tabDelimited = true
      break
    } else if (character === ',') {
      atFieldStart = true
    } else if (character === '"' && atFieldStart) {
      inQuote = true
      atFieldStart = false
    } else if (character.trim()) {
      atFieldStart = false
    }
  }
  const rows = tabDelimited
    ? content.split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('\t').map((field) => field.trim()))
    : parseCsvRecords(content, true).filter((row) => row.length > 1 || row[0])
  const cards: ParsedCard[] = []
  rows.forEach((parts, index) => {
    if (index === 0 && parts.length === 2
      && parts[0].toLowerCase() === 'front' && parts[1].toLowerCase() === 'back') return
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      cards.push({ front: parts[0].trim(), back: parts[1].trim() })
    }
  })
  return cards
}

export function parseCsvLine(line: string): string[] {
  return parseCsvRecords(line)[0] || ['']
}

function parseCsvRecords(text: string, skipComments = false): string[][] {
  const result: string[][] = []
  let row: string[] = []
  let inQuote = false
  let atFieldStart = true
  let current = ''
  const finishRow = () => {
    result.push([...row, current.trim()])
    row = []
    current = ''
    atFieldStart = true
  }
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (skipComments && !inQuote && !row.length && atFieldStart && character === '#') {
      while (index + 1 < text.length && !/[\r\n]/.test(text[index + 1])) index += 1
      continue
    }
    // Quotes within ordinary text (such as inch marks) are literal characters.
    if (character === '"' && (inQuote || atFieldStart)) {
      if (inQuote && text[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuote = !inQuote
        atFieldStart = false
      }
    } else if (character === ',' && !inQuote) {
      row.push(current.trim())
      current = ''
      atFieldStart = true
    } else if ((character === '\r' || character === '\n') && !inQuote) {
      finishRow()
      if (character === '\r' && text[index + 1] === '\n') index += 1
    } else {
      current += character
      if (character.trim()) atFieldStart = false
    }
  }
  if (inQuote) throw new SyntaxError('Unterminated quoted CSV field.')
  finishRow()
  return result
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  // Quoting alone does not prevent spreadsheet applications from evaluating formulas.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) {
    return `"'${text.replace(/"/g, '""')}"`
  }
  if (/[",\r\n]/.test(text) || /^\s*#/.test(text)) return `"${text.replace(/"/g, '""')}"`
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
    .replace(/\r\n|\r|\n/g, '<br>')
  return deck.cards.map((card) => `${field(card.front)}\t${field(card.back)}`).join('\n')
}
