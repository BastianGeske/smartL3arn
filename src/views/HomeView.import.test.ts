import { BrowserStorage } from '../services/storage/browserStorage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import HomeView from './HomeView.vue'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
let pinia: ReturnType<typeof createPinia>, wrapper: VueWrapper
beforeEach(async () => {
  localStorage.clear(); delete window.smartL3arn
  pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'home', component: HomeView }, { path: '/deck/:deckId', name: 'browse', component: { template: '<div />' } }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(HomeView, { global: { plugins: [pinia, router], stubs: { AppBar: true, AppMenu: { template: '<div><slot /></div>' } } } })
})
afterEach(() => { wrapper.unmount(); disposePinia(pinia); vi.restoreAllMocks() })
async function importFile(content: string) {
  const input = wrapper.get('input[accept=".json"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([content], 'deck.json')] })
  await input.trigger('change'); await flushPromises()
}
const payload = () => JSON.stringify({ name: 'Quality', cards: [{ id: 'bool', front: 'Fact?', back: 'No', task: { kind: 'true_false', correct: false } }] })
it('keeps malformed JSON as a technical error and shows quality guidance only after a successful save', async () => {
  const library = useLibraryStore(), ui = useUiStore()
  await importFile('{bad-json')
  expect(ui.notifications.at(-1)?.key).toBe('import.parseError')
  expect(library.decks).toHaveLength(0)
  expect(wrapper.find('.import-quality-summary').exists()).toBe(false)
  await importFile(payload())
  expect(library.decks).toHaveLength(1)
  await vi.waitFor(() => expect(wrapper.find('.import-quality-summary').exists()).toBe(true))
  await wrapper.get('.quality-card-link').trigger('click')
  expect(ui.cardEditor).toEqual({ deckId: library.decks[0]!.id, cardId: 'bool' })
})
it('does not report or retain a deck whose import could not be persisted', async () => {
  vi.spyOn(BrowserStorage.prototype, 'save').mockImplementation(() => { throw new Error('Quota exceeded') })
  await importFile(payload())
  expect(useLibraryStore().decks).toHaveLength(0)
  expect(wrapper.find('.import-quality-summary').exists()).toBe(false)
  expect(useUiStore().notifications.some(notification => notification.key === 'import.decks')).toBe(false)
})
