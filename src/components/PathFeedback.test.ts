import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import PathFeedback from './PathFeedback.vue'
import { localPathResult } from '../domain/pathFeedback'
import type { Activity } from '../../shared/learning-paths.mjs'

it.each(['single_choice', 'multiple_choice'] as const)('does not reveal missing correct options or authored answers during %s practice', kind => {
  const activity: Activity = { id: 'a', question: 'Choose a value.', hint: 'Consider the rule.',
    solution: 'SECRET_SOLUTION', feedback: 'The answer is SECRET_CORRECT.',
    task: { kind, options: [{ id: 'a', text: 'SECRET_CORRECT' }, { id: 'b', text: 'MY_WRONG_CHOICE' }], correctIds: ['a'] } }
  const result = localPathResult(activity, { kind: 'selection', ids: ['b'] })
  const view = mount(PathFeedback, { props: { activity, result, showSolution: false } })
  expect(view.text()).toContain('MY_WRONG_CHOICE')
  expect(view.text()).not.toContain('SECRET_CORRECT')
  expect(view.text()).not.toContain('SECRET_SOLUTION')
  expect(view.find('.path-feedback-solution').exists()).toBe(false)
  view.unmount()
})
it('keeps a numeric answer out of automatic feedback even when authored feedback contains it', async () => {
  const activity: Activity = { id: 'n', question: 'Calculate.', hint: 'Check the base.', solution: 'SECRET_42',
    feedback: 'The answer is SECRET_42', task: { kind: 'calculation', answer: { kind: 'number', value: '42' } } }
  const view = mount(PathFeedback, { props: { activity, result: localPathResult(activity, { kind: 'text', value: '41' }), showSolution: false } })
  expect(view.text()).not.toContain('SECRET_42')
  await view.setProps({ result: localPathResult(activity, { kind: 'text', value: '41' }, true, true), showSolution: true })
  expect(view.text()).toContain('SECRET_42')
  expect(view.get('details').attributes('open')).toBeDefined()
  view.unmount()
})
