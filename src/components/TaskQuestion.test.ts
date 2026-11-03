import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskQuestion from './TaskQuestion.vue'
import type { TaskDefinition } from '../domain/types'

it.each<{ task?: TaskDefinition; interactive: boolean }>([false, true].flatMap(interactive => [
  { interactive },
  { interactive, task: { kind: 'short_text' as const } },
  { interactive, task: { kind: 'long_text' as const } },
  { interactive, task: { kind: 'true_false' as const, correct: true } },
]))('preserves literal placeholders outside cloze ($task.kind, interactive=$interactive)', ({ task, interactive }) => {
  const front = 'Was zeigt `{{count}}` in Vue?'
  const wrapper = mount(TaskQuestion, { props: { card: { front, task }, interactive } })
  expect(wrapper.text()).toContain(front)
  wrapper.unmount()
})

it.each([false, true])('replaces cloze placeholders (interactive=%s)', interactive => {
  const wrapper = mount(TaskQuestion, { props: { card: { front: '2 + 2 = {{n}}', task: { kind: 'cloze', gaps: [{ id: 'n', kind: 'number', answer: '4' }] } }, interactive } })
  expect(wrapper.text()).toBe('2 + 2 = ___')
  wrapper.unmount()
})
