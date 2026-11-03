import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskResponse from './TaskResponse.vue'
import MathContent from './MathContent.vue'
import type { StudyResponse, TaskDefinition } from '../domain/types'

describe('task response controls', () => {
  it('emits selected stable IDs and keeps display order across a disabled retry', async () => {
    const task: TaskDefinition = { kind: 'single_choice', options: [{ id: 'correct', text: 'Richtig' }, { id: 'other', text: 'Falsch' }], correctIds: ['correct'] }
    const wrapper = mount(TaskResponse, { props: { task, front: 'Frage', modelValue: { kind: 'selection', ids: [] } } })
    const labels = wrapper.findAll('.task-choice').map(o => o.text())
    const i = labels.indexOf('Richtig')
    await wrapper.findAll('input')[i]!.setValue(true)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'selection', ids: ['correct'] }])
    await wrapper.setProps({ disabled: true, modelValue: { kind: 'selection', ids: ['correct'] } })
    expect(wrapper.findAll('.task-choice').map(o => o.text())).toEqual(labels)
    expect(wrapper.findAll('input')[i]!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('supports decimal comma and separate units without using number inputs', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'calculation', answer: { kind: 'quantity', pairs: [{ value: '2.5', unit: 'm' }] } }, front: 'Länge', modelValue: { kind: 'quantity', value: '', unit: '' } } })
    await wrapper.findAll('input')[0]!.setValue('2,5')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'quantity', value: '2,5', unit: '' }])
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('renders one independently labeled input per gap', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'cloze', gaps: [{ id: 'a', kind: 'text', answer: 'Berlin' }, { id: 'b', kind: 'number', answer: '4' }] }, front: '{{a}} und {{b}}', modelValue: { kind: 'fields', values: {} } } })
    expect(wrapper.findAll('input').map(i => i.attributes('aria-label'))).toEqual(['a', 'b'])
    await wrapper.get('input[aria-label="b"]').setValue('4,0')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'fields', values: { b: '4,0' } }])
    wrapper.unmount()
  })
  it('toggles numeric gap signs while preserving other gaps and respecting disabled state', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'cloze', gaps: [{ id: 'a', kind: 'text', answer: 'Berlin' }, { id: 'b', kind: 'number', answer: '-2.5' }] }, front: '{{a}} und {{b}}', modelValue: { kind: 'fields', values: { a: 'Berlin', b: '2,5' } } } })
    await wrapper.get('.task-number-input button').trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'fields', values: { a: 'Berlin', b: '-2,5' } }])
    await wrapper.setProps({ modelValue: { kind: 'fields', values: { a: 'Berlin', b: '-2,5' } } })
    await wrapper.get('.task-number-input button').trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'fields', values: { a: 'Berlin', b: '2,5' } }])
    await wrapper.setProps({ disabled: true })
    expect(wrapper.get('input[aria-label="b"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.task-number-input button').attributes('disabled')).toBeDefined()
    const count = wrapper.emitted('update:modelValue')!.length
    await wrapper.get('.task-number-input button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(count)
    wrapper.unmount()
  })
  it.each(['toString', 'valueOf'])('keeps gap %s empty until an own answer is entered', async id => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'cloze', gaps: [{ id, kind: 'text', answer: 'Berlin' }] }, front: `{{${id}}}`, modelValue: { kind: 'fields', values: {} } } })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    await wrapper.setProps({ modelValue: { kind: 'fields', values: Object.create({ [id]: 'Berlin' }) } })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    await wrapper.get('input').setValue('Berlin')
    const response = wrapper.emitted('update:modelValue')!.at(-1)![0]
    expect(response).toEqual({ kind: 'fields', values: { [id]: 'Berlin' } })
    await wrapper.setProps({ modelValue: response as StudyResponse })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Berlin')
    wrapper.unmount()
  })
  it('ignores inherited matching selections and displays own selections', async () => {
    const task: TaskDefinition = { kind: 'matching', pairs: [{ id: 'toString', left: 'X', right: 'A' }, { id: 'valueOf', left: 'Y', right: 'B' }] }
    const values = { toString: 'toString', valueOf: 'valueOf' }
    const wrapper = mount(TaskResponse, { props: { task, front: 'Ordne zu.', modelValue: { kind: 'fields', values: Object.create(values) } } })
    expect(wrapper.findAll('select').map(select => (select.element as HTMLSelectElement).value)).toEqual(['', ''])
    await wrapper.setProps({ modelValue: { kind: 'fields', values } })
    expect(wrapper.findAll('select').map(select => (select.element as HTMLSelectElement).value)).toEqual(['toString', 'valueOf'])
    wrapper.unmount()
  })
  it('moves ordering items using keyboard-accessible buttons', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'ordering', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOrder: ['a', 'b'] }, front: 'Sortiere', modelValue: { kind: 'order', ids: ['b', 'a'] } } })
    await wrapper.findAll('li')[0]!.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'order', ids: ['a', 'b'] }])
    wrapper.unmount()
  })
  it('reserves plain Enter for single-line inputs and allows multiline explanations', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'long_text' }, front: 'Erkläre', modelValue: { kind: 'text', value: '' } } })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })
  it('allows changing a numerical sign on touch keyboards that omit a minus key', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'calculation', answer: { kind: 'number', value: '-2.5' } }, front: 'Zahl?', modelValue: { kind: 'text', value: '2,5' } } })
    await wrapper.get('.task-number-input button').trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'text', value: '-2,5' }])
    wrapper.unmount()
  })
  it('preserves both fraction and decimal drafts when changing the input format', async () => {
    const wrapper = mount(TaskResponse, { props: { task: { kind: 'calculation', answer: { kind: 'fraction', numerator: '1', denominator: '2' } }, front: 'Bruch?', modelValue: { kind: 'fraction', numerator: '1', denominator: '2' } } })
    await wrapper.get('.task-row-actions').findAll('button')[1]!.trigger('click')
    await wrapper.setProps({ modelValue: { kind: 'text', value: '0,5' } })
    await wrapper.get('.task-row-actions').findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'fraction', numerator: '1', denominator: '2' }])
    await wrapper.setProps({ modelValue: { kind: 'fraction', numerator: '1', denominator: '2' } })
    await wrapper.get('.task-row-actions').findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ kind: 'text', value: '0,5' }])
    wrapper.unmount()
  })
})
describe('math content', () => {
  it('renders marked formulas while leaving currency and plain HTML as text', () => {
    const wrapper = mount(MathContent, { props: { text: '<script>alert(1)</script> $25 \\(\\frac{1}{2}\\)' } })
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('.katex').exists()).toBe(true)
    expect(wrapper.text()).toContain('$25')
    wrapper.unmount()
  })
  it('keeps unsupported and untrusted LaTeX readable without active links', () => {
    const error = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapper = mount(MathContent, { props: { text: '\\href{javascript:alert(1)}{click}', formula: true } })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toBeTruthy()
    wrapper.unmount(); error.mockRestore()
  })
})
