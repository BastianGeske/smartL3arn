import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { t, type TranslationKey } from '../i18n'

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
  const toastMessage = ref<{ key: TranslationKey; params: Record<string, string | number> } | null>(null)
  const toast = computed(() => toastMessage.value ? t(toastMessage.value.key, toastMessage.value.params) : '')
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

  function showToast(key: TranslationKey, params: Record<string, string | number> = {}): void {
    toastMessage.value = { key, params }
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastMessage.value = null
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
