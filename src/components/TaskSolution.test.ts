import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskSolution from './TaskSolution.vue'

it('keeps matching terms paired with their answers and shows the explanation once', () => {
  const wrapper = mount(TaskSolution, { props: { card: { back: 'Plain export fallback', task: {
    kind: 'matching', pairs: [{ id: 'a', left: 'Sensor', right: 'Feldebene' }, { id: 'b', left: 'ERP', right: 'Unternehmensebene' }], explanation: 'Von der Messung zur Planung.',
  } } } })
  expect(wrapper.findAll('dt').map(node => node.text())).toEqual(['Sensor', 'ERP'])
  expect(wrapper.findAll('dd').map(node => node.text())).toEqual(['Feldebene', 'Unternehmensebene'])
  expect(wrapper.text().match(/Von der Messung zur Planung\./g)).toHaveLength(1)
  expect(wrapper.text()).not.toContain('Plain export fallback')
})

it('renders the configured solution order rather than the stored item order', () => {
  const wrapper = mount(TaskSolution, { props: { card: { back: '', task: {
    kind: 'ordering', items: [{ id: 'a', text: 'Hochladen' }, { id: 'b', text: 'Übersetzen' }], correctOrder: ['b', 'a'],
  } } } })
  expect(wrapper.findAll('ol li').map(node => node.text())).toEqual(['Übersetzen', 'Hochladen'])
})
