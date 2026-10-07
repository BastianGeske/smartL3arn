import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'
import { setLanguage, languagePreference } from '../i18n'
import PreferencesView from '../views/PreferencesView.vue'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => { localStorage.clear(); setLanguage('en'); pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => { disposePinia(pinia); vi.restoreAllMocks(); document.body.classList.remove('dark') })
test('failed appearance saving preserves the session choice and reports a safe localized error', async () => {
  const settings = useSettingsStore()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('PRIVATE_STORAGE_PATH') })
  settings.dark = true
  await nextTick()
  expect(settings.dark).toBe(true)
  expect(document.body.classList.contains('dark')).toBe(true)
  expect(useUiStore().notifications).toMatchObject([{ key: 'notifications.appearanceFailed', kind: 'error', params: {} }])
})
test('failed learning-configuration saving is announced once for repeated changes', async () => {
  const settings = useSettingsStore()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  settings.smartConfig.duration = 10
  await nextTick()
  settings.smartConfig.duration = 25
  await nextTick()
  expect(settings.smartConfig.duration).toBe(25)
  expect(useUiStore().notifications.filter(message => message.key === 'notifications.smartConfigFailed')).toHaveLength(1)
})
test('language controls report failed persistence while retaining the selected session language', async () => {
  useSettingsStore()
  const view = mount(PreferencesView, { global: { stubs: { AppBar: true, AppIcon: true } } })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  await view.get('#language-preference').setValue('de')
  expect(languagePreference.value).toBe('de')
  expect(useUiStore().notifications).toMatchObject([{ key: 'notifications.languageFailed', kind: 'error' }])
  view.unmount()
})
test('blocked storage reads and writes do not prevent the settings screen from starting', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Access denied') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Access denied') })
  const settings = useSettingsStore()
  expect(settings.dark).toBe(false)
  expect(useUiStore().notifications).toMatchObject([{ key: 'notifications.appearanceFailed' }])
})
