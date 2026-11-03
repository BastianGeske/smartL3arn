import { t, type TranslationKey } from '../i18n'
import type { AnswerEvaluation, Card, StudyResponse, TaskDefinition, TaskKind, WorkingStep, ResponsePart } from './types'
import { normalizeTask, taskSolution, numericEqual, parseNumeric, fractionValue } from '../../shared/tasks.mjs'
import { localEvaluation, normalizeAnswer } from './study/answerSimilarity'
import { genId } from './importExport'

export const AI_TEXT_LIMIT = 4000
export const MATH_SOURCE_LIMIT = AI_TEXT_LIMIT - 4
export function calculationAiError(task: TaskDefinition): TranslationKey | null {
  if (task.kind !== 'calculation') return null
  if (taskReferenceAnswer({ front: '', back: '', task }).length > AI_TEXT_LIMIT) return 'task.aiReferenceTooLong'
  if (workingText(task.solutionSteps || []).length > AI_TEXT_LIMIT) return 'task.aiReferenceWorkingTooLong'
  return null
}

export const taskKinds: TaskKind[] = ['short_text', 'long_text', 'calculation', 'single_choice', 'multiple_choice', 'true_false', 'cloze', 'matching', 'ordering']
export const taskLabel = (kind: TaskKind) => t(`task.type.${kind}` as TranslationKey)
export const calculationLabel = (kind: 'number' | 'fraction' | 'quantity' | 'formula') => t(`task.format.${kind}` as TranslationKey)
export function newTask(kind: TaskKind): TaskDefinition {
  const items = () => [{ id: genId(), text: '' }, { id: genId(), text: '' }]
  switch (kind) {
    case 'short_text': case 'long_text': return { kind }
    case 'calculation': return { kind, answer: { kind: 'number', value: '' }, solutionSteps: [] }
    case 'single_choice': case 'multiple_choice': return { kind, options: items(), correctIds: [] }
    case 'true_false': return { kind, correct: true }
    case 'cloze': return { kind, gaps: [{ id: 'gap1', kind: 'text', answer: '' }] }
    case 'matching': return { kind, pairs: [{ id: genId(), left: '', right: '' }, { id: genId(), left: '', right: '' }] }
    case 'ordering': { const list = items(); return { kind, items: list, correctOrder: list.map(i => i.id) } }
  }
}
export function cardContent(front: string, back: string, task?: TaskDefinition) {
  const normalized = task ? normalizeTask(task, front) : undefined
  return { front, back: normalized ? taskSolution(normalized, front) ?? back : back, ...(normalized ? { task: normalized } : {}) }
}
export function taskReferenceAnswer(card: Pick<Card, 'front' | 'back' | 'task'>): string {
  return card.task?.kind === 'calculation'
    ? taskSolution({ kind: 'calculation', answer: card.task.answer }, card.front)!
    : card.back
}
export function fieldValue(values: Record<string, unknown>, id: string): string {
  if (!Object.prototype.hasOwnProperty.call(values, id)) return ''
  const value = values[id]
  return typeof value === 'string' ? value : ''
}
export function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!] }
  return result
}
export function initialResponse(task?: TaskDefinition): StudyResponse {
  if (!task) return { kind: 'text', value: '' }
  switch (task.kind) {
    case 'calculation':
      if (task.answer.kind === 'fraction') return { kind: 'fraction', numerator: '', denominator: '' }
      if (task.answer.kind === 'quantity') return { kind: 'quantity', value: '', unit: '' }
      return { kind: 'text', value: '' }
    case 'single_choice': case 'multiple_choice': return { kind: 'selection', ids: [] }
    case 'true_false': return { kind: 'boolean', value: null }
    case 'cloze': case 'matching': return { kind: 'fields', values: {} }
    case 'ordering': return { kind: 'order', ids: shuffled(task.items.map(i => i.id)) }
    default: return { kind: 'text', value: '' }
  }
}
export function taskQuestion(card: Pick<Card, 'front' | 'task'>): string {
  const task = card.task
  if (!task) return card.front
  const suffix = task.kind === 'single_choice' || task.kind === 'multiple_choice' ? task.options.map((o, i) => `${i + 1}. ${o.text}`).join('\n')
    : task.kind === 'matching' ? task.pairs.map(p => p.left).join('\n') + '\n↔\n' + [...task.pairs].sort((a, b) => a.id.localeCompare(b.id)).map(p => p.right).join('\n')
    : task.kind === 'ordering' ? [...task.items].sort((a, b) => a.id.localeCompare(b.id)).map(i => i.text).join('\n')
    : task.kind === 'true_false' ? `${t('task.true')} / ${t('task.false')}` : ''
  const front = task.kind === 'cloze' ? card.front.replace(/\{\{[\w-]+\}\}/g, '___') : card.front
  return front + (suffix ? '\n\n' + suffix : '')
}
export function responseText(response: StudyResponse | null, task?: TaskDefinition): string {
  if (!response) return ''
  switch (response.kind) {
    case 'text': return response.value
    case 'fraction': return response.numerator || response.denominator ? `${response.numerator}/${response.denominator}` : ''
    case 'quantity': return `${response.value} ${response.unit}`.trim()
    case 'boolean': return response.value === null ? '' : t(response.value ? 'task.true' : 'task.false')
    case 'selection': return task && (task.kind === 'single_choice' || task.kind === 'multiple_choice') ? task.options.filter(o => response.ids.includes(o.id)).map(o => o.text).join('\n') : ''
    case 'order': return task?.kind === 'ordering' ? response.ids.map((id, i) => `${i + 1}. ${task.items.find(o => o.id === id)?.text ?? ''}`).join('\n') : ''
    case 'fields':
      if (task?.kind === 'cloze') return task.gaps.map(g => `${g.id}: ${fieldValue(response.values, g.id) || '—'}`).join('\n')
      if (task?.kind === 'matching') return task.pairs.map(p => `${p.left} → ${task.pairs.find(r => r.id === fieldValue(response.values, p.id))?.right || '—'}`).join('\n')
      return ''
  }
}
export function workingText(steps: WorkingStep[]): string {
  return steps.filter(s => s.value.trim()).map(s => s.kind === 'math' ? `\\[${s.value}\\]` : s.value).join('\n')
}
export function responseError(task: TaskDefinition | undefined, response: StudyResponse): TranslationKey | null {
  if (task?.kind !== 'calculation') return null
  const a = task.answer
  if (a.kind === 'fraction' && response.kind === 'fraction') return fractionValue(response.numerator, response.denominator) === null ? 'task.invalidMath' : null
  if (a.kind === 'fraction' && response.kind === 'text') return !parseNumeric(response.value) ? 'task.invalidMath' : null
  if (a.kind === 'number' && response.kind === 'text') return !parseNumeric(response.value) ? 'task.invalidMath' : null
  if (a.kind === 'quantity' && response.kind === 'quantity') return !parseNumeric(response.value) || !response.unit.trim() ? 'task.invalidMath' : null
  if (a.kind === 'formula' && response.kind === 'text') return !response.value.trim() ? 'task.requiredAnswer' : null
  return 'task.invalid'
}
function textBlankEqual(actual: string, expected: string): boolean {
  const normalized = normalizeAnswer(expected)
  return normalized ? normalizeAnswer(actual) === normalized
    : actual.trim().normalize('NFKC') === expected.trim().normalize('NFKC')
}
const partEvaluation = (parts: ResponsePart[]): AnswerEvaluation => {
  const correct = parts.filter(p => p.correct).length
  return { source: 'local', verdict: correct === parts.length ? 'correct' : correct ? 'partially_correct' : 'incorrect',
    feedback: t('task.parts', { correct, total: parts.length }), parts }
}
export function evaluateResponse(card: Card, response: StudyResponse): AnswerEvaluation | null {
  const task = card.task
  if (!task || task.kind === 'short_text' || task.kind === 'long_text') return localEvaluation(responseText(response, task), card.back)
  if (task.kind === 'calculation') {
    const a = task.answer
    if (a.kind === 'formula') return null
    const actual = responseText(response, task)
    const correct = a.kind === 'number' ? numericEqual(actual, a.value, a.tolerance)
      : a.kind === 'fraction' ? numericEqual(actual, `${a.numerator}/${a.denominator}`)
      : response.kind === 'quantity' && a.pairs.some(p => p.unit.trim().normalize('NFKC') === response.unit.trim().normalize('NFKC') && numericEqual(response.value, p.value, a.tolerance))
    return { source: 'local', verdict: correct ? 'correct' : 'incorrect', feedback: t('task.exactChecked') }
  }
  if (task.kind === 'true_false') return { source: 'local', verdict: response.kind === 'boolean' && response.value === task.correct ? 'correct' : 'incorrect', feedback: t('task.exactChecked') }
  if (task.kind === 'single_choice' || task.kind === 'multiple_choice') {
    const selected = response.kind === 'selection' ? response.ids : []
    const exact = selected.length === task.correctIds.length && new Set(selected).size === selected.length && selected.every(id => task.correctIds.includes(id))
    const parts = task.options.filter(o => selected.includes(o.id) || task.correctIds.includes(o.id)).map(o => ({ label: o.text, actual: selected.includes(o.id) ? '✓' : '—', expected: task.correctIds.includes(o.id) ? '✓' : '—', correct: selected.includes(o.id) === task.correctIds.includes(o.id) }))
    return { source: 'local', verdict: exact ? 'correct' : selected.some(id => task.correctIds.includes(id)) ? 'partially_correct' : 'incorrect', feedback: t('task.exactChecked'), parts }
  }
  if (task.kind === 'cloze') return partEvaluation(task.gaps.map(g => {
    const actual = response.kind === 'fields' ? fieldValue(response.values, g.id) : ''
    const acceptable = [g.answer, ...(g.alternatives || [])]
    return { label: g.id, expected: g.answer, actual, correct: Boolean(actual.trim()) && acceptable.some(a => g.kind === 'number' ? numericEqual(actual, a) : textBlankEqual(actual, a)) }
  }))
  if (task.kind === 'matching') return partEvaluation(task.pairs.map(p => {
    const id = response.kind === 'fields' ? fieldValue(response.values, p.id) : ''
    return { label: p.left, expected: p.right, actual: task.pairs.find(r => r.id === id)?.right || '', correct: id === p.id }
  }))
  return partEvaluation(task.correctOrder.map((id, i) => {
    const actual = response.kind === 'order' ? response.ids[i] : undefined
    return { label: String(i + 1), expected: task.items.find(o => o.id === id)!.text, actual: task.items.find(o => o.id === actual)?.text || '', correct: id === actual }
  }))
}
