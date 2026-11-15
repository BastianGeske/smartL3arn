import { afterEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useDialogKeyboard } from './useDialogKeyboard'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.restoreAllMocks() })

it('restores focus after the background becomes interactive again', async () => {
  document.body.innerHTML = '<button id="trigger">Open</button>'
  const trigger = document.getElementById('trigger')!
  trigger.focus()
  const open = ref(false)
  wrapper = mount(defineComponent({ setup() { useDialogKeyboard(computed(() => open.value)); return () => null } }), { attachTo: document.body })
  open.value = true
  let backgroundInert = true
  const originalFocus = trigger.focus.bind(trigger)
  vi.spyOn(trigger, 'focus').mockImplementation(() => { if (!backgroundInert) originalFocus() })
  trigger.blur()
  open.value = false
  expect(document.activeElement).not.toBe(trigger)
  backgroundInert = false
  await nextTick()
  expect(document.activeElement).toBe(trigger)
})

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

it('returns focus to the import heading if the corrected card no longer has a report entry', async () => {
  document.body.innerHTML = '<h2 id="import-quality-title" tabindex="-1">Import</h2><button id="resolved-card">Edit</button>'
  const open = ref(false)
  document.getElementById('resolved-card')!.focus()
  wrapper = mount(defineComponent({ setup() { useDialogKeyboard(computed(() => open.value)); return () => null } }), { attachTo: document.body })
  open.value = true
  document.getElementById('resolved-card')!.remove()
  open.value = false
  await import('vue').then(vue => vue.nextTick())
  expect(document.activeElement?.id).toBe('import-quality-title')
})

it('keeps the native wrapping matching select in the dialog tab order', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  document.body.innerHTML = '<div class="modal-overlay"><div class="modal"><button>First</button><span class="task-match-control"><select style="opacity:0"><option>A</option></select><span class="task-match-value">A</span></span><button>Last</button></div></div>'
  const open = ref(false)
  wrapper = mount(defineComponent({ setup() { useDialogKeyboard(computed(() => open.value)); return () => null } }), { attachTo: document.body })
  open.value = true
  const select = document.querySelector('select')!
  select.focus()
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  select.dispatchEvent(tab)
  expect(tab.defaultPrevented).toBe(false)
})

it('uses the import heading when a pointer-opened editor had no focused trigger', async () => {
  document.body.innerHTML = '<h2 id="import-quality-title" tabindex="-1">Import</h2>'
  const open = ref(false)
  wrapper = mount(defineComponent({ setup() { useDialogKeyboard(computed(() => open.value)); return () => null } }), { attachTo: document.body })
  open.value = true
  open.value = false
  await import('vue').then(vue => vue.nextTick())
  expect(document.activeElement?.id).toBe('import-quality-title')
})
