import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStudyStore } from './study'
import { useSmartStudyStore } from './smartStudy'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { createCard } from '../domain/importExport'
import { evaluateResponse } from '../domain/tasks'
import { normalizeAppData } from '../../shared/data-validation.mjs'
import { BrowserStorage } from '../services/storage/browserStorage'
import { PRACTICE_DELAY_MS } from '../domain/study/practice'
import type { Deck } from '../domain/types'

vi.mock('../services/native', () => ({ syncStatusBar: vi.fn(async () => undefined) }))
let deck: Deck
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T12:00:00'))
  localStorage.clear(); setActivePinia(createPinia())
  const library = useLibraryStore()
  deck = await library.createDeck('Policy')
  await library.addCard(deck.id, 'Explain', 'Reference')
  const settings = useSettingsStore()
  settings.smartConfig.deckIds = [deck.id]
  settings.smartConfig.duration = 0
  settings.smartConfig.evaluationMode = 'local'
})
afterEach(() => { useSmartStudyStore().stopTimer(); vi.useRealTimers(); vi.restoreAllMocks() })
const standardRate = async (rating: 0 | 1 | 2 | 3) => { const s = useStudyStore(); s.flip(); await s.rate(rating) }
const smartRate = async (rating: 0 | 1 | 2 | 3) => { const s = useSmartStudyStore(); s.reveal(); await s.rate(rating) }

