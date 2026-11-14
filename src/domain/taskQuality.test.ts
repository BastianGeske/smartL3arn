import { expect, it } from 'vitest'
import { normalizeDeck } from '../../shared/data-validation.mjs'
import { taskQuality } from './taskQuality'
import type { TaskDefinition } from './types'

it.each([5, 6])('accepts an old matching deck of %i pairs and only advises above the editorial limit', count => {
  const input = { name: 'Old deck', cards: [{ id: 'old', front: 'Ordne zu', back: 'Existing', interval: 12, task: { kind: 'matching', pairs: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, left: `L${i}`, right: `R${i}` })) } }] }
  const card = normalizeDeck(input, { today: '2026-11-13' }).cards[0]!
  const before = JSON.stringify(card)
  expect(taskQuality(card)).toEqual(count === 6 ? [{ code: 'matchingSize', cardId: 'old', field: 'pairs' }] : [])
  expect(JSON.stringify(card)).toBe(before)
  expect(card.interval).toBe(12)
})
it('reports simultaneous missing explanation and single-correct advice without changing the choice IDs', () => {
  const task: TaskDefinition = { kind: 'multiple_choice', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctIds: ['b'] }
  expect(taskQuality({ id: 'x', task }).map(hint => hint.code)).toEqual(['missingExplanation', 'singleCorrect'])
  expect(task.correctIds).toEqual(['b'])
  task.explanation = 'B is right.'
  task.correctIds.push('a')
  expect(taskQuality({ id: 'x', task }).map(hint => hint.code)).toEqual(['allCorrect'])
})
it('does not advise on legacy text cards and treats whitespace-only explanations as missing', () => {
  expect(taskQuality({ id: 'old' })).toEqual([])
  expect(taskQuality({ id: 'text', task: { kind: 'long_text' } })).toEqual([])
  expect(taskQuality({ id: 'bool', task: { kind: 'true_false', correct: false, explanation: '  ' } })).toEqual([{ code: 'missingExplanation', cardId: 'bool', field: 'explanation' }])
})
it.each([2, 3])('only flags cloze above two gaps (%i)', count => {
  expect(taskQuality({ id: 'x', task: { kind: 'cloze', gaps: Array.from({ length: count }, (_, i) => ({ id: `g${i}`, kind: 'text', answer: 'A' })) } }).map(hint => hint.code)).toEqual(count > 2 ? ['clozeSize'] : [])
})
it.each([6, 7])('only flags ordering above six items (%i)', count => {
  const items = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, text: `Step ${i}` }))
  expect(taskQuality({ id: 'x', task: { kind: 'ordering', items, correctOrder: items.map(item => item.id) } }).map(hint => hint.code)).toEqual(count > 6 ? ['orderingSize'] : [])
})
