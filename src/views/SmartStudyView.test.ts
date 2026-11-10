import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SmartStudyView from './SmartStudyView.vue'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useSmartStudyStore } from '../stores/smartStudy'
import { PRACTICE_DELAY_MS } from '../domain/study/practice'
import { t } from '../i18n'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('../services/ai', () => ({ getAiBridge: () => undefined }))
vi.mock('../services/native', () => ({ syncStatusBar: async () => undefined }))

let pinia: ReturnType<typeof createPinia>
let smart: ReturnType<typeof useSmartStudyStore>
let wrapper: VueWrapper | undefined

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date('2026-11-10T12:00:00'))
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  const library = useLibraryStore()
  const deck = await library.createDeck('Cooldown')
  await library.addCard(deck.id, 'Question', 'Answer')
  const settings = useSettingsStore()
  settings.smartConfig.deckIds = [deck.id]
  settings.smartConfig.duration = 0
  settings.smartConfig.evaluationMode = 'local'
  settings.smartConfig.techniques.typeRecall = false
  smart = useSmartStudyStore()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div>Library</div>' } },
    { path: '/smart', name: 'smart-setup', component: { template: '<div>Setup</div>' } },
    { path: '/smart/session', component: SmartStudyView },
  ] })
  await router.push('/smart/session')
  wrapper = mount(SmartStudyView, { global: {
    plugins: [pinia, router],
    stubs: {
      AppIcon: true, StudyHeader: true, StudyCardBody: true, StudyRatingButtons: true,
      SmartCardMeta: true, TaskResponse: true, WorkingSteps: true, MathContent: true,
    },
  } })
  await flushPromises()
}

async function finishLastCard(rating: 0 | 1) {
  await smart.start()
  await mountView()
  smart.reveal()
  await smart.rate(rating)
  await flushPromises()
  expect(smart.isDone).toBe(true)
}

it.each([0, 1] as const)('offers another session when the final rating %s cooldown expires', async rating => {
  await finishLastCard(rating)
  const savedDeck = JSON.stringify(useLibraryStore().decks[0])
  const availableAt = smart.nextPracticeAt!
  const availabilityMessage = t('study.availableAfter', { time: new Date(availableAt).toLocaleString() })
  expect(wrapper!.text()).toContain(availabilityMessage)
  expect(wrapper!.find('.smart-done-actions .btn-smart').exists()).toBe(false)

  await vi.advanceTimersByTimeAsync(PRACTICE_DELAY_MS - 1)
  expect(wrapper!.find('.smart-done-actions .btn-smart').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(wrapper!.text()).not.toContain(availabilityMessage)
  expect(smart.nextPracticeAt).toBeNull()
  const nextButton = wrapper!.get('.smart-done-actions .btn-smart')
  expect(nextButton.text()).toContain(t('smart.newSession'))
  expect(JSON.stringify(useLibraryStore().decks[0])).toBe(savedDeck)
  expect(smart.session!.timeUp).toBe(false)

  await nextButton.trigger('click')
  await flushPromises()
  expect(smart.isDone).toBe(false)
  expect(smart.currentItem?.purpose).toBe('relearning')
  expect(smart.session!.sessionStats.reviewed).toBe(0)
  // Only the new session timer remains; the completion refresh was removed.
  expect(vi.getTimerCount()).toBe(1)
})

it('cleans up completion refreshes when leaving the view', async () => {
  await finishLastCard(0)
  expect(vi.getTimerCount()).toBe(1)
  wrapper!.unmount()
  wrapper = undefined
  expect(vi.getTimerCount()).toBe(0)
})

it('does not restart a completed Pomodoro session timer when reopening the view', async () => {
  useSettingsStore().smartConfig.duration = 25
  await finishLastCard(0)
  const savedSession = JSON.stringify(smart.session)
  wrapper!.unmount()
  wrapper = undefined
  await vi.advanceTimersByTimeAsync(26 * 60_000)
  await mountView()
  await vi.advanceTimersByTimeAsync(500)
  expect(smart.isDone).toBe(true)
  expect(smart.isBreak).toBe(false)
  expect(JSON.stringify(smart.session)).toBe(savedSession)
  expect(wrapper!.find('.smart-done-actions .btn-smart').exists()).toBe(true)
  expect(vi.getTimerCount()).toBe(1)
})

it('keeps the Pomodoro break timer separate from completion refreshes', async () => {
  useSettingsStore().smartConfig.duration = 25
  await smart.start()
  await mountView()
  await vi.advanceTimersByTimeAsync(25 * 60_000)
  expect(smart.isBreak).toBe(true)
  expect(smart.isDone).toBe(false)
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(7 * 60_000)
  expect(smart.session!.breakDone).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
