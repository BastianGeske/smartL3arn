import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createCard } from '../domain/importExport'
import { useLibraryStore } from '../stores/library'
import HomeView from './HomeView.vue'
import BrowseView from './BrowseView.vue'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 10, 18, 23, 59, 59))
  pinia = createPinia()
  setActivePinia(pinia)
  const card = { ...createCard('Q', 'A'), dueDate: '2026-11-19' }
  useLibraryStore().data = { decks: [{ id: 'deck', name: 'Deck', cards: [card] }] }
})
afterEach(() => { disposePinia(pinia); vi.useRealTimers() })

it.each(['midnight', 'foreground'])('updates due counts in both views at %s', async event => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:deckId', component: BrowseView }] })
  await router.push('/deck')
  const options = { global: { plugins: [router, pinia], stubs: { AppBar: true, AppIcon: true, AppMenu: true } } }
  const home = mount(HomeView, options), browse = mount(BrowseView, options)
  try {
    const due = () => [home.get('.summary-item strong').text(), browse.get('.deck-summary > div:nth-child(2) strong').text()]
    expect(due()).toEqual(['0', '0'])
    if (event === 'midnight') vi.advanceTimersByTime(1000)
    else {
      vi.setSystemTime(new Date(2026, 10, 19, 12))
      document.dispatchEvent(new Event('visibilitychange'))
    }
    await nextTick()
    expect(due()).toEqual(['1', '1'])
  } finally { home.unmount(); browse.unmount() }
})
