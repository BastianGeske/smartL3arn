import { describe, expect, it } from 'vitest'
import { createCard, deckToCsv, deckToAnkiText, parseCards } from './importExport'
import { evaluateResponse, fieldValue, initialResponse, responseError, responseText, taskQuestion, calculationAiError, workingText, taskReferenceAnswer } from './tasks'
import { fractionValue, normalizeTask, numericEqual, parseNumeric } from '../../shared/tasks.mjs'
import { normalizeAppData } from '../../shared/data-validation.mjs'
import { importJsonFile } from '../services/importer'
import type { StudyResponse, TaskDefinition } from './types'

const options = [{ id: 'a', text: 'Berlin' }, { id: 'b', text: 'Paris' }, { id: 'c', text: 'Rom' }]
const examples: { front: string; task: TaskDefinition; response: StudyResponse }[] = [
  { front: 'Hauptstadt?', task: { kind: 'short_text' }, response: { kind: 'text', value: 'Berlin' } },
  { front: 'Erkläre.', task: { kind: 'long_text' }, response: { kind: 'text', value: 'Berlin' } },
  { front: '2 + 2?', task: { kind: 'calculation', answer: { kind: 'number', value: '4' } }, response: { kind: 'text', value: '4,000' } },
  { front: '1 ÷ 2?', task: { kind: 'calculation', answer: { kind: 'fraction', numerator: '1', denominator: '2' } }, response: { kind: 'text', value: '0,5' } },
  { front: 'Länge?', task: { kind: 'calculation', answer: { kind: 'quantity', pairs: [{ value: '5', unit: 'm' }, { value: '500', unit: 'cm' }] } }, response: { kind: 'quantity', value: '500', unit: 'cm' } },
  { front: 'Formel?', task: { kind: 'calculation', answer: { kind: 'formula', value: 'x^2' } }, response: { kind: 'text', value: 'x\\cdot x' } },
  { front: 'Hauptstadt?', task: { kind: 'single_choice', options, correctIds: ['a'] }, response: { kind: 'selection', ids: ['a'] } },
  { front: 'Wähle.', task: { kind: 'multiple_choice', options, correctIds: ['a', 'c'] }, response: { kind: 'selection', ids: ['c', 'a'] } },
  { front: 'Richtig?', task: { kind: 'true_false', correct: false }, response: { kind: 'boolean', value: false } },
  { front: '{{city}}: 2 + 2 = {{n}}', task: { kind: 'cloze', gaps: [{ id: 'city', kind: 'text', answer: 'Berlin', alternatives: ['BERLIN'] }, { id: 'n', kind: 'number', answer: '4' }] }, response: { kind: 'fields', values: { city: 'berlin', n: '4.0' } } },
  { front: 'Ordne zu.', task: { kind: 'matching', pairs: [{ id: 'de', left: 'Deutschland', right: 'Berlin' }, { id: 'fr', left: 'Frankreich', right: 'Paris' }] }, response: { kind: 'fields', values: { fr: 'fr', de: 'de' } } },
  { front: 'Sortiere.', task: { kind: 'ordering', items: [{ id: 'large', text: '3' }, { id: 'small', text: '1' }], correctOrder: ['small', 'large'] }, response: { kind: 'order', ids: ['small', 'large'] } },
]
describe('typed tasks', () => {
  it.each(examples)('preserves $task.kind, its solution and learning data through JSON', async ({ front, task, response }) => {
    const original = { ...createCard(front, 'Berlin', task), stability: 12, difficulty: 3, interval: 12, lastReview: '2026-10-01' }
    const data = normalizeAppData({ decks: [{ id: 'deck', name: 'Tasks', cards: [original], cardStats: { [original.id]: { reviews: 8, again: 1, hard: 0 } } }] }, '2026-10-13')
    const [restored] = await importJsonFile(new File([JSON.stringify(data)], 'tasks.json'))
    expect(restored!.cards[0]).toEqual(original)
    expect(restored!.cardStats?.[original.id]?.reviews).toBe(8)
    expect(evaluateResponse(restored!.cards[0]!, response)?.verdict ?? 'self').toBe(task.kind === 'calculation' && task.answer.kind === 'formula' ? 'self' : 'correct')
  })
  it('keeps legacy cards untyped and does not turn numeric answers into text similarity', () => {
    const legacy = createCard('Zahl?', '-42')
    expect(normalizeAppData({ decks: [{ name: 'Old', cards: [legacy] }] }, '2026-10-13').decks[0]!.cards[0]!.task).toBeUndefined()
    expect(evaluateResponse(legacy, { kind: 'text', value: '42' })!.verdict).toBe('incorrect')
  })
  it('grades selection IDs rather than their shuffled positions', () => {
    const card = createCard('Wähle.', 'Berlin', { kind: 'multiple_choice', options: [...options].reverse(), correctIds: ['a', 'c'] })
    expect(evaluateResponse(card, { kind: 'selection', ids: ['c', 'a'] })!.verdict).toBe('correct')
    expect(evaluateResponse(card, { kind: 'selection', ids: ['a', 'b', 'c'] })!.verdict).not.toBe('correct')
    expect(evaluateResponse(card, { kind: 'selection', ids: ['a'] })!.parts!.some(p => !p.correct)).toBe(true)
  })
  it('shows missing or wrong blanks and mappings as individual parts', () => {
    const example = examples.find(e => e.task.kind === 'cloze')!
    const evaluation = evaluateResponse(createCard(example.front, 'Reference', example.task), { kind: 'fields', values: { city: 'Berlin' } })!
    expect(evaluation.verdict).toBe('partially_correct')
    expect(evaluation.parts).toMatchObject([{ correct: true }, { label: 'n', actual: '', correct: false }])
  })
  it.each(['toString', 'valueOf'])('reads only own string answers for gap %s', id => {
    const card = createCard(`{{${id}}}`, '', { kind: 'cloze', gaps: [{ id, kind: 'text', answer: 'Berlin' }] })
    for (const values of [{}, Object.create({ [id]: 'Berlin' })]) {
      const response: StudyResponse = { kind: 'fields', values }
      expect(evaluateResponse(card, response)).toMatchObject({ verdict: 'incorrect', parts: [{ actual: '', correct: false }] })
      expect(responseText(response, card.task)).toBe(`${id}: —`)
    }
    const response: StudyResponse = { kind: 'fields', values: { [id]: 'Berlin' } }
    expect(evaluateResponse(card, response)?.verdict).toBe('correct')
    expect(responseText(response, card.task)).toBe(`${id}: Berlin`)
    expect(fieldValue({ [id]: () => 'Berlin' }, id)).toBe('')
  })
  it('ignores inherited numeric gap and matching answers', () => {
    const numeric = createCard('{{valueOf}}', '', { kind: 'cloze', gaps: [{ id: 'valueOf', kind: 'number', answer: '4' }] })
    expect(evaluateResponse(numeric, { kind: 'fields', values: Object.create({ valueOf: '4' }) })?.verdict).toBe('incorrect')
    expect(evaluateResponse(numeric, { kind: 'fields', values: { valueOf: '4,0' } })?.verdict).toBe('correct')
    const card = createCard('Ordne zu.', '', { kind: 'matching', pairs: [{ id: 'toString', left: 'X', right: 'A' }, { id: 'valueOf', left: 'Y', right: 'B' }] })
    const values = { toString: 'toString', valueOf: 'valueOf' }
    const inherited: StudyResponse = { kind: 'fields', values: Object.create(values) }
    expect(evaluateResponse(card, inherited)?.verdict).toBe('incorrect')
    expect(responseText(inherited, card.task)).toBe('X → —\nY → —')
    expect(evaluateResponse(card, { kind: 'fields', values })?.verdict).toBe('correct')
    expect(responseText({ kind: 'fields', values }, card.task)).toBe('X → A\nY → B')
  })
  it('does not accept incorrect units or infer undeclared conversions', () => {
    const example = examples.find(e => e.task.kind === 'calculation' && e.task.answer.kind === 'quantity')!
    const card = createCard(example.front, 'Reference', example.task)
    expect(evaluateResponse(card, { kind: 'quantity', value: '500', unit: 'm' })!.verdict).toBe('incorrect')
    expect(evaluateResponse(card, { kind: 'quantity', value: '5000', unit: 'mm' })!.verdict).toBe('incorrect')
  })
  it('keeps fractions and large decimals exact, with explicit absolute tolerance', () => {
    expect(numericEqual('9007199254740993', '9007199254740992')).toBe(false)
    expect(numericEqual('1/3', '2/6')).toBe(true)
    expect(numericEqual('−1/2', '-0,5')).toBe(true)
    expect(numericEqual('1/3', '0.333')).toBe(false)
    expect(numericEqual('0.333', '1/3', '0.001')).toBe(true)
    expect(numericEqual('3.15', '3.14', '0.01')).toBe(true)
    expect(numericEqual('3.15001', '3.14', '0.01')).toBe(false)
    expect(numericEqual('1e-3', '0,001')).toBe(true)
  })
  it('rejects invalid arithmetic inputs and bounds exponents without evaluating code', () => {
    expect(fractionValue('1', '0')).toBeNull()
    expect(parseNumeric('1e9999')).toBeNull()
    expect(parseNumeric('1 + 1')).toBeNull()
    expect(parseNumeric('alert(1)')).toBeNull()
    const task: TaskDefinition = { kind: 'calculation', answer: { kind: 'fraction', numerator: '1', denominator: '2' } }
    expect(responseError(task, { kind: 'fraction', numerator: '1', denominator: '0' })).toBe('task.invalidMath')
    expect(responseError(task, { kind: 'text', value: '0,5' })).toBeNull()
  })
  it.each([
    { kind: 'unknown' },
    { kind: 'single_choice', options, correctIds: ['missing'] },
    { kind: 'multiple_choice', options, correctIds: ['a', 'a'] },
    { kind: 'ordering', items: options, correctOrder: ['a', 'b'] },
    { kind: 'calculation', answer: { kind: 'fraction', numerator: '1', denominator: '0' } },
    { kind: 'calculation', answer: { kind: 'number', value: '2', tolerance: '-1' } },
    { kind: 'cloze', gaps: [{ id: '__proto__', kind: 'text', answer: 'x' }] },
  ])('rejects malformed imported configurations: $kind', task => expect(() => normalizeTask(task, '{{gap1}}')).toThrow())
  it('requires every gap placeholder to have a configured answer', () => {
    expect(() => normalizeTask({ kind: 'cloze', gaps: [{ id: 'gap1', kind: 'text', answer: 'x' }] }, '{{gap2}}')).toThrow()
  })
  it.each(['A', ' A ', 'Ａ'])('rejects duplicate normalized labels %s in ordering and matching', duplicate => {
    const ordering = { kind: 'ordering', items: [{ id: 'a', text: 'A' }, { id: 'b', text: duplicate }], correctOrder: ['a', 'b'] }
    const matching = { kind: 'matching', pairs: [{ id: 'a', left: 'A', right: 'X' }, { id: 'b', left: duplicate, right: 'Y' }] }
    for (const task of [ordering, matching]) {
      expect(() => normalizeTask(task, 'Frage')).toThrow('Invalid task: invalid')
      expect(() => normalizeAppData({ decks: [{ name: 'Import', cards: [{ front: 'Frage', back: 'Antwort', task }] }] }, '2026-10-14')).toThrow()
    }
  })
  it.each([undefined, { kind: 'short_text' as const }, { kind: 'long_text' as const }, { kind: 'true_false' as const, correct: true }])('preserves literal placeholders outside cloze in questions and exports', task => {
    const front = 'Was zeigt `{{count}}` in Vue?'
    const card = createCard(front, 'Zähler', task)
    const deck = { id: 'deck', name: 'Text', cards: [card] }
    expect(taskQuestion(card)).toContain(front)
    expect(parseCards(deckToCsv(deck))[0]!.front).toContain(front)
    expect(deckToAnkiText(deck)).toContain(front)
  })
  it('replaces genuine cloze placeholders in exported questions', () => {
    const card = createCard('2 + 2 = {{n}}', '', { kind: 'cloze', gaps: [{ id: 'n', kind: 'number', answer: '4' }] })
    const deck = { id: 'deck', name: 'Lücken', cards: [card] }
    expect(taskQuestion(card)).toBe('2 + 2 = ___')
    expect(parseCards(deckToCsv(deck))[0]!.front).toBe('2 + 2 = ___')
    expect(deckToAnkiText(deck)).toContain('2 + 2 = ___')
  })
  it('exports question options and readable solutions as text, preserving JSON as the full format', () => {
    const card = createCard('Hauptstadt?', 'Unused', { kind: 'single_choice', options, correctIds: ['a'] })
    const parsed = parseCards(deckToCsv({ id: 'deck', name: 'Test', cards: [card] }))
    expect(parsed[0]!.front).toContain('Paris')
    expect(parsed[0]!.back).toBe('Berlin')
    expect(card.task!.kind).toBe('single_choice')
  })
  it('initializes one permutation containing every ordering ID once', () => {
    const task = examples.find(e => e.task.kind === 'ordering')!.task
    const response = initialResponse(task)
    expect(response.kind).toBe('order')
    if (response.kind === 'order') expect([...response.ids].sort()).toEqual(['large', 'small'])
    expect(responseText(examples[8]!.response, examples[8]!.task)).toBeTruthy()
  })
})

 it.each([
  ['?', '!', 'incorrect'], ['?', '?', 'correct'], ['/', '_', 'incorrect'],
  ['?', '  ?  ', 'correct'], ['Berlin', 'BERLIN!', 'correct'],
 ])('compares text blank %s with %s as %s', (answer, actual, verdict) => {
  const card = createCard('{{gap}}', '', { kind: 'cloze', gaps: [{ id: 'gap', kind: 'text', answer }] })
  expect(evaluateResponse(card, { kind: 'fields', values: { gap: actual } })?.verdict).toBe(verdict)
 })
 it('counts serialized formula and combined working lengths at the AI boundary', () => {
  const task: TaskDefinition = { kind: 'calculation', answer: { kind: 'formula', value: 'x'.repeat(3996) } }
  expect(taskReferenceAnswer({ front: '', back: '', task })).toHaveLength(4000)
  expect(calculationAiError(task)).toBeNull()
  task.answer = { kind: 'formula', value: 'x'.repeat(3997) }
  expect(calculationAiError(task)).toBe('task.aiReferenceTooLong')
  task.answer = { kind: 'number', value: '4' }
  task.solutionSteps = [{ kind: 'math', value: 'x'.repeat(3994) }, { kind: 'text', value: 'y' }]
  expect(workingText(task.solutionSteps)).toHaveLength(4000)
  expect(calculationAiError(task)).toBeNull()
  task.solutionSteps[1]!.value = 'yy'
  expect(calculationAiError(task)).toBe('task.aiReferenceWorkingTooLong')
 })
