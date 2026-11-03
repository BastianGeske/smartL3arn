import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import MathInput from './MathInput.vue'

vi.mock('mathlive', () => {
  class FakeField extends HTMLElement {
    static fontsDirectory: string | null
    static soundsDirectory: string | null
    static keypressSound: unknown
    static plonkSound: unknown
    value = ''; readOnly = false; mathVirtualKeyboardPolicy = 'auto'
    set menuItems(_items: unknown[]) { if (!this.isConnected) throw new Error('Mathfield not mounted') }
  }
  customElements.define('test-math-field', FakeField)
  return { MathfieldElement: FakeField }
})
let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('keeps the same LaTeX through visual/text switches, including incomplete drafts', async () => {
  const keyboard = Object.assign(new EventTarget(), { visible: false, boundingRect: { height: 0 }, show: vi.fn(), hide: vi.fn(), alphabeticLayout: '' })
  vi.stubGlobal('mathVirtualKeyboard', keyboard)
  wrapper = mount(MathInput, { attachTo: document.body, props: { label: 'Formel', modelValue: '\\frac{1}{2}' } })
  await flushPromises()
  const field = wrapper.find('test-math-field').element as HTMLElement & { value: string; readOnly: boolean }
  expect(field.value).toBe('\\frac{1}{2}')
  await wrapper.findAll('.segment-button')[1]!.trigger('click')
  await wrapper.get('textarea').setValue('\\frac{1}{')
  expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['\\frac{1}{'])
  await wrapper.setProps({ modelValue: '\\frac{1}{' })
  await wrapper.findAll('.segment-button')[0]!.trigger('click')
  expect(field.value).toBe('\\frac{1}{')
  await wrapper.findAll('.segment-button')[1]!.trigger('click')
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('\\frac{1}{')
  await wrapper.setProps({ disabled: true })
  expect(field.readOnly).toBe(true)
  expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
})

it('closes the symbol keyboard when too little height remains without losing the formula', async () => {
  const keyboard = Object.assign(new EventTarget(), {
    visible: true, boundingRect: { height: 220, top: 20 }, alphabeticLayout: '', show: vi.fn(),
    hide: vi.fn(() => { keyboard.visible = false; keyboard.dispatchEvent(new Event('geometrychange')) }),
  })
  vi.stubGlobal('mathVirtualKeyboard', keyboard)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  wrapper = mount(MathInput, { attachTo: document.body, props: { label: 'Formel', modelValue: 'A=\\pi r^2' } })
  await flushPromises()
  const field = wrapper.get('test-math-field').element as HTMLElement & { value: string }
  field.tabIndex = 0
  field.scrollIntoView = vi.fn()
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ height: 58, bottom: 100 } as DOMRect)
  field.focus()
  keyboard.dispatchEvent(new Event('geometrychange'))
  await flushPromises()
  expect(keyboard.hide).toHaveBeenCalledOnce()
  expect(wrapper.find('[role="status"]').exists()).toBe(true)
  expect(field.value).toBe('A=\\pi r^2')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(document.documentElement.style.getPropertyValue('--math-keyboard-height')).toBe('0px')
})

it.each(['visual', 'latex'])('ignores composing and disabled shortcuts in %s mode', async mode => {
  vi.stubGlobal('mathVirtualKeyboard', Object.assign(new EventTarget(), { visible: false, hide: vi.fn() }))
  wrapper = mount(MathInput, { props: { label: 'Formula', modelValue: 'x' } })
  await flushPromises()
  if (mode === 'latex') await wrapper.findAll('.segment-button')[1]!.trigger('click')
  const input = wrapper.get(mode === 'latex' ? 'textarea' : 'test-math-field')
  for (const modifier of ['ctrlKey', 'metaKey']) {
    await input.trigger('keydown', { key: 'Enter', [modifier]: true, isComposing: true })
  }
  expect(wrapper.emitted('submit')).toBeUndefined()
  await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
  await input.trigger('keydown', { key: 'Enter', metaKey: true })
  expect(wrapper.emitted('submit')).toHaveLength(2)
  await wrapper.setProps({ disabled: true })
  await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
  expect(wrapper.emitted('submit')).toHaveLength(2)
})
it('accounts for math delimiters in the editor limit and preserves oversized drafts', async () => {
  wrapper = mount(MathInput, { props: { label: 'Formula', modelValue: 'x'.repeat(3997) } })
  await flushPromises()
  await wrapper.findAll('.segment-button')[1]!.trigger('click')
  expect(wrapper.get('textarea').attributes('maxlength')).toBe('3996')
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toHaveLength(3997)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
})
