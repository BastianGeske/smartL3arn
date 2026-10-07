import { isDeckCoverId } from './deck-covers.mjs'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_CARDS = 100_000
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const invalid = () => { throw new Error('Invalid or oversized learning data.') }
const id = v => typeof v === 'string' && /^[\w-]{1,128}$/.test(v) && !forbidden.has(v)
const freshId = () => globalThis.crypto.randomUUID?.()
  || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
function number(v, fallback = 0, max = 100_000_000, integer = false) {
  if (v === undefined) return fallback
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isInteger(v))) invalid()
  return v
}
function text(v, max, fallback) {
  if (v === undefined && fallback !== undefined) return fallback
  if (typeof v !== 'string' || !v.trim() || v.length > max) invalid()
  return v
}
function date(v, fallback) {
  if (v === undefined) return fallback
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)
    || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) invalid()
  return v
}
export function normalizeDeck(value, { today, name = 'Imported deck', newDeckId = false } = {}) {
  if (!record(value) || !Array.isArray(value.cards) || value.cards.length > MAX_CARDS) invalid()
  const seen = new Set()
  const cards = value.cards.map(v => {
    if (!record(v)) invalid()
    const cardId = id(v.id) && !seen.has(v.id) ? v.id : freshId()
    seen.add(cardId)
    const card = { id: cardId, front: text(v.front, 20_000), back: text(v.back, 20_000),
      interval: number(v.interval, 0, 365_000), repetitions: number(v.repetitions, 0, 100_000_000, true),
      easeFactor: number(v.easeFactor, 2.5, 10), dueDate: date(v.dueDate, today) }
    for (const field of ['stability', 'difficulty']) if (v[field] !== undefined) card[field] = number(v[field], 0, field === 'difficulty' ? 10 : 365_000)
    if (v.lastReview !== undefined) card.lastReview = date(v.lastReview)
    return card
  })
  const deck = { id: !newDeckId && id(value.id) ? value.id : freshId(), name: text(value.name, 120, name), cards }
  if (isDeckCoverId(value.coverId)) deck.coverId = value.coverId
  if (value.smartSessionSeq !== undefined) deck.smartSessionSeq = number(value.smartSessionSeq, 0, 100_000_000, true)
  if (value.sessions !== undefined) {
    if (!Array.isArray(value.sessions) || value.sessions.length > 1000) invalid()
    deck.sessions = value.sessions.map(v => {
      if (!record(v)) invalid()
      const session = { date: date(v.date) }
      if (!session.date) invalid()
      for (const field of ['reviewed', 'again', 'hard', 'good', 'easy']) session[field] = number(v[field], 0, 100_000_000, true)
      if (v.smart !== undefined) { if (typeof v.smart !== 'boolean') invalid(); session.smart = v.smart }
      return session
    }).slice(-90)
  }
  if (value.cardStats !== undefined) {
    if (!record(value.cardStats)) invalid()
    deck.cardStats = Object.create(null)
    for (const card of cards) {
      if (!Object.hasOwn(value.cardStats, card.id)) continue
      const v = value.cardStats[card.id]
      if (!record(v)) invalid()
      const stats = { reviews: number(v.reviews, 0, 100_000_000, true), again: number(v.again, 0, 100_000_000, true), hard: number(v.hard, 0, 100_000_000, true) }
      for (const field of ['smartLastReviewedSession', 'smartBlockedUntil', 'smartSkipUntilSession']) if (v[field] !== undefined) stats[field] = number(v[field], 0, Number.MAX_SAFE_INTEGER, true)
      if (v.smartNeedsPractice !== undefined) { if (typeof v.smartNeedsPractice !== 'boolean') invalid(); stats.smartNeedsPractice = v.smartNeedsPractice }
      if (v.smartLastGrade !== undefined) { if (!['again', 'hard', 'good', 'easy'].includes(v.smartLastGrade)) invalid(); stats.smartLastGrade = v.smartLastGrade }
      if (v.elaborations !== undefined) {
        if (!Array.isArray(v.elaborations) || v.elaborations.length > 1000) invalid()
        stats.elaborations = v.elaborations.map(e => { if (!record(e) || !e.date) invalid(); return { date: date(e.date), text: text(e.text, 500) } }).slice(-3)
      }
      deck.cardStats[card.id] = stats
    }
  }
  return deck
}
export function normalizeAppData(value, today) {
  if (!record(value) || !Array.isArray(value.decks) || value.decks.length > 1000) invalid()
  const seen = new Set()
  let count = 0
  const decks = value.decks.map(v => {
    const deck = normalizeDeck(v, { today })
    count += deck.cards.length
    if (count > MAX_CARDS) invalid()
    if (seen.has(deck.id)) deck.id = freshId()
    seen.add(deck.id)
    return deck
  })
  return { decks }
}
export function checkDataSize(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_FILE_BYTES) invalid()
}
