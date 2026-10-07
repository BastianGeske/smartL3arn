import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { importJsonFile } from '../services/importer'
import { DECK_COVERS } from '../domain/deckCovers'
import { normalizeAppData } from '../../shared/data-validation.mjs'
import DeckEditorModal from './DeckEditorModal.vue'
import { browserStorage } from '../services/storage/browserStorage'

let wrapper: VueWrapper | undefined
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); document.body.classList.remove('modal-open') })

test('selected image survives saving, reopening and backup import', async () => {
  const library = useLibraryStore()
  await library.hydrate()
  const deck = await library.createDeck('Biology')
  wrapper = mount(DeckEditorModal)
  const ui = useUiStore()
  ui.editDeck(deck.id)
  await flushPromises()
  expect(wrapper.findAll('input[type="radio"]')).toHaveLength(13)
  await wrapper.get('input[value="sage"]').setValue()
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await flushPromises()
  expect(library.deckById(deck.id)?.coverId).toBe('sage')
  const backup = JSON.parse(localStorage.getItem('ankiweb_v1')!)
  expect(backup.decks[0].coverId).toBe('sage')
  ui.editDeck(deck.id)
  await flushPromises()
  expect((wrapper.get('input[value="sage"]').element as HTMLInputElement).checked).toBe(true)
  const [imported] = await importJsonFile(new File([JSON.stringify(backup)], 'backup.json'))
  expect(imported?.coverId).toBe('sage')
})

test('cancelling an image change keeps the original image', async () => {
  const library = useLibraryStore()
  await library.hydrate()
  const deck = await library.createDeck('Test', 'rose')
  wrapper = mount(DeckEditorModal)
  useUiStore().editDeck(deck.id)
  await flushPromises()
  await wrapper.get('input[value="navy"]').setValue()
  await wrapper.get('.modal-footer .btn-secondary').trigger('click')
  expect(library.deckById(deck.id)?.coverId).toBe('rose')
})

test('new decks use the image chosen in the editor', async () => {
  const library = useLibraryStore()
  await library.hydrate()
  wrapper = mount(DeckEditorModal)
  useUiStore().editDeck()
  await flushPromises()
  await wrapper.get('#deck-modal-name').setValue('Languages')
  await wrapper.get('input[value="sky"]').setValue()
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await flushPromises()
  expect(library.decks[0]).toMatchObject({ name: 'Languages', coverId: 'sky' })
})

test('deleting a deck persists deletion and keeps legacy images stable', async () => {
  localStorage.setItem('ankiweb_v1', JSON.stringify({ decks: [
    { id: 'first', name: 'First', cards: [] }, { id: 'second', name: 'Second', cards: [] },
  ] }))
  const library = useLibraryStore()
  await library.hydrate()
  expect(library.deckById('second')?.coverId).toBe('teal')
  await library.deleteDeck('first')
  const saved = JSON.parse(localStorage.getItem('ankiweb_v1')!)
  expect(saved.decks).toHaveLength(1)
  expect(saved.decks[0]).toMatchObject({ id: 'second', coverId: 'teal' })
})

test('all cover IDs round-trip; remote URLs and arbitrary paths are discarded', () => {
  for (const coverId of [...DECK_COVERS.map(cover => cover.id), 'https://example.com/tracker.png', '../../secret', '__proto__']) {
    const data = normalizeAppData({ decks: [{ id: 'deck', name: 'Test', cards: [], coverId }] }, '2026-10-06')
    expect(data.decks[0]?.coverId).toBe(DECK_COVERS.some(cover => cover.id === coverId) ? coverId : undefined)
  }
})

test('failed saving shows an error and retry creates only one deck', async () => {
  const library = useLibraryStore()
  await library.hydrate()
  wrapper = mount(DeckEditorModal)
  useUiStore().editDeck()
  await flushPromises()
  await wrapper.get('#deck-modal-name').setValue('Languages')
  await wrapper.get('input[value="sky"]').setValue()
  vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('Storage full'))
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(library.decks).toHaveLength(0)
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await flushPromises()
  expect(library.decks).toHaveLength(1)
  expect(library.decks[0]?.coverId).toBe('sky')
  expect(wrapper.find('.modal-overlay').exists()).toBe(false)
})

test('failed update preserves the original image and name', async () => {
  const library = useLibraryStore()
  await library.hydrate()
  const deck = await library.createDeck('Original', 'rose')
  vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('Storage full'))
  await expect(library.updateDeck(deck.id, 'Changed', 'navy')).rejects.toThrow()
  expect(library.deckById(deck.id)).toMatchObject({ name: 'Original', coverId: 'rose' })
})
