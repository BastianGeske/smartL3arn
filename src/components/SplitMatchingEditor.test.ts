import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SplitMatchingEditor from './SplitMatchingEditor.vue'
import { createCard } from '../domain/importExport'
const source = () => createCard('Ordne Funktionen zu.', '', { kind: 'matching', pairs: [{ id: 'verify', left: 'Überprüfen', right: 'Übersetzt ohne Übertragung' }, { id: 'upload', left: 'Hochladen', right: 'Übersetzt und überträgt' }], explanation: 'Gemeinsamer Kontext' })
it('requires contextualized drafts, preserves individually edited questions and keeps the original by default', async () => {
  const wrapper = mount(SplitMatchingEditor, { props: { source: source(), busy: false, error: false } })
  expect(wrapper.get('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
  await wrapper.get('#split-context').setValue('IDE')
  await wrapper.get('#split-front-0').setValue('Welche Funktion hat Überprüfen in der IDE?')
  await wrapper.get('#split-context').setValue('Arduino IDE')
  expect((wrapper.get('#split-front-0').element as HTMLTextAreaElement).value).toBe('Welche Funktion hat Überprüfen in der IDE?')
  expect((wrapper.get('#split-front-1').element as HTMLTextAreaElement).value).toContain('Arduino IDE')
  await wrapper.findAll('.split-draft input')[1]!.setValue(false)
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  const [drafts, replace] = wrapper.emitted('create')![0]!
  expect(replace).toBe(false)
  expect((drafts as { selected: boolean }[]).filter(draft => draft.selected)).toHaveLength(1)
  expect((drafts as { back: string }[])[0]!.back).toBe('Übersetzt ohne Übertragung')
  expect(wrapper.get('.task-details').text()).toContain('Gemeinsamer Kontext')
  wrapper.unmount()
})
it('retains failed drafts for retry and disables controls during saving', async () => {
  const wrapper = mount(SplitMatchingEditor, { props: { source: source(), busy: false, error: false } })
  await wrapper.get('#split-context').setValue('IDE')
  await wrapper.setProps({ error: true })
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect((wrapper.get('#split-front-0').element as HTMLTextAreaElement).value).toContain('IDE')
  await wrapper.setProps({ busy: true })
  expect(wrapper.get('.split-drafts').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
