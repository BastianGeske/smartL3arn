import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useUiStore } from './ui'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => { vi.useFakeTimers(); pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => { disposePinia(pinia); vi.useRealTimers() })

test('success expires after 2.6 seconds; an action error remains for eight', () => {
  const ui = useUiStore()
  ui.showToast('deck.created')
  ui.showError('notifications.exportFailed')
  vi.advanceTimersByTime(2600)
  expect(ui.notifications.map(message => message.kind)).toEqual(['error'])
  vi.advanceTimersByTime(5399)
  expect(ui.notifications).toHaveLength(1)
  vi.advanceTimersByTime(1)
  expect(ui.notifications).toHaveLength(0)
})

test('identical errors coalesce and receive a fresh duration', () => {
  const ui = useUiStore()
  ui.showError('notifications.exportFailed')
  vi.advanceTimersByTime(7000)
  ui.showError('notifications.exportFailed')
  expect(ui.notifications).toHaveLength(1)
  vi.advanceTimersByTime(7999)
  expect(ui.notifications).toHaveLength(1)
  vi.advanceTimersByTime(1)
  expect(ui.notifications).toHaveLength(0)
})

test('focus and hover pause independently and resume with the remaining duration', () => {
  const ui = useUiStore()
  ui.showError('notifications.exportFailed')
  const id = ui.notifications[0]!.id
  vi.advanceTimersByTime(3000)
  ui.pauseNotification(id, 'hover')
  ui.pauseNotification(id, 'focus')
  vi.advanceTimersByTime(20000)
  ui.resumeNotification(id, 'hover')
  vi.advanceTimersByTime(10000)
  expect(ui.notifications).toHaveLength(1)
  ui.resumeNotification(id, 'focus')
  vi.advanceTimersByTime(4999)
  expect(ui.notifications).toHaveLength(1)
  vi.advanceTimersByTime(1)
  expect(ui.notifications).toHaveLength(0)
})

test('manual dismissal cancels its timer and does not affect other messages', () => {
  const ui = useUiStore()
  ui.showError('notifications.exportFailed')
  ui.showError('notifications.importFailed')
  ui.dismissNotification(ui.notifications[0]!.id)
  expect(ui.notifications.map(message => message.key)).toEqual(['notifications.importFailed'])
  vi.advanceTimersByTime(8000)
  expect(ui.notifications).toHaveLength(0)
})

test('the bounded queue replaces successes before errors', () => {
  const ui = useUiStore()
  ui.showError('notifications.exportFailed')
  ui.showToast('deck.created')
  ui.showError('notifications.importFailed')
  ui.showError('usage.logsError')
  expect(ui.notifications).toHaveLength(3)
  expect(ui.notifications.every(message => message.kind === 'error')).toBe(true)
  expect(ui.notifications.map(message => message.key)).toContain('notifications.exportFailed')
})
