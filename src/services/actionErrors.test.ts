import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import HomeView from '../views/HomeView.vue'
import BrowseView from '../views/BrowseView.vue'
import CardEditorModal from '../components/CardEditorModal.vue'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { browserStorage } from './storage/browserStorage'
import { useStudyStore } from '../stores/study'

const saveExport = vi.hoisted(() => vi.fn())
vi.mock('./native', () => ({ saveExport, syncStatusBar: async () => undefined }))
let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper | undefined
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); saveExport.mockResolvedValue('exported') })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; disposePinia(pinia); vi.restoreAllMocks(); document.body.classList.remove('modal-open') })
async function home() {
  const library = useLibraryStore(); await library.hydrate(); await library.createDeck('Test')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: HomeView }, { path: '/browse/:deckId', component: BrowseView }] })
  await router.push('/')
  wrapper = mount(HomeView, { global: { plugins: [router], stubs: { AppBar: true, AppIcon: true, AppMenu: { template: '<div><slot name="trigger" /><slot /></div>' } } } })
  return library
}
function importFile(content: string) {
  const input = wrapper!.findAll('input[type="file"]')[0]!
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'backup.json', size: content.length, text: async () => content }] })
  return input.trigger('change')
}
test('invalid import uses a typed notification and never a blocking alert', async () => {
  await home()
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
  await importFile('not json'); await flushPromises()
  expect(useUiStore().notifications).toMatchObject([{ key: 'import.parseError', kind: 'error' }])
  expect(alert).not.toHaveBeenCalled()
})
test('a valid import with failed saving is not called a parsing failure and can be retried without duplicates', async () => {
  const library = await home()
  vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('PRIVATE_PATH'))
  const data = JSON.stringify({ decks: [{ id: 'imported', name: 'Imported', cards: [] }] })
  await importFile(data); await flushPromises()
  expect(library.persistenceIssue).toBe('save')
  expect(library.decks).toHaveLength(1)
  expect(useUiStore().notifications).toHaveLength(0)
  await importFile(data); await flushPromises()
  expect(library.decks).toHaveLength(2)
  expect(library.persistenceIssue).toBeNull()
  expect(useUiStore().notifications).toMatchObject([{ key: 'import.decks', kind: 'success' }])
})
test('failed exports are reported without exposing the technical exception', async () => {
  await home(); saveExport.mockRejectedValueOnce(new Error('PRIVATE_NATIVE_ERROR'))
  const button = wrapper!.findAll('button').find(button => button.text().includes('Backup') || button.text().includes('backup'))!
  await button.trigger('click'); await flushPromises()
  expect(useUiStore().notifications).toMatchObject([{ key: 'notifications.exportFailed', params: {}, kind: 'error' }])
})
test('failed deletion retains the deck and never emits a success', async () => {
  const library = await home()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('Disk full'))
  await wrapper!.get('.is-danger').trigger('click'); await flushPromises()
  expect(library.decks).toHaveLength(1)
  expect(library.persistenceIssue).toBe('save')
  expect(useUiStore().notifications).toHaveLength(0)
})
test('failed card saving keeps the editor and input open; retry creates one card', async () => {
  const library = useLibraryStore(); await library.hydrate(); const deck = await library.createDeck('Test')
  wrapper = mount(CardEditorModal)
  useUiStore().editCard(deck.id)
  await flushPromises()
  await wrapper.get('#modal-front').setValue('Question')
  await wrapper.get('#modal-back').setValue('Answer')
  vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('Disk full'))
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect((wrapper.get('#modal-front').element as HTMLTextAreaElement).value).toBe('Question')
  expect(library.deckById(deck.id)?.cards).toHaveLength(0)
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(library.deckById(deck.id)?.cards).toHaveLength(1)
  expect(wrapper.find('.modal-overlay').exists()).toBe(false)
})
test('unsaved learning progress stays in memory and is included in the next successful save', async () => {
  const library = useLibraryStore(); await library.hydrate(); const deck = await library.createDeck('Test')
  await library.addCard(deck.id, 'First question', 'Answer')
  await library.addCard(deck.id, 'Second question', 'Answer')
  const study = useStudyStore(); expect(study.start(deck.id)).toBe(true)
  vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('Disk full'))
  await study.rate(2)
  expect(library.persistenceIssue).toBe('save')
  expect(study.sessionStats.reviewed).toBe(1)
  await study.rate(2)
  expect(library.persistenceIssue).toBeNull()
  expect(study.sessionStats.reviewed).toBe(2)
  const saved = JSON.parse(localStorage.getItem('ankiweb_v1')!)
  expect(saved.decks[0].sessions[0].reviewed).toBe(2)
})
