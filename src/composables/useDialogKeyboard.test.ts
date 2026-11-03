import { afterEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useDialogKeyboard } from './useDialogKeyboard'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.restoreAllMocks() })

it('includes math fields and summaries but skips collapsed preview controls when trapping modal focus', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  document.body.innerHTML = `<button id="trigger">Open</button><div class="modal-overlay"><div class="modal">
    <button id="first">Close</button><math-field tabindex="0"></math-field>
    <details><summary>Preview</summary><input id="hidden" /></details>
    <button id="save">Save</button></div></div>`
  const trigger = document.querySelector<HTMLElement>('#trigger')!
  trigger.focus()
  const open = ref(false)
  wrapper = mount(defineComponent({ setup() { useDialogKeyboard(computed(() => open.value)); return () => null } }), { attachTo: document.body })
  open.value = true
  const first = document.querySelector<HTMLElement>('#first')!, save = document.querySelector<HTMLElement>('#save')!
  first.focus()
  const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  first.dispatchEvent(back)
  expect(back.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(save)
  save.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(first)
  const math = document.querySelector<HTMLElement>('math-field')!
  math.focus()
  const next = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  math.dispatchEvent(next)
  expect(next.defaultPrevented).toBe(false)
  expect(document.activeElement).toBe(math)
  open.value = false
  expect(document.activeElement).toBe(trigger)
  wrapper.unmount()
})
