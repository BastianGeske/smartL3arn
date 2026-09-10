import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface CardEditorState {
  deckId: string
  cardId: string | null
}

export interface DeckEditorState {
  deckId: string | null
}

export const useUiStore = defineStore('ui', () => {
  const cardEditor = ref<CardEditorState | null>(null)
  const deckEditor = ref<DeckEditorState | null>(null)
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function editCard(deckId: string, cardId: string | null = null): void {
    cardEditor.value = { deckId, cardId }
  }

  function closeCardEditor(): void {
    cardEditor.value = null
  }

  function editDeck(deckId: string | null = null): void {
    deckEditor.value = { deckId }
  }

  function closeDeckEditor(): void {
    deckEditor.value = null
  }

  function showToast(message: string): void {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = ''
    }, 2600)
  }

  return {
    cardEditor,
    deckEditor,
    toast,
    editCard,
    closeCardEditor,
    editDeck,
    closeDeckEditor,
    showToast,
  }
})
