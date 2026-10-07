import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createCard, genId } from '../domain/importExport'
import type { AppData, Card, Deck } from '../domain/types'
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
    try { await persist() }
    catch (error) { Object.assign(deck, previous); throw error }
  }

  async function deleteDeck(deckId: string): Promise<void> {
    const index = data.value.decks.findIndex(deck => deck.id === deckId)
    if (index < 0) return
    const deck = data.value.decks[index]!
    data.value.decks = data.value.decks.filter((deck) => deck.id !== deckId)
    try { await persist() }
    catch (error) { data.value.decks.splice(index, 0, deck); throw error }
  }

  async function addCard(deckId: string, front: string, back: string): Promise<Card | undefined> {
    const deck = deckById(deckId)
    if (!deck) return undefined
    const card = createCard(front, back)
    deck.cards.push(card)
    try { await persist() }
    catch (error) { deck.cards = deck.cards.filter(item => item.id !== card.id); throw error }
    return card
  }

  async function updateCard(
    deckId: string,
    cardId: string,
    updates: Pick<Card, 'front' | 'back'>,
  ): Promise<void> {
    const card = deckById(deckId)?.cards.find((item) => item.id === cardId)
    if (!card) return
    const previous = { front: card.front, back: card.back }
    Object.assign(card, updates)
    try { await persist() }
    catch (error) { Object.assign(card, previous); throw error }
  }

  async function deleteCard(deckId: string, cardId: string): Promise<void> {
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
    decksToAdd.forEach((deck, index) => { deck.coverId ??= defaultCover(decks.value.length + index) })
    data.value.decks.push(...decksToAdd)
    try { await persist() }
    catch (error) {
      const ids = new Set(decksToAdd.map(deck => deck.id))
      data.value.decks = data.value.decks.filter(deck => !ids.has(deck.id))
      throw error
    }
  }

  return {
    data,
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
