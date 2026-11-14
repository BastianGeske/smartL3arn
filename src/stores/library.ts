import { splitCards, type SplitDraft } from '../domain/splitMatching'
import { useUiStore } from './ui'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createCard, genId } from '../domain/importExport'
import type { AppData, Card, Deck, TaskDefinition } from '../domain/types'
import { cardContent } from '../domain/tasks'
import { getStorageRepository } from '../services/storage'
import { normalizeAppData } from '../../shared/data-validation.mjs'
import { todayStr } from '../domain/dates'
import { t } from '../i18n'
import { defaultCover } from '../domain/deckCovers'
import { isDeckCoverId, type DeckCoverId } from '../../shared/deck-covers.mjs'

export const useLibraryStore = defineStore('library', () => {
  const data = ref<AppData>({ decks: [] })
  const ready = ref(false)
  const saveError = ref<string | null>(null)
  const persistenceIssue = ref<'load' | 'save' | null>(null)
  const repository = getStorageRepository()
  let pendingSave: Promise<void> = Promise.resolve()
  let loadFailed = false
  const transactionBusy = ref(false)
  function assertWritable() { if (transactionBusy.value) throw new Error('Library transaction in progress') }

  const decks = computed(() => data.value.decks)

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

  function persist(): Promise<void> {
    assertWritable()
    // Do not overwrite an unreadable original library with an empty/new one.
    if (loadFailed) return Promise.reject(new Error(t('common.loadError')))
    let snapshot: AppData
    try { snapshot = JSON.parse(JSON.stringify(data.value)) as AppData }
    catch (error) { saveError.value = 'Invalid library data.'; persistenceIssue.value = 'save'; return Promise.reject(error) }
    pendingSave = pendingSave
      .catch(() => undefined)
      .then(() => repository.save(normalizeAppData(snapshot, todayStr())))
      .then(() => {
        saveError.value = null
        persistenceIssue.value = null
      })
      .catch((error: unknown) => {
        saveError.value = error instanceof Error ? error.message : String(error)
        persistenceIssue.value = 'save'
        throw error
      })
    return pendingSave
  }

  function deckById(deckId: string): Deck | undefined {
    return data.value.decks.find((deck) => deck.id === deckId)
  }

  async function createDeck(name: string, coverId: DeckCoverId = defaultCover(decks.value.length)): Promise<Deck> {
    assertWritable()
    if (!isDeckCoverId(coverId)) throw new Error('Invalid deck cover.')
    const deck: Deck = { id: genId(), name, coverId, cards: [] }
    data.value.decks.push(deck)
    try { await persist() }
    catch (error) {
      data.value.decks = data.value.decks.filter(item => item.id !== deck.id)
      throw error
    }
    return deck
  }

  async function renameDeck(deckId: string, name: string): Promise<void> {
    assertWritable()
    const deck = deckById(deckId)
    if (!deck) return
    await updateDeck(deckId, name, deck.coverId || defaultCover(decks.value.indexOf(deck) % 3))
  }

  async function updateDeck(deckId: string, name: string, coverId: DeckCoverId): Promise<void> {
    assertWritable()
    if (!isDeckCoverId(coverId)) throw new Error('Invalid deck cover.')
    const deck = deckById(deckId)
    if (!deck) return
    const previous = { name: deck.name, coverId: deck.coverId }
    Object.assign(deck, { name, coverId })
    try { await persist() }
    catch (error) { Object.assign(deck, previous); throw error }
  }

  async function deleteDeck(deckId: string): Promise<void> {
    assertWritable()
    const index = data.value.decks.findIndex(deck => deck.id === deckId)
    if (index < 0) return
    const deck = data.value.decks[index]!
    data.value.decks = data.value.decks.filter((deck) => deck.id !== deckId)
    try { await persist() }
    catch (error) { data.value.decks.splice(index, 0, deck); throw error }
  }

  async function addCard(deckId: string, front: string, back: string, task?: TaskDefinition): Promise<Card | undefined> {
    assertWritable()
    const deck = deckById(deckId)
    if (!deck) return undefined
    const card = createCard(front, back, task)
    deck.cards.push(card)
    try { await persist() }
    catch (error) { deck.cards = deck.cards.filter(item => item.id !== card.id); throw error }
    return card
  }

  async function updateCard(
    deckId: string,
    cardId: string,
    updates: Pick<Card, 'front' | 'back'> & { task?: TaskDefinition },
  ): Promise<void> {
    assertWritable()
    const card = deckById(deckId)?.cards.find((item) => item.id === cardId)
    if (!card) return
    const previous = { front: card.front, back: card.back, task: card.task }
    const next = cardContent(updates.front, updates.back, 'task' in updates ? updates.task : card.task)
    Object.assign(card, next)
    if ('task' in updates && !updates.task) delete card.task
    try { await persist() }
    catch (error) { Object.assign(card, previous); throw error }
  }

  async function deleteCard(deckId: string, cardId: string): Promise<void> {
    assertWritable()
    const deck = deckById(deckId)
    if (!deck) return
    const cards = [...deck.cards]
    const stats = deck.cardStats?.[cardId]
    deck.cards = deck.cards.filter((card) => card.id !== cardId)
    if (deck.cardStats) delete deck.cardStats[cardId]
    try { await persist() }
    catch (error) {
      deck.cards = cards
      if (deck.cardStats && stats) deck.cardStats[cardId] = stats
      throw error
    }
  }

  async function addCards(deckId: string, cards: Card[]): Promise<void> {
    assertWritable()
    const deck = deckById(deckId)
    if (!deck) return
    const previous = [...deck.cards]
    deck.cards.push(...cards)
    try { await persist() }
    catch (error) { deck.cards = previous; throw error }
  }

  async function addDeck(deck: Deck): Promise<void> {
    await addDecks([deck])
  }

  async function addDecks(decksToAdd: Deck[]): Promise<void> {
    assertWritable()
    decksToAdd.forEach((deck, index) => { deck.coverId ??= defaultCover(decks.value.length + index) })
    data.value.decks.push(...decksToAdd)
    try { await persist() }
    catch (error) {
      const ids = new Set(decksToAdd.map(deck => deck.id))
      data.value.decks = data.value.decks.filter(deck => !ids.has(deck.id))
      throw error
    }
  }

  async function splitMatchingCard(deckId: string, cardId: string, drafts: SplitDraft[], replaceOriginal = false, expectedSource?: string): Promise<Card[]> {
    assertWritable()
    const ui = useUiStore()
    if (ui.studyActive) throw new Error('Cannot split during study')
    const cards = splitCards(drafts)
    transactionBusy.value = true
    try {
      await pendingSave.catch(() => undefined)
      if (loadFailed || ui.studyActive) throw new Error('Library not available for splitting')
      const next: AppData = JSON.parse(JSON.stringify(data.value))
      const deck = next.decks.find(deck => deck.id === deckId)
      const index = deck?.cards.findIndex(card => card.id === cardId) ?? -1
      const source = deck?.cards[index]
      if (!deck || !source || source.task?.kind !== 'matching' || (expectedSource && JSON.stringify({ front: source.front, back: source.back, task: source.task }) !== expectedSource)) throw new Error('Source card changed')
      const pairIds = new Set(source.task.pairs.map(pair => pair.id))
      const selectedIds = drafts.filter(draft => draft.selected).map(draft => draft.pairId)
      if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !pairIds.has(id))) throw new Error('Invalid source pairs')
      deck.cards.splice(index + (replaceOriginal ? 0 : 1), replaceOriginal ? 1 : 0, ...cards)
      if (replaceOriginal && deck.cardStats) delete deck.cardStats[cardId]
      const normalized = normalizeAppData(next, todayStr())
      try { await repository.save(normalized) }
      catch (error) {
        saveError.value = error instanceof Error ? error.message : String(error)
        persistenceIssue.value = 'save'
        throw error
      }
      data.value = normalized
      saveError.value = null
      persistenceIssue.value = null
      return cards
    } finally { transactionBusy.value = false }
  }

  return {
    data,
    transactionBusy,
    splitMatchingCard,
    decks,
    ready,
    saveError,
    persistenceIssue,
    hydrate,
    persist,
    deckById,
    createDeck,
    renameDeck,
    updateDeck,
    deleteDeck,
    addCard,
    addCards,
    updateCard,
    deleteCard,
    addDeck,
    addDecks,
  }
})
