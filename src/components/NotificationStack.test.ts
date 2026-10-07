import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import NotificationStack from './NotificationStack.vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { browserStorage } from '../services/storage/browserStorage'
import { setLanguage } from '../i18n'

let wrapper: VueWrapper | undefined
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  localStorage.clear(); setLanguage('en')
  pinia = createPinia(); setActivePinia(pinia)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; disposePinia(pinia); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

test('library failure stays visible, hides private exception details and clears only after successful saving', async () => {
  const library = useLibraryStore()
  await library.hydrate()
  const save = vi.spyOn(browserStorage, 'save').mockRejectedValueOnce(new Error('PRIVATE_PATH_AND_KEY'))
  await expect(library.createDeck('Test')).rejects.toThrow()
  wrapper = mount(NotificationStack)
  expect(wrapper.findAll('.notification-persistent')).toHaveLength(1)
  expect(wrapper.text()).toContain('could not be saved')
  expect(wrapper.text()).not.toContain('PRIVATE_PATH_AND_KEY')
  expect(wrapper.find('.notification-persistent button').exists()).toBe(false)
  await library.createDeck('Retry')
  await flushPromises()
  expect(save).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.notification-persistent').exists()).toBe(false)
})

test('critical loading errors retain their specific wording rather than becoming save errors', async () => {
  localStorage.setItem('ankiweb_v1', 'not json')
  await useLibraryStore().hydrate()
  wrapper = mount(NotificationStack)
  expect(wrapper.text()).toContain('saving is disabled')
  expect(wrapper.text()).not.toContain('Check the available storage')
})

test('critical notice gets priority, at most three messages appear and hidden messages do not expire', async () => {
  vi.useFakeTimers()
  const library = useLibraryStore()
  library.persistenceIssue = 'save'
  const ui = useUiStore()
  ui.showError('notifications.exportFailed')
  ui.showError('notifications.importFailed')
  ui.showToast('deck.created')
  wrapper = mount(NotificationStack)
  await flushPromises()
  expect(wrapper.findAll('.notification')).toHaveLength(3)
  expect(wrapper.findAll('.notification')[0]!.classes()).toContain('notification-persistent')
  vi.advanceTimersByTime(2700)
  expect(ui.notifications.find(message => message.kind === 'success')).toBeDefined()
  // A hidden message is returned to view when an active message is dismissed.
  ui.dismissNotification(ui.notifications[0]!.id)
  await flushPromises()
  expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
})

test('action messages announce errors and support dismissal without moving focus when shown', async () => {
  wrapper = mount(NotificationStack, { attachTo: document.body })
  const input = document.createElement('input'); document.body.appendChild(input); input.focus()
  const ui = useUiStore()
  ui.showError('notifications.exportFailed')
  await flushPromises()
  expect(document.activeElement).toBe(input)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  await wrapper.get('button[aria-label="Dismiss notification"]').trigger('click')
  expect(ui.notifications).toHaveLength(0)
  input.remove()
})
