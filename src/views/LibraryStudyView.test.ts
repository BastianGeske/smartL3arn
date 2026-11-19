import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { PRACTICE_DELAY_MS } from '../domain/study/practice'
import { setLanguage, t } from '../i18n'
import { BrowserStorage } from '../services/storage/browserStorage'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'
import BrowseView from './BrowseView.vue'
import HomeView from './HomeView.vue'

let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper | undefined
beforeEach(() => {
  localStorage.clear()
  delete window.smartL3arn
  setLanguage('en')
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.useRealTimers()
  vi.restoreAllMocks()
  setLanguage('system')
})

async function open(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/deck/:deckId', name: 'browse', component: BrowseView },
    { path: '/study/:deckId', name: 'study', component: { template: '<div />' } },
  ] })
  await router.push(path)
  wrapper = mount(RouterView, { global: { plugins: [pinia, router], stubs: { AppBar: true } } })
  return { router, view: wrapper }
}

it.each([
  { screen: 'Home', rating: 0, buttonSelector: '.deck-row-actions button:first-child' },
  { screen: 'Home', rating: 1, buttonSelector: '.deck-row-actions button:first-child' },
  { screen: 'Browse', rating: 0, buttonSelector: '.page-heading-actions button:first-child' },
  { screen: 'Browse', rating: 1, buttonSelector: '.page-heading-actions button:first-child' },
] as const)('$screen enables study when rating $rating cooldown expires', async ({ screen, rating, buttonSelector }) => {
  vi.useFakeTimers()
  const library = useLibraryStore()
  const deck = await library.createDeck('Practice')
  await library.addCard(deck.id, 'Front', 'Back')
  const study = useStudyStore()
  expect(study.start(deck.id)).toBe(true)
  study.flip()
  await study.rate(rating)
  await study.end()
  const unlock = Date.now() + PRACTICE_DELAY_MS
  const message = t('study.availableAfter', { time: new Date(unlock).toLocaleString() })
  const { router, view } = await open(screen === 'Home' ? '/' : '/deck/' + deck.id)
  const button = () => view.get<HTMLButtonElement>(buttonSelector)

  expect(button().element.disabled).toBe(true)
  expect(view.text()).toContain(message)
  await vi.advanceTimersByTimeAsync(PRACTICE_DELAY_MS - 1)
  expect(button().element.disabled).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(button().element.disabled).toBe(false)
  expect(view.text()).not.toContain(message)
  await button().trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('study')
  expect(study.currentCard?.front).toBe('Front')
})

it('saves both inline edits when they queue behind another library write', async () => {
  const library = useLibraryStore()
  const deck = await library.createDeck('Practice')
  const card = (await library.addCard(deck.id, 'Old front', 'Old back', { kind: 'short_text' }))!
  const { view } = await open('/deck/' + deck.id)
  const originalSave = BrowserStorage.prototype.save
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
    .mockImplementationOnce(async function (this: BrowserStorage, data) {
      await blocked
      await originalSave.call(this, data)
    })
  const renaming = library.renameDeck(deck.id, 'New name')
  await nextTick()

  const front = view.get('td.td-front textarea')
  await front.setValue('New front')
  await front.trigger('blur')
  const back = view.get('td.td-back textarea')
  await back.setValue('New back')
  await back.trigger('blur')
  expect(save).toHaveBeenCalledTimes(1)

  release()
  await renaming
  // Queue a read after both edits so their writes have settled.
  await library.persist(() => false)
  const saved = (await new BrowserStorage().load()).decks[0]?.cards[0]
  expect(saved).toMatchObject({ id: card.id, front: 'New front', back: 'New back', task: { kind: 'short_text' } })
})
