import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { t, type TranslationKey } from '../i18n'

export interface CardEditorState {
  deckId: string
  cardId: string | null
}

export interface DeckEditorState {
  deckId: string | null
}

export interface Notification {
  id: number
  kind: 'success' | 'error'
  key: TranslationKey
  params: Record<string, string | number>
}

export const useUiStore = defineStore('ui', () => {
  const cardEditor = ref<CardEditorState | null>(null)
  const deckEditor = ref<DeckEditorState | null>(null)
  const notifications = ref<Notification[]>([])
  const toast = computed(() => {
    const message = notifications.value.at(-1)
    return message ? t(message.key, message.params) : ''
  })
  let nextId = 0
  const timers = new Map<number, { timer?: ReturnType<typeof setTimeout>; remaining: number; started: number; paused: Set<string> }>()

  function dismissNotification(id: number): void {
    clearTimeout(timers.get(id)?.timer)
    timers.delete(id)
    notifications.value = notifications.value.filter(message => message.id !== id)
  }
  function schedule(id: number): void {
    const clock = timers.get(id)
    if (!clock || clock.paused.size) return
    clock.started = Date.now()
    clock.timer = setTimeout(() => dismissNotification(id), clock.remaining)
  }
  function pauseNotification(id: number, reason: 'hover' | 'focus' | 'hidden'): void {
    const clock = timers.get(id)
    if (!clock || clock.paused.has(reason)) return
    if (!clock.paused.size) {
      clearTimeout(clock.timer)
      clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.started))
    }
    clock.paused.add(reason)
  }
  function resumeNotification(id: number, reason: 'hover' | 'focus' | 'hidden'): void {
    const clock = timers.get(id)
    if (!clock?.paused.delete(reason)) return
    schedule(id)
  }
  function notify(kind: Notification['kind'], key: TranslationKey, params: Notification['params']): void {
    const matching = notifications.value.find(message => message.kind === kind && message.key === key
      && Object.keys(message.params).length === Object.keys(params).length
      && Object.entries(params).every(([name, value]) => message.params[name] === value))
    const duration = kind === 'error' ? 8000 : 2600
    if (matching) {
      const clock = timers.get(matching.id)!
      clearTimeout(clock.timer)
      clock.remaining = duration
      schedule(matching.id)
      return
    }
    if (notifications.value.length === 3) {
      const oldest = notifications.value.find(message => message.kind === 'success') || notifications.value[0]!
      dismissNotification(oldest.id)
    }
    const id = ++nextId
    notifications.value.push({ id, kind, key, params: { ...params } })
    timers.set(id, { remaining: duration, started: Date.now(), paused: new Set() })
    schedule(id)
  }
  onScopeDispose(() => { for (const clock of timers.values()) clearTimeout(clock.timer); timers.clear() })

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
    notify('success', key, params)
  }
  function showError(key: TranslationKey, params: Record<string, string | number> = {}): void {
    notify('error', key, params)
  }

  return {
    cardEditor,
    deckEditor,
    toast,
    notifications,
    editCard,
    closeCardEditor,
    editDeck,
    closeDeckEditor,
    showToast,
    showError,
    dismissNotification,
    pauseNotification,
    resumeNotification,
  }
})
