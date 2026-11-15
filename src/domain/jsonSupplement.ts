import type { Card, Deck } from './types'
import { t, type TranslationKey } from '../i18n'
import { todayStr } from './dates'
import { MAX_CARDS, normalizeDeck } from '../../shared/data-validation.mjs'
import { TaskValidationError } from '../../shared/tasks.mjs'

export class SupplementError extends Error {
  constructor(readonly key: TranslationKey) { super(t(key)) }
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
export const supplementSource = (deck: Deck): string => JSON.stringify(deck.cards.map(({ id, front, back, task }) => ({ id, front, back, task })))
export interface SupplementChange { before?: Card; after: Card }
export interface SupplementPlan {
  source: string
  cards: Card[]
  changes: SupplementChange[]
  added: number
  updated: number
  unchanged: number
}

/** Match against the original deck only; never let one input row overwrite another. */
export function planJsonSupplement(deck: Deck, payload: unknown): SupplementPlan {
  const rows = Array.isArray(payload) ? payload : record(payload) && !('decks' in payload) ? payload.cards : undefined
  if (!Array.isArray(rows)) throw new SupplementError('supplement.invalidFormat')
  if (!rows.length) throw new SupplementError('import.noCards')
  if (rows.length > MAX_CARDS) throw new SupplementError('import.tooLarge')
  const byId = new Map(deck.cards.map(card => [card.id, card]))
  const byFront = new Map<string, Card[]>()
  for (const card of deck.cards) {
    const group = byFront.get(card.front) || []
    group.push(card)
    byFront.set(card.front, group)
  }
  const seen = new Set<string>()
  const additions: Card[] = []
  const addedIds = new Set<string>()
  const replacements = new Map<string, Card>()
  const changes: SupplementChange[] = []
  let unchanged = 0
  for (const row of rows) {
    if (!record(row)) throw new SupplementError('supplement.invalidCard')
    const hasId = Object.hasOwn(row, 'id')
    if (hasId && (typeof row.id !== 'string' || !/^[\w-]{1,128}$/.test(row.id) || ['__proto__', 'constructor', 'prototype'].includes(row.id))) throw new SupplementError('supplement.invalidId')
    const matches = !hasId && typeof row.front === 'string' ? byFront.get(row.front) || [] : []
    if (matches.length > 1) throw new SupplementError('supplement.ambiguous')
    const before = hasId ? byId.get(row.id as string) : matches[0]
    const key = before ? `id:${before.id}` : hasId ? `id:${row.id}` : `front:${row.front}`
    if (seen.has(key)) throw new SupplementError('supplement.duplicate')
    seen.add(key)
    // An omitted field preserves content; null explicitly removes a task.
    const content = {
      ...(hasId ? { id: row.id } : {}),
      front: Object.hasOwn(row, 'front') ? row.front : before?.front,
      back: Object.hasOwn(row, 'back') ? row.back : before?.back,
      task: Object.hasOwn(row, 'task') ? row.task === null ? undefined : row.task : before?.task,
    }
    let normalized: Card
    try { normalized = normalizeDeck({ cards: [content] }, { today: todayStr() }).cards[0]! }
    catch (error) { throw new SupplementError(error instanceof TaskValidationError ? `task.${error.code}` as TranslationKey : 'supplement.invalidCard') }
    if (before) {
      const after = { ...before, front: normalized.front, back: normalized.back }
      if (normalized.task) after.task = normalized.task
      else delete after.task
      if (supplementSource({ ...deck, cards: [before] }) === supplementSource({ ...deck, cards: [after] })) { unchanged++; continue }
      replacements.set(before.id, after)
      changes.push({ before, after })
    } else {
      // Generated IDs must also be unique among the original deck and this batch.
      while (byId.has(normalized.id) || addedIds.has(normalized.id)) {
        if (hasId) throw new SupplementError('supplement.duplicate')
        normalized = normalizeDeck({ cards: [{ ...content, id: undefined }] }, { today: todayStr() }).cards[0]!
      }
      additions.push(normalized)
      addedIds.add(normalized.id)
      changes.push({ after: normalized })
    }
  }
  if (deck.cards.length + additions.length > MAX_CARDS) throw new SupplementError('import.tooLarge')
  return { source: supplementSource(deck), cards: [...deck.cards.map(card => replacements.get(card.id) || card), ...additions], changes, added: additions.length, updated: replacements.size, unchanged }
}
