import { afterEach, beforeEach, expect, it } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import CardEditorModal from './CardEditorModal.vue'
import TaskConfigEditor from './TaskConfigEditor.vue'
import TaskResponse from './TaskResponse.vue'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'

let pinia: ReturnType<typeof createPinia>, wrapper: VueWrapper
beforeEach(async () => {
  localStorage.clear(); delete window.smartL3arn
  pinia = createPinia(); setActivePinia(pinia)
  const deck = await useLibraryStore().createDeck('Tasks')
  wrapper = mount(CardEditorModal)
  useUiStore().editCard(deck.id)
  await flushPromises()
})
afterEach(() => { wrapper.unmount(); disposePinia(pinia); document.body.classList.remove('modal-open') })
it('synchronizes ordering preview IDs without resetting the learner order', async () => {
  await wrapper.get('#task-type').setValue('ordering')
  const preview = () => wrapper.findComponent(TaskResponse)
  const ids = () => {
    const response = preview().props('modelValue')
    if (response.kind !== 'order') throw new Error('Expected ordering response')
    return [...response.ids]
  }
  const taskIds = () => {
    const task = wrapper.findComponent(TaskConfigEditor).props('modelValue')
    if (task.kind !== 'ordering') throw new Error('Expected ordering task')
    return task.items.map(item => item.id)
  }
  await preview().findAll('li')[0]!.findAll('button')[1]!.trigger('click')
  const original = ids()
  await wrapper.findAll('.task-config .task-edit-row input')[0]!.setValue('A')
  await wrapper.findAll('.task-config .task-edit-row input')[1]!.setValue('B')
  expect(ids()).toEqual(original)
  await wrapper.get('.task-config > button').trigger('click')
  const added = taskIds().find(id => !original.includes(id))!
  expect(ids()).toEqual([...original, added])
  await wrapper.findAll('.task-config .task-edit-row input')[2]!.setValue('C')
  expect(preview().findAll('li')).toHaveLength(3)
  expect(preview().text()).toContain('C')
  // Changing the solution order must not reorder the learner's preview answer.
  await wrapper.findAll('.task-config .task-edit-row')[0]!.findAll('button')[1]!.trigger('click')
  expect(ids()).toEqual([...original, added])
  const removed = taskIds()[0]!
  await wrapper.findAll('.task-config .task-edit-row')[0]!.get('.btn-quiet').trigger('click')
  expect(ids()).toEqual([...original, added].filter(id => id !== removed))
  expect([...ids()].sort()).toEqual([...taskIds()].sort())
  expect(preview().findAll('li')).toHaveLength(2)
  expect(preview().findAll('li').every(row => row.text().trim())).toBe(true)
})
it('creates a structured numeric card and regenerates the readable solution on editing', async () => {
  await wrapper.get('#task-type').setValue('calculation')
  await wrapper.get('#modal-front').setValue('Berechne 2 + 2.')
  await wrapper.get('.task-config input').setValue('4')
  await wrapper.get('.modal-footer .btn-primary').trigger('click')
  await flushPromises()
  const library = useLibraryStore(), deck = library.decks[0]!, card = deck.cards[0]!
  expect(card.task).toMatchObject({ kind: 'calculation', answer: { kind: 'number', value: '4' } })
  expect(card.back).toBe('4')
  card.stability = 10
  useUiStore().editCard(deck.id, card.id); await flushPromises()
  await wrapper.get('.task-config input').setValue('5')
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(card.back).toBe('5')
  expect(card.stability).toBe(10)
  expect(JSON.parse(localStorage.getItem('ankiweb_v1')!).decks[0].cards[0].task.answer.value).toBe('5')
})
it('rejects a choice card without a marked correct option and preserves the draft', async () => {
  await wrapper.get('#task-type').setValue('single_choice')
  await wrapper.get('#modal-front').setValue('Hauptstadt?')
  await wrapper.findAll('.task-config input.input')[0]!.setValue('Berlin')
  await wrapper.findAll('.task-config input.input')[1]!.setValue('Paris')
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(useLibraryStore().decks[0]!.cards).toHaveLength(0)
  await wrapper.findAll('.task-config input[type="radio"]')[0]!.setValue(true)
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  const card = useLibraryStore().decks[0]!.cards[0]!
  expect(card.back).toBe('Berlin')
  expect(card.task?.kind).toBe('single_choice')
})
it('preserves spaces and newlines while writing explanations and alternative gap answers', async () => {
  await wrapper.get('#task-type').setValue('true_false')
  await wrapper.get('#task-explanation').setValue('Eine Erklärung ')
  expect((wrapper.get('#task-explanation').element as HTMLTextAreaElement).value).toBe('Eine Erklärung ')
  await wrapper.get('#task-type').setValue('cloze')
  await wrapper.get('#modal-front').setValue('{{gap1}}')
  await wrapper.get('.task-gap-config > input').setValue('Berlin')
  await wrapper.get('.task-gap-config textarea').setValue('BERLIN\n')
  expect((wrapper.get('.task-gap-config textarea').element as HTMLTextAreaElement).value).toBe('BERLIN\n')
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(useLibraryStore().decks[0]!.cards[0]!.task).toMatchObject({ kind: 'cloze', gaps: [{ alternatives: ['BERLIN'] }] })
})

it('provides a sign control for quantity reference values', async () => {
  await wrapper.get('#task-type').setValue('calculation')
  await wrapper.get('#task-answer-format').setValue('quantity')
  const row = wrapper.get('.task-config .task-edit-row')
  await row.get('.task-number-input input').setValue('5')
  await row.get('.task-number-input button').trigger('click')
  expect((row.get('input').element as HTMLInputElement).value).toBe('-5')
  await row.findAll('input')[1]!.setValue('°C')
  await wrapper.get('#modal-front').setValue('Temperature?')
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(useLibraryStore().decks[0]!.cards[0]!.task).toMatchObject({ answer: { pairs: [{ value: '-5', unit: '°C' }] } })
})
it('identifies oversized serialized reference working before saving', async () => {
  await wrapper.get('#task-type').setValue('calculation')
  await wrapper.get('#modal-front').setValue('Calculate')
  await wrapper.get('.task-config input').setValue('4')
  const config = wrapper.findComponent(TaskConfigEditor)
  config.vm.$emit('update:modelValue', { kind: 'calculation', answer: { kind: 'number', value: '4' }, solutionSteps: [{ kind: 'text', value: 'x'.repeat(4000) }, { kind: 'text', value: 'y' }] })
  await flushPromises()
  await wrapper.get('.modal-footer .btn-primary').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(useLibraryStore().decks[0]!.cards).toHaveLength(0)
})
