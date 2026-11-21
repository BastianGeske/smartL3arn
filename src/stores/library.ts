import { freshProgress, normalizePath, normalizePaths, pathKey, practiceCases, type SavedPath, type Progress } from '../../shared/learning-paths.mjs'
import { splitCards, type SplitDraft } from '../domain/splitMatching'
import { useUiStore } from './ui'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createCard, genId } from '../domain/importExport'
import type { AppData, Card, Deck, TaskDefinition } from '../domain/types'
import { cardContent } from '../domain/tasks'
import { LibraryConflict } from '../services/storage/browserStorage'
import { getStorageRepository } from '../services/storage'
import { clearPathDraftBackup, practiceBackupKey, reviewBackupKey } from '../services/storage/pathDraftBackup'
import { normalizeAppData } from '../../shared/data-validation.mjs'
import { todayStr } from '../domain/dates'
import { t } from '../i18n'
import { defaultCover } from '../domain/deckCovers'
import { isDeckCoverId, type DeckCoverId } from '../../shared/deck-covers.mjs'
import { planJsonSupplement, supplementSource, SupplementError } from '../domain/jsonSupplement'

export const useLibraryStore = defineStore('library', () => {
  const data = ref<AppData>({ decks: [] })
  const ready = ref(false)
  const saveError = ref<string | null>(null)
  const persistenceIssue = ref<'load' | 'save' | 'conflict' | null>(null)
  const repository = getStorageRepository()
  let pending: Promise<void> | undefined
  let loadFailed = false
  const transactionBusy = ref(false)

  const decks = computed(() => data.value.decks)

  const cardCount = computed(() => decks.value.reduce((count, deck) => count + deck.cards.length, 0))

  async function hydrate(): Promise<void> {
    try {
      data.value = normalizeAppData(await repository.load(), todayStr())
      // Keep the existing three-cover appearance stable when another deck is deleted.
      data.value.decks.forEach((deck, index) => { deck.coverId ??= defaultCover(index % 3) })
    } catch {
      loadFailed = true
      saveError.value = t('common.loadError')
      persistenceIssue.value = 'load'
    } finally { ready.value = true }
  }

  // A job owns the library until its write and any rollback have both settled.
  async function enqueue<T>(operation: () => Promise<T>, exclusive = false): Promise<T> {
    if (transactionBusy.value) throw new Error('Library transaction in progress')
    const previous = pending
    let release!: () => void
    const done = new Promise<void>(resolve => { release = resolve })
    pending = done
    if (exclusive) transactionBusy.value = true
    try {
      if (previous) await previous
      if (loadFailed) throw new Error(t('common.loadError'))
      if (persistenceIssue.value === 'conflict') throw new LibraryConflict()
      return await operation()
    } finally {
      if (pending === done) pending = undefined
      if (exclusive) transactionBusy.value = false
      release()
    }
  }

  async function write(next = data.value): Promise<AppData> {
    try {
      const normalized = normalizeAppData(next, todayStr())
      await repository.save(normalized)
      saveError.value = null
      persistenceIssue.value = null
      return normalized
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : String(error)
      persistenceIssue.value = error instanceof LibraryConflict ? 'conflict' : 'save'
      throw error
    }
  }

  // Learning progress stays in memory on transient write failure for the next save.
  function persist(update?: () => boolean | void): Promise<void> {
    return enqueue(async () => {
      if (update?.() !== false) await write()
    })
  }

  function queued<Args extends unknown[], T>(operation: (...args: Args) => Promise<T>, exclusive = false) {
    return (...args: Args) => enqueue(() => operation(...args), exclusive)
  }

  function deckById(deckId: string): Deck | undefined {
    return data.value.decks.find((deck) => deck.id === deckId)
  }

  async function createDeck(name: string, coverId: DeckCoverId = defaultCover(decks.value.length)): Promise<Deck> {
    if (!isDeckCoverId(coverId)) throw new Error('Invalid deck cover.')
    const deck: Deck = { id: genId(), name, coverId, cards: [] }
    data.value.decks.push(deck)
    try { await write() }
    catch (error) {
      data.value.decks = data.value.decks.filter(item => item.id !== deck.id)
      throw error
    }
    return deck
  }

  async function renameDeck(deckId: string, name: string): Promise<void> {
    const deck = deckById(deckId)
    if (!deck) return
    await updateDeck(deckId, name, deck.coverId || defaultCover(decks.value.indexOf(deck) % 3))
  }

  async function updateDeck(deckId: string, name: string, coverId: DeckCoverId): Promise<void> {
    if (!isDeckCoverId(coverId)) throw new Error('Invalid deck cover.')
    const deck = deckById(deckId)
    if (!deck) return
    const previous = { name: deck.name, coverId: deck.coverId }
    Object.assign(deck, { name, coverId })
    try { await write() }
    catch (error) { Object.assign(deck, previous); throw error }
  }

  async function deleteDeck(deckId: string): Promise<void> {
    const index = data.value.decks.findIndex(deck => deck.id === deckId)
    if (index < 0) return
    const deck = data.value.decks[index]!
    data.value.decks = data.value.decks.filter((deck) => deck.id !== deckId)
    try { await write() }
    catch (error) { data.value.decks.splice(index, 0, deck); throw error }
  }

  async function addCard(deckId: string, front: string, back: string, task?: TaskDefinition): Promise<Card | undefined> {
    const deck = deckById(deckId)
    if (!deck) return undefined
    const card = createCard(front, back, task)
    deck.cards.push(card)
    try { await write() }
    catch (error) { deck.cards = deck.cards.filter(item => item.id !== card.id); throw error }
    return card
  }

  async function updateCard(
    deckId: string,
    cardId: string,
    updates: Partial<Pick<Card, 'front' | 'back' | 'task'>>,
  ): Promise<void> {
    const card = deckById(deckId)?.cards.find((item) => item.id === cardId)
    if (!card) return
    const previous = { front: card.front, back: card.back, task: card.task }
    const next = cardContent(updates.front ?? card.front, updates.back ?? card.back,
      'task' in updates ? updates.task : card.task)
    Object.assign(card, next)
    if ('task' in updates && !updates.task) delete card.task
    try { await write() }
    catch (error) { Object.assign(card, previous); throw error }
  }

  async function deleteCard(deckId: string, cardId: string): Promise<void> {
    const deck = deckById(deckId)
    if (!deck) return
    const cards = [...deck.cards]
    const stats = deck.cardStats?.[cardId]
    deck.cards = deck.cards.filter((card) => card.id !== cardId)
    if (deck.cardStats) delete deck.cardStats[cardId]
    try { await write() }
    catch (error) {
      deck.cards = cards
      if (deck.cardStats && stats) deck.cardStats[cardId] = stats
      throw error
    }
  }

  async function addCards(deckId: string, cards: Card[], stillTarget?: () => boolean): Promise<boolean> {
    const deck = deckById(deckId)
    if (!deck || (stillTarget && !stillTarget())) return false
    const previous = deck.cards
    deck.cards = [...previous, ...cards]
    try { await write() }
    catch (error) { deck.cards = previous; throw error }
    return true
  }

  async function addDeck(deck: Deck): Promise<void> {
    await addDecks([deck])
  }

  async function addDecks(decksToAdd: Deck[], restored: SavedPath[] = []): Promise<void> {
    const paths = [...(data.value.learningPaths || [])]
    for (const row of restored) {
      const existing = paths.find(entry => pathKey(entry.content) === pathKey(row.content))
      if (!existing) paths.push(row)
      else if (JSON.stringify(normalizePaths([existing])[0]) !== JSON.stringify(normalizePaths([row])[0])) throw new Error(t('path.restoreConflict'))
    }
    const previous = data.value.decks
    const ids = new Set(previous.map(deck => deck.id))
    decksToAdd.forEach((deck, index) => {
      // A restore into an empty library retains its original size and IDs.
      while (ids.has(deck.id)) deck.id = genId()
      ids.add(deck.id)
      deck.coverId ??= defaultCover(previous.length + index)
    })
    const next = [...previous, ...decksToAdd]
    if (restored.length) {
      await write({ ...data.value, decks: next, learningPaths: paths })
      data.value = { ...data.value, decks: next, learningPaths: paths }
      return
    }
    data.value.decks = next
    try { await write() }
    catch (error) { data.value.decks = previous; throw error }
  }

  async function publishDeck(replacement: Deck) {
    data.value = await write({ ...data.value, decks: decks.value.map(deck => deck.id === replacement.id ? replacement : deck) })
  }

  async function splitMatchingCard(deckId: string, cardId: string, drafts: SplitDraft[], replaceOriginal = false, expectedSource?: string): Promise<Card[]> {
    const ui = useUiStore()
    if (ui.studyActive) throw new Error('Cannot split during study')
    const cards = splitCards(drafts)
    const deck = deckById(deckId)
    const index = deck?.cards.findIndex(card => card.id === cardId) ?? -1
    const source = deck?.cards[index]
    if (!deck || !source || source.task?.kind !== 'matching' || (expectedSource && JSON.stringify({ front: source.front, back: source.back, task: source.task }) !== expectedSource)) throw new Error('Source card changed')
    const pairIds = new Set(source.task.pairs.map(pair => pair.id))
    const selectedIds = drafts.filter(draft => draft.selected).map(draft => draft.pairId)
    if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !pairIds.has(id))) throw new Error('Invalid source pairs')
    const replacement = { ...deck, cards: [...deck.cards] }
    replacement.cards.splice(index + (replaceOriginal ? 0 : 1), replaceOriginal ? 1 : 0, ...cards)
    if (replaceOriginal && deck.cardStats) {
      replacement.cardStats = { ...deck.cardStats }
      delete replacement.cardStats[cardId]
    }
    await publishDeck(replacement)
    return cards
  }

  async function applyJsonSupplement(deckId: string, payload: unknown, expectedSource: string): Promise<void> {
    const ui = useUiStore()
    if (ui.studyActive) throw new SupplementError('supplement.studyActive')
    const deck = deckById(deckId)
    if (!deck || supplementSource(deck) !== expectedSource) throw new SupplementError('supplement.stale')
    const plan = planJsonSupplement(deck, payload, cardCount.value)
    if (!plan.changes.length) return
    await publishDeck({ ...deck, cards: plan.cards })
  }

  async function installPath(value: unknown): Promise<string> {
    const content = normalizePath(value), key = pathKey(content)
    const paths = data.value.learningPaths || []
    const existing = paths.find(entry => pathKey(entry.content) === key)
    if (existing) {
      if (JSON.stringify(existing.content) !== JSON.stringify(content)) throw new Error(t('path.versionConflict'))
      return key
    }
    const next = [...paths, { content, progress: freshProgress() }]
    await write({ ...data.value, learningPaths: next })
    data.value.learningPaths = next
    return key
  }

  async function updatePath(key: string, change: (row: SavedPath) => Progress) {
    const paths = data.value.learningPaths || []
    const index = paths.findIndex(row => pathKey(row.content) === key)
    if (index < 0) return
    const row = paths[index]!, progress = change(row)
    if (progress === row.progress) return
    const next = [...paths]
    next[index] = { content: row.content, progress }
    await write({ ...data.value, learningPaths: next })
    data.value.learningPaths = next
  }

  async function deletePath(key: string): Promise<void> {
    const paths = data.value.learningPaths || []
    const removed = paths.find(row => pathKey(row.content) === key)
    if (!removed) return
    const next = paths.filter(row => pathKey(row.content) !== key)
    await write({ ...data.value, learningPaths: next })
    clearPathDraftBackup(key)
    clearPathDraftBackup(reviewBackupKey(key))
    for (const chapter of removed.content.chapters) {
      for (const goal of chapter.objectives) {
        if (!removed.progress.passed.includes(goal.id)) continue
        for (const activity of [...practiceCases(goal), ...goal.checks]) clearPathDraftBackup(practiceBackupKey(key, activity.id))
      }
    }
    data.value.learningPaths = next
  }

  async function transferCards(key: string, selected: string[], target: string) {
    const paths = data.value.learningPaths || []
    const row = paths.find(p => pathKey(p.content) === key)
    if (!row) return
    const cards = row.content.reviewCards.filter(c => selected.includes(c.id) && row.progress.passed.includes(c.objectiveId)
      && !row.progress.transferred.includes(c.id))
    if (!cards.length) return
    const deck = target ? deckById(target) : { id: genId(), name: row.content.title, cards: [], coverId: defaultCover(decks.value.length) }
    if (!deck) throw new Error(t('path.targetMissing'))
    const updated = { ...deck, cards: [...deck.cards, ...cards.map(c => createCard(c.front, c.back))] }
    const nextDecks = target ? decks.value.map(d => d.id === target ? updated : d) : [...decks.value, updated]
    const nextPaths = paths.map(p => p !== row ? p : { ...row, progress: { ...row.progress,
      transferred: [...row.progress.transferred, ...cards.map(c => c.id)] } })
    await write({ decks: nextDecks, learningPaths: nextPaths })
    data.value.decks = nextDecks
    data.value.learningPaths = nextPaths
  }

  return {
    applyJsonSupplement: queued(applyJsonSupplement, true),
    installPath: queued(installPath),
    updatePath: queued(updatePath),
    deletePath: queued(deletePath),
    transferCards: queued(transferCards),
    data,
    transactionBusy,
    splitMatchingCard: queued(splitMatchingCard, true),
    decks,
    cardCount,
    ready,
    saveError,
    persistenceIssue,
    hydrate,
    persist,
    deckById,
    createDeck: queued(createDeck),
    renameDeck: queued(renameDeck),
    updateDeck: queued(updateDeck),
    deleteDeck: queued(deleteDeck),
    addCard: queued(addCard),
    addCards: queued(addCards),
    updateCard: queued(updateCard),
    deleteCard: queued(deleteCard),
    addDeck: queued(addDeck),
    addDecks: queued(addDecks),
  }
})
