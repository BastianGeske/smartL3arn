import { BrowserStorage } from '../services/storage/browserStorage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import BrowseView from './BrowseView.vue'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { setLanguage, t } from '../i18n'
let pinia: ReturnType<typeof createPinia>, wrapper: VueWrapper
beforeEach(async () => {
  localStorage.clear(); delete window.smartL3arn; setLanguage('de')
  pinia = createPinia(); setActivePinia(pinia)
  const library = useLibraryStore()
  library.data = { decks: [{ id: 'deck', name: 'Biologie', cards: [{ id: 'card', front: 'Frage', back: 'Antwort', interval: 15, repetitions: 4, dueDate: '2026-11-15', easeFactor: 2.5 }] }] }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/deck/:deckId', component: BrowseView }] })
  await router.push('/deck/deck'); await router.isReady()
  wrapper = mount(BrowseView, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { AppBar: true, AppMenu: { template: '<div><slot /></div>' } } } })
})
afterEach(() => { wrapper.unmount(); disposePinia(pinia); vi.restoreAllMocks(); setLanguage('en') })
async function importFile(content: unknown, raw = false) {
  const input = wrapper.get('input[accept=".json"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([raw ? String(content) : JSON.stringify(content)], 'zusatz.json')] })
  await input.trigger('change'); await flushPromises()
  expect((input.element as HTMLInputElement).value).toBe('')
}
const payload = () => [{ id: 'card', back: 'Erweiterte Antwort' }, { front: 'Neue Frage', back: 'Neue Antwort' }]
it('previews changes, cancels safely, then saves both kinds of changes into the open deck', async () => {
  const library = useLibraryStore(), before = JSON.stringify(library.data)
  await importFile(payload())
  expect(wrapper.get('[role="dialog"]').text()).toContain('1 neu · 1 überarbeitet · 0 unverändert')
  expect(wrapper.get('[role="dialog"]').text()).toContain('Antwort')
  expect(wrapper.get('[role="dialog"]').text()).toContain('Erweiterte Antwort')
  expect(document.activeElement?.getAttribute('aria-label')).toBe(t('common.cancel'))
  expect(wrapper.get('.app-shell').attributes('inert')).toBeDefined()
  expect(JSON.stringify(library.data)).toBe(before)
  await wrapper.get('.modal-footer .btn-secondary').trigger('click')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(JSON.stringify(library.data)).toBe(before)
  await importFile(payload())
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
  expect(library.decks).toHaveLength(1)
  expect(library.decks[0]!.cards).toHaveLength(2)
  expect(library.decks[0]!.cards[0]).toMatchObject({ id: 'card', back: 'Erweiterte Antwort', repetitions: 4, interval: 15 })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(wrapper.find('.import-quality-summary').exists()).toBe(true)
  expect(useUiStore().notifications.at(-1)?.key).toBe('supplement.saved')
  expect((await new BrowserStorage().load()).decks[0].cards).toHaveLength(2)
})
it('reports invalid files and disables saving an unchanged supplement', async () => {
  await importFile('{invalid', true)
  expect(useUiStore().notifications.at(-1)?.key).toBe('import.parseError')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  await importFile([{ id: 'card', back: 'Antwort' }])
  expect(wrapper.get('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
})
it('keeps a failed save open for retry and shows no success or partial changes', async () => {
  const library = useLibraryStore(), before = JSON.stringify(library.data)
  const storage = vi.spyOn(BrowserStorage.prototype, 'save').mockImplementation(() => { throw new Error('Quota exceeded') })
  await importFile(payload())
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe(t('supplement.saveFailed'))
  expect(JSON.stringify(library.data)).toBe(before)
  expect(useUiStore().notifications.some(item => item.key === 'supplement.saved')).toBe(false)
  storage.mockRestore()
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
  expect(library.decks[0]!.cards).toHaveLength(2)
})
it('paginates previews and restores background access when closed with Escape', async () => {
  await importFile(Array.from({ length: 23 }, (_, index) => ({ front: `Neue Frage ${index}`, back: 'Antwort' })))
  expect(wrapper.findAll('.supplement-changes > li')).toHaveLength(20)
  await wrapper.get('.task-row-actions button:last-child').trigger('click')
  expect(wrapper.findAll('.supplement-changes > li')).toHaveLength(3)
  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(wrapper.get('.app-shell').attributes('inert')).toBeUndefined()
  expect(document.body.classList.contains('modal-open')).toBe(false)
})

it.each(['other', 'home', 'away-and-back', 'deleted'] as const)('cancels an in-flight TXT import when the target changes (%s)', async change => {
  const library = useLibraryStore(), ui = useUiStore()
  const other = await library.createDeck('Other')
  const input = wrapper.get('input[accept=".txt,.csv,.tsv"]')
  let finish!: (value: string) => void
  const file = { size: 3, text: () => new Promise<string>(resolve => { finish = resolve }) }
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  if (change === 'deleted') await library.deleteDeck('deck')
  else {
    await wrapper.vm.$router.push(change === 'other' ? '/deck/' + other.id : '/')
    if (change === 'away-and-back') await wrapper.vm.$router.push('/deck/deck')
  }
  finish('Q\tA')
  await flushPromises()
  expect(ui.notifications.some(message => message.key === 'import.cards')).toBe(false)
  expect(library.deckById(other.id)?.cards).toHaveLength(0)
  if (change !== 'deleted') expect(library.deckById('deck')?.cards).toHaveLength(1)
})

it('saves line breaks from a multiline table cell and restores them after reload', async () => {
  const answer = wrapper.get<HTMLTextAreaElement>('textarea[aria-label="' + t('browse.editBack') + '"]')
  await answer.setValue('Eins\nZwei')
  await answer.trigger('blur')
  expect((await new BrowserStorage().load()).decks[0].cards[0].back).toBe('Eins\nZwei')
})
