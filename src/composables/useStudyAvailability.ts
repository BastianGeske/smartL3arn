import { computed, ref, watchEffect } from 'vue'
import { localDateStr } from '../domain/dates'
import { studyAvailability } from '../domain/study/practice'
import type { Deck } from '../domain/types'

export function useStudyAvailability(decks: () => Deck[]) {
  const now = ref(Date.now())
  const availability = computed(() => studyAvailability(decks(), now.value))

  // Reuse the counts between unlocks. Changes to cards or selection invalidate
  // the computed value independently of the clock.
  function refreshAvailability() {
    const current = Date.now()
    const next = availability.value.nextPracticeAt
    if (current < now.value || (next !== null && next <= current)
      || localDateStr(new Date(current)) !== localDateStr(new Date(now.value))) {
      now.value = current
    }
  }
  return { availability, refreshAvailability }
}

export function useDeckPracticeCooldowns(decks: () => Deck[]) {
  const now = ref(Date.now())
  const cooldowns = computed(() => {
    const blocked = new Map<string, number>()
    for (const deck of decks()) {
      const { count, nextPracticeAt } = studyAvailability([deck], now.value)
      if (!count && nextPracticeAt !== null) blocked.set(deck.id, nextPracticeAt)
    }
    return blocked
  })

  watchEffect(onCleanup => {
    let next = Infinity
    for (const unlock of cooldowns.value.values()) next = Math.min(next, unlock)
    if (next === Infinity) return
    // Browser timeouts are limited to a signed 32-bit delay.
    const delay = Math.max(0, Math.min(next - Date.now(), 2_147_483_647))
    const timer = setTimeout(() => { now.value = Date.now() }, delay)
    onCleanup(() => clearTimeout(timer))
  })
  return cooldowns
}
