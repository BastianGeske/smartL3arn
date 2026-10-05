import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, expect, test } from 'vitest'
import AppMenu from './AppMenu.vue'

const wrappers: VueWrapper[] = []
function menu() {
  const wrapper = mount(AppMenu, { attachTo: document.body, props: { label: 'Actions' },
    slots: { trigger: 'Open', default: '<button id="first-action">First</button><button>Second</button>' } })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); document.body.innerHTML = '' })
const settle = async () => { await nextTick(); await nextTick() }

test('Escape closes the menu and restores focus to its trigger', async () => {
  const wrapper = menu()
  await wrapper.get('button').trigger('click'); await settle()
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  expect(document.activeElement?.id).toBe('first-action')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await settle()
  expect(document.querySelector('.floating-menu')).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('button').element)
})
test('an outside pointer closes the menu', async () => {
  const wrapper = menu()
  await wrapper.get('button').trigger('click'); await settle()
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await settle()
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
})
test('opening another menu closes the previous one', async () => {
  const first = menu(), second = menu()
  await first.get('button').trigger('click'); await settle()
  await second.get('button').trigger('click'); await settle()
  expect(first.get('button').attributes('aria-expanded')).toBe('false')
  expect(second.get('button').attributes('aria-expanded')).toBe('true')
  expect(document.querySelectorAll('.floating-menu')).toHaveLength(1)
})
test('arrow keys move through actions and selecting one closes the menu', async () => {
  const wrapper = menu()
  await wrapper.get('button').trigger('click'); await settle()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement?.textContent).toBe('Second')
  ;(document.activeElement as HTMLButtonElement).click()
  await settle()
  expect(document.querySelector('.floating-menu')).toBeNull()
})