describe('shared learning policy', () => {
  it.each([[0, 2], [0, 3], [1, 2], [1, 3]] as const)('protects a retained standard session after Smart Study rating %s until rating %s is ready', async (rating, finalRating) => {
    const standard = useStudyStore()
    standard.start(deck.id)
    standard.flip()
    const smart = useSmartStudyStore()
    await smart.start()
    await smartRate(rating)

    const cardId = deck.cards[0]!.id
    const savedDeck = JSON.stringify(deck)
    const savedStats = { ...standard.sessionStats }
    const persist = vi.spyOn(useLibraryStore(), 'persist')
    for (const blockedRating of [0, 1, 2, 3] as const) {
      await standard.rate(blockedRating)
    }
    vi.advanceTimersByTime(PRACTICE_DELAY_MS - 1)
    await standard.rate(finalRating)
    expect(JSON.stringify(deck)).toBe(savedDeck)
    expect(standard.sessionStats).toEqual(savedStats)
    expect(standard.currentCard?.id).toBe(cardId)
    expect(standard.index).toBe(0)
    expect(standard.learningQueue).toEqual([])
    expect(standard.flipped).toBe(true)
    expect(persist).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await standard.rate(finalRating)
    expect(standard.sessionStats.reviewed).toBe(1)
    expect(standard.complete).toBe(true)
    expect(deck.cardStats![cardId]!.practiceAvailableAt).toBeUndefined()
    expect(persist).toHaveBeenCalledOnce()
  })

  it.each([0, 1] as const)('persists cooldown across both modes and a data round trip after rating %s', async rating => {
    const standard = useStudyStore(); standard.start(deck.id)
    await standardRate(rating)
    expect(standard.complete).toBe(true)
    const restored = normalizeAppData(JSON.parse(JSON.stringify({ decks: [deck] })), '2026-11-10').decks[0]!
    expect(restored.cardStats![deck.cards[0]!.id]!.practiceAvailableAt).toBe(Date.now() + PRACTICE_DELAY_MS)
    useLibraryStore().decks.splice(0, useLibraryStore().decks.length, restored)
    deck = useLibraryStore().decks[0]!
    const smart = useSmartStudyStore()
    expect(await smart.start()).toBe(false)
    vi.advanceTimersByTime(PRACTICE_DELAY_MS - 1)
    expect(await smart.start()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(await smart.start()).toBe(true)
    expect(smart.currentItem?.purpose).toBe('relearning')
    await smartRate(2)
    expect(deck.cardStats![deck.cards[0]!.id]!.smartNeedsPractice).toBeUndefined()
  })
  it.each(['standard', 'smart'] as const)('preserves every scheduler field during voluntary %s practice', async mode => {
    deck.cards[0] = { ...deck.cards[0]!, dueDate: '2026-12-01', interval: 21, repetitions: 5, stability: 20, difficulty: 4, lastReview: '2026-11-01' }
    const before = { ...deck.cards[0]! }
    if (mode === 'standard') { useStudyStore().start(deck.id); await standardRate(0) }
    else { await useSmartStudyStore().start(); await smartRate(0) }
    expect(deck.cards[0]).toEqual(before)
    expect(deck.cardStats![before.id]!.reviews).toBe(1)
    expect(deck.cardStats![before.id]!.smartNeedsPractice).toBeUndefined()
  })
  it('keeps the current card stable and resumes a delayed attempt only after another answer', async () => {
    const library = useLibraryStore()
    await library.addCard(deck.id, 'Second', 'Answer')
    const smart = useSmartStudyStore(); await smart.start()
    const failed = smart.currentCard!.id
    await smartRate(0)
    const active = smart.currentCard!.id
    vi.advanceTimersByTime(PRACTICE_DELAY_MS)
    expect(smart.currentCard!.id).toBe(active)
    await smartRate(2)
    expect(smart.currentCard!.id).toBe(failed)
    expect(smart.currentItem!.purpose).toBe('relearning')
  })
  it.each(['standard', 'smart'] as const)('caps delayed attempts in %s sessions', async mode => {
    await useLibraryStore().addCard(deck.id, 'Other', 'Answer')
    if (mode === 'smart') {
      const s = useSmartStudyStore(); await s.start()
      await smartRate(0); vi.advanceTimersByTime(PRACTICE_DELAY_MS); await smartRate(0)
      await smartRate(0); vi.advanceTimersByTime(PRACTICE_DELAY_MS); await smartRate(0)
      await smartRate(0); vi.advanceTimersByTime(PRACTICE_DELAY_MS); await smartRate(0)
      expect(s.isDone).toBe(true)
    } else {
      const s = useStudyStore(); s.start(deck.id)
      await standardRate(0); vi.advanceTimersByTime(PRACTICE_DELAY_MS); await standardRate(0)
      await standardRate(0); vi.advanceTimersByTime(PRACTICE_DELAY_MS); await standardRate(0)
      await standardRate(0); vi.advanceTimersByTime(PRACTICE_DELAY_MS); await standardRate(0)
      expect(s.complete).toBe(true)
    }
  })
  it.each([undefined, 'short_text', 'long_text'] as const)('never grades free text (%s) by wording', kind => {
    const reference = 'Ein Quadrat hat vier gleich lange Seiten und vier rechte Winkel. Seine Innenwinkelsumme beträgt 360 Grad.'
    const card = createCard('Explain', reference, kind ? { kind } : undefined)
    for (const value of [reference, reference.replace('vier rechte', 'drei rechte'), 'Alle Seiten sind gleich lang; jeder Winkel beträgt 90 Grad.', 'Das stimmt nicht.']) {
      expect(evaluateResponse(card, { kind: 'text', value })).toBeNull()
    }
  })
})


describe('learning data boundaries', () => {
  it('preserves delayed steps in memory on save failure and saves them on retry', async () => {
    const library = useLibraryStore()
    const standard = useStudyStore(); standard.start(deck.id)
    vi.spyOn(BrowserStorage.prototype, 'save').mockRejectedValueOnce(new Error('Disk full'))
    await standardRate(0)
    expect(library.persistenceIssue).toBe('save')
    expect(deck.cardStats![deck.cards[0]!.id]!.practiceAvailableAt).toBe(Date.now() + PRACTICE_DELAY_MS)
    await library.persist()
    const saved = (await new BrowserStorage().load())
    expect(saved.decks[0].cardStats![deck.cards[0]!.id].smartNeedsPractice).toBe(true)
    expect(saved.decks[0].cardStats![deck.cards[0]!.id].practiceAvailableAt).toBe(Date.now() + PRACTICE_DELAY_MS)
  })
  it('does not lose delayed steps when a timed session ends', async () => {
    await useLibraryStore().addCard(deck.id, 'Other', 'Answer')
    useSettingsStore().smartConfig.duration = 10
    const smart = useSmartStudyStore(); await smart.start()
    const failed = smart.currentCard!.id
    await smartRate(0)
    await vi.advanceTimersByTimeAsync(PRACTICE_DELAY_MS)
    expect(smart.isDone).toBe(true)
    expect(deck.cardStats![failed]!.smartNeedsPractice).toBe(true)
    smart.refreshAvailability()
    expect(smart.availability.count).toBeGreaterThan(0)
  })
  it('accepts old data without cooldown and ignores obsolete smart blockers', async () => {
    deck.cardStats = { [deck.cards[0]!.id]: { reviews: 1, again: 1, hard: 0, smartNeedsPractice: true, smartBlockedUntil: Date.now() + 99_999_999 } }
    const restored = normalizeAppData(JSON.parse(JSON.stringify({ decks: [deck] })), '2026-11-10')
    useLibraryStore().decks.splice(0, useLibraryStore().decks.length, ...restored.decks)
    expect(await useSmartStudyStore().start()).toBe(true)
  })
})

it('protects a retained Smart Study review after a standard Again rating', async () => {
  const smart = useSmartStudyStore()
  await smart.start()
  smart.reveal()
  const standard = useStudyStore()
  standard.start(deck.id)
  await standardRate(0)
  const before = JSON.stringify(deck)
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
  await smart.rate(2)
  expect(JSON.stringify(deck)).toBe(before)
  expect(smart.session!.sessionStats.reviewed).toBe(0)
  expect(smart.session!.phase).toBe('reviewing')
  expect(save).not.toHaveBeenCalled()
  vi.advanceTimersByTime(PRACTICE_DELAY_MS)
  await smart.rate(2)
  expect(smart.session!.sessionStats.reviewed).toBe(1)
  expect(save).toHaveBeenCalledOnce()
})

it('preserves the standard summary until a nonempty queue becomes available', async () => {
  const study = useStudyStore()
  study.start(deck.id)
  await standardRate(0)
  const summary = study.sessionStats
  expect(study.start(deck.id)).toBe(false)
  expect(study.sessionStats).toBe(summary)
  expect(study.availability).toMatchObject({ count: 0, nextPracticeAt: Date.now() + PRACTICE_DELAY_MS })
  vi.advanceTimersByTime(PRACTICE_DELAY_MS)
  study.refreshAvailability()
  expect(study.availability).toMatchObject({ count: 1, nextPracticeAt: null })
  expect(study.start(deck.id)).toBe(true)
})

it('closes a timed session to ratings before a slow history write settles', async () => {
  await useLibraryStore().addCard(deck.id, 'Second', 'Answer')
  useSettingsStore().smartConfig.duration = 10
  const smart = useSmartStudyStore()
  await smart.start()
  await smartRate(2)
  smart.reveal()
  let release!: () => void
  const save = vi.spyOn(BrowserStorage.prototype, 'save').mockImplementationOnce(
    () => new Promise<void>(resolve => { release = resolve }),
  )
  vi.advanceTimersByTime(10 * 60_000)
  expect(smart.isDone).toBe(true)
  expect(save).toHaveBeenCalledOnce()
  await smart.rate(2)
  vi.advanceTimersByTime(500)
  expect(save).toHaveBeenCalledOnce()
  expect(deck.sessions).toMatchObject([{ reviewed: 1 }])
  expect(smart.session!.sessionStats.reviewed).toBe(1)
  release()
  await smart.saveSessions()
})
