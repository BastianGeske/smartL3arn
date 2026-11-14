import type { Card } from './types'

export type TaskQualityCode = 'matchingSize' | 'clozeSize' | 'orderingSize' | 'missingExplanation' | 'singleCorrect' | 'allCorrect'
export interface TaskQualityHint { code: TaskQualityCode; cardId: string; field: 'pairs' | 'gaps' | 'items' | 'explanation' | 'options' }
/** Editorial prompts for technically valid cards, never validation errors. */
export function taskQuality(card: Pick<Card, 'id' | 'task'>): TaskQualityHint[] {
  const task = card.task
  if (!task) return []
  const hints: TaskQualityHint[] = []
  const add = (code: TaskQualityCode, field: TaskQualityHint['field']) => hints.push({ code, cardId: card.id, field })
  if (task.kind === 'matching' && task.pairs.length > 5) add('matchingSize', 'pairs')
  if (task.kind === 'cloze' && task.gaps.length > 2) add('clozeSize', 'gaps')
  if (task.kind === 'ordering' && task.items.length > 6) add('orderingSize', 'items')
  if (['single_choice', 'multiple_choice', 'true_false'].includes(task.kind) && !task.explanation?.trim()) add('missingExplanation', 'explanation')
  if (task.kind === 'multiple_choice') {
    if (task.correctIds.length === 1) add('singleCorrect', 'options')
    if (task.correctIds.length === task.options.length) add('allCorrect', 'options')
  }
  return hints
}
