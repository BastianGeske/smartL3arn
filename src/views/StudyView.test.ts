import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import StudyView from './StudyView.vue'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'
import { createCard } from '../domain/importExport'

vi.mock('../services/native', () => ({ syncStatusBar: async () => undefined }))
let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper | undefined
beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; disposePinia(pinia); vi.restoreAllMocks() })
async function mountView(deckId: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div>Library</div>' } },
    { path: '/study/:deckId', component: StudyView },
  ] })
  await router.push(`/study/${deckId}`)
  wrapper = mount(StudyView, { global: { plugins: [pinia, router], stubs: {
    AppIcon: true, StudyHeader: true, StudyCardBody: true, StudyRatingButtons: true, StudyCompletion: true,
  } } })
  await flushPromises()
}

it('preserves partial history when a dormant matching card is replaced', async () => {
  const library = useLibraryStore()
  const deck = await library.createDeck('History')
  await library.addCard(deck.id, 'First', 'Answer')
  const source = await library.addCard(deck.id, 'Match', 'A → 1\nB → 2', { kind: 'matching', pairs: [
    { id: 'a', left: 'A', right: '1' }, { id: 'b', left: 'B', right: '2' },
  ] })
  const study = useStudyStore()
  study.start(deck.id)
  study.flip(); await study.rate(3)
  expect(study.complete).toBe(false)
  const cards = await library.splitMatchingCard(deck.id, source!.id, [
    { pairId: 'a', selected: true, front: 'What matches A?', back: '1' },
    { pairId: 'b', selected: true, front: 'What matches B?', back: '2' },
  ], true)
  await mountView(deck.id)
  expect(library.deckById(deck.id)!.sessions).toHaveLength(1)
  expect(library.deckById(deck.id)!.sessions![0]).toMatchObject({ reviewed: 1, easy: 1 })
  await vi.waitFor(() => expect(study.sessionStats.reviewed).toBe(0))
  expect(study.mainQueue).not.toContain(source!.id)
  expect(study.mainQueue).toEqual(expect.arrayContaining(cards.map(card => card.id)))
})

it('resumes a large intact queue using one card-index pass', async () => {
  const library = useLibraryStore()
  const deck = await library.createDeck('Large')
  deck.cards = Array.from({ length: 10_000 }, (_, index) => createCard(`Q${index}`, 'Answer'))
  const study = useStudyStore()
  study.start(deck.id)
  study.index = 3
  study.sessionStats.reviewed = 3
  const start = vi.spyOn(study, 'start')
  const map = vi.spyOn(deck.cards, 'map')
  const some = vi.spyOn(deck.cards, 'some')
  await mountView(deck.id)
  expect(start).not.toHaveBeenCalled()
  expect(study.index).toBe(3)
  expect(study.sessionStats.reviewed).toBe(3)
  expect(map).toHaveBeenCalledOnce()
  // The upcoming-date computed may make one scan; it must not scan per queue entry.
  expect(some.mock.calls.length).toBeLessThanOrEqual(1)
})
