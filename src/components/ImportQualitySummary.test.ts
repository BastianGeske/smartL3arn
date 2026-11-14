import { beforeEach, afterEach, expect, it } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ImportQualitySummary from './ImportQualitySummary.vue'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { importJsonFile } from '../services/importer'
let pinia: ReturnType<typeof createPinia>
beforeEach(() => { localStorage.clear(); delete window.smartL3arn; pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => disposePinia(pinia))
it('links to the final imported deck/card IDs and removes resolved hints after editing', async () => {
  const [deck] = await importJsonFile(new File([JSON.stringify({ id: 'external', name: 'Imported', cards: [{ id: 'card', front: 'Fact?', back: 'False', task: { kind: 'true_false', correct: false } }] })], 'cards.json'))
  const library = useLibraryStore(); await library.addDecks([deck!])
  expect(deck!.id).not.toBe('external')
  const wrapper = mount(ImportQualitySummary, { props: { deckIds: [deck!.id] } })
  await wrapper.get('.quality-card-link').trigger('click')
  expect(useUiStore().cardEditor).toEqual({ deckId: deck!.id, cardId: 'card' })
  await library.updateCard(deck!.id, 'card', { front: 'Fact?', back: 'False', task: { kind: 'true_false', correct: false, explanation: 'Here is the correct version.' } })
  expect(wrapper.findAll('.quality-card-link')).toHaveLength(0)
  expect(wrapper.find('details').exists()).toBe(false)
  expect(library.decks[0]!.cards).toHaveLength(1)
  wrapper.unmount()
})
it('paginates large imports and clamps the current page after cards are fixed or removed', async () => {
  const library = useLibraryStore()
  const [deck] = await importJsonFile(new File([JSON.stringify({ name: 'Large', cards: Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, front: `Q${i}`, back: 'A', task: { kind: 'true_false', correct: true } })) })], 'large.json'))
  await library.addDecks([deck!])
  const wrapper = mount(ImportQualitySummary, { props: { deckIds: [deck!.id] } })
  expect(wrapper.findAll('.quality-card-link')).toHaveLength(20)
  await wrapper.get('.task-row-actions').findAll('button')[1]!.trigger('click')
  expect(wrapper.findAll('.quality-card-link')).toHaveLength(3)
  for (let i = 20; i < 23; i++) await library.deleteCard(deck!.id, `c${i}`)
  expect(wrapper.findAll('.quality-card-link')).toHaveLength(20)
  expect(wrapper.find('.task-row-actions').exists()).toBe(false)
  wrapper.unmount()
})
