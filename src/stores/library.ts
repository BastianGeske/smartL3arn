import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createCard, genId } from '../domain/importExport'
import type { AppData, Card, Deck } from '../domain/types'
import { getStorageRepository } from '../services/storage'

export const useLibraryStore = defineStore('library', () => {
  const data = ref<AppData>({ decks: [] })
  const ready = ref(false)
  const saveError = ref<string | null>(null)
  const repository = getStorageRepository()
  let pendingSave: Promise<void> = Promise.resolve()

  const decks = computed(() => data.value.decks)

  async function hydrate(): Promise<void> {
    data.value = await repository.load()
    ready.value = true
  }

  function persist(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(data.value)) as AppData
    pendingSave = pendingSave
      .catch(() => undefined)
      .then(() => repository.save(snapshot))
      .then(() => {
        saveError.value = null
      })
      .catch((error: unknown) => {
        saveError.value = error instanceof Error ? error.message : String(error)
        throw error
      })
    return pendingSave
  }

  function deckById(deckId: string): Deck | undefined {
    return data.value.decks.find((deck) => deck.id === deckId)
  }

  async function createDeck(name: string): Promise<Deck> {
    const deck: Deck = { id: genId(), name, cards: [] }
    data.value.decks.push(deck)
    await persist()
    return deck
  }

  async function renameDeck(deckId: string, name: string): Promise<void> {
    const deck = deckById(deckId)
    if (!deck) return
    deck.name = name
    await persist()
  }

  async function deleteDeck(deckId: string): Promise<void> {
    data.value.decks = data.value.decks.filter((deck) => deck.id !== deckId)
    await persist()
  }

  async function addCard(deckId: string, front: string, back: string): Promise<Card | undefined> {
    const deck = deckById(deckId)
    if (!deck) return undefined
    const card = createCard(front, back)
    deck.cards.push(card)
    await persist()
    return card
  }

  async function updateCard(
    deckId: string,
    cardId: string,
    updates: Pick<Card, 'front' | 'back'>,
  ): Promise<void> {
    const card = deckById(deckId)?.cards.find((item) => item.id === cardId)
    if (!card) return
    Object.assign(card, updates)
    await persist()
  }

  async function deleteCard(deckId: string, cardId: string): Promise<void> {
    const deck = deckById(deckId)
    if (!deck) return
    deck.cards = deck.cards.filter((card) => card.id !== cardId)
    if (deck.cardStats) delete deck.cardStats[cardId]
    await persist()
  }

  async function addDeck(deck: Deck): Promise<void> {
    data.value.decks.push(deck)
    await persist()
  }

  async function addDecks(decksToAdd: Deck[]): Promise<void> {
    data.value.decks.push(...decksToAdd)
    await persist()
  }

  return {
    data,
    decks,
    ready,
    saveError,
    hydrate,
    persist,
    deckById,
    createDeck,
    renameDeck,
    deleteDeck,
    addCard,
    updateCard,
    deleteCard,
    addDeck,
    addDecks,
  }
})
