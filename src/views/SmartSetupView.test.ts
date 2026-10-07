import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SmartSetupView from './SmartSetupView.vue'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'

const native = vi.hoisted(() => ({ getAiStatus: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' } }))
vi.mock('../services/ai', () => ({ getAiBridge: () => native }))
vi.mock('../services/native', () => ({ syncStatusBar: async () => undefined }))

let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper | undefined
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
beforeEach(() => {
  localStorage.clear()
  native.getAiStatus.mockReset().mockResolvedValue({ available: true, configured: false, credentialSource: null })
  localStorage.setItem('ankiweb_v1', JSON.stringify({ decks: [{ id: 'deck', name: 'Test', cards: [
    { id: 'card', front: '2 + 2?', back: '4', dueDate: '2000-01-01' },
  ] }] }))
  pinia = createPinia()
  setActivePinia(pinia)
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  disposePinia(pinia)
  vi.restoreAllMocks()
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

async function setup() {
  await useLibraryStore().hydrate()
  const settings = useSettingsStore()
  settings.smartConfig.deckIds = ['deck']
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/smart', name: 'smart-setup', component: SmartSetupView },
    { path: '/smart/session', name: 'smart-study', component: { template: '<div>Session</div>' } },
  ] })
  await router.push('/smart')
  wrapper = mount(SmartSetupView, { attachTo: document.body, global: {
    plugins: [pinia, router], stubs: { AppBar: true, AppIcon: true },
  } })
  await flushPromises()
  return { settings, router }
}

test('new iOS installation without a key can immediately start local study', async () => {
  const { settings, router } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe('local')
  await wrapper!.get('.session-plan .btn-smart').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/smart/session')
  expect(localStorage.getItem('smartl3arn_ios_ai_mode_initialized')).toBe('1')
})

test('new iOS installation with a configured key selects AI', async () => {
  native.getAiStatus.mockResolvedValue({ available: true, configured: true, credentialSource: 'stored' })
  const { settings } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe('openrouter')
})

test.each(['local', 'openrouter'] as const)('retains a previously stored %s decision without an initialization marker', async mode => {
  localStorage.setItem('ankiweb_smart_config', JSON.stringify({ evaluationMode: mode }))
  native.getAiStatus.mockResolvedValue({ available: true, configured: true, credentialSource: 'stored' })
  const { settings } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe(mode)
})

test('respects the legacy initialization marker', async () => {
  localStorage.setItem('smartl3arn_ios_ai_mode_initialized', '1')
  native.getAiStatus.mockResolvedValue({ available: true, configured: true, credentialSource: 'stored' })
  const { settings } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe('local')
})

test('a status failure leaves a fresh installation able to start locally', async () => {
  native.getAiStatus.mockRejectedValue(new Error('Native unavailable'))
  const { settings, router } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe('local')
  await wrapper!.get('.session-plan .btn-smart').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/smart/session')
})

test('a status failure never silently changes a stored AI decision', async () => {
  localStorage.setItem('ankiweb_smart_config', JSON.stringify({ evaluationMode: 'openrouter' }))
  native.getAiStatus.mockRejectedValue(new Error('Native unavailable'))
  const { settings } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe('openrouter')
})

test('failed initialization-marker saving preserves configured AI and announces a settings error', async () => {
  const write = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'smartl3arn_ios_ai_mode_initialized') throw new Error('PRIVATE_STORAGE_ERROR')
    return write.call(this, key, value)
  })
  native.getAiStatus.mockResolvedValue({ available: true, configured: true, credentialSource: 'stored' })
  const { settings } = await setup()
  expect(settings.smartConfig.evaluationMode).toBe('openrouter')
  expect(wrapper!.find('.ai-key-form').exists()).toBe(true)
  expect(useUiStore().notifications).toMatchObject([{ key: 'notifications.smartConfigFailed', kind: 'error' }])
})

test('a choice made while status is pending wins over automatic initialization', async () => {
  let resolveStatus!: (status: object) => void
  native.getAiStatus.mockReturnValue(new Promise(resolve => { resolveStatus = resolve }))
  const { settings } = await setup()
  const localButton = wrapper!.findAll('.ai-settings .segment-button')[0]!
  await localButton.trigger('click')
  resolveStatus({ available: true, configured: true, credentialSource: 'stored' })
  await flushPromises()
  expect(settings.smartConfig.evaluationMode).toBe('local')
})

test('reopening after an unconfigured first launch keeps local mode even if a key becomes available', async () => {
  const { settings, router } = await setup()
  wrapper!.unmount()
  native.getAiStatus.mockResolvedValue({ available: true, configured: true, credentialSource: 'stored' })
  wrapper = mount(SmartSetupView, { global: { plugins: [pinia, router], stubs: { AppBar: true, AppIcon: true } } })
  await flushPromises()
  expect(settings.smartConfig.evaluationMode).toBe('local')
})
