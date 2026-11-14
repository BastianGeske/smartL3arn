import { createCard } from './importExport'
import type { Card } from './types'

export interface SplitDraft { pairId: string; selected: boolean; front: string; back: string }
export function matchingDrafts(card: Pick<Card, 'task'>): SplitDraft[] {
  if (card.task?.kind !== 'matching') return []
  const task = card.task
  return task.pairs.map(pair => ({ pairId: pair.id, selected: true, front: '', back: pair.right }))
}
export function splitCards(drafts: SplitDraft[]): Card[] {
  const selected = drafts.filter(draft => draft.selected)
  if (!selected.length || selected.some(draft => !draft.front.trim() || !draft.back.trim() || draft.front.trim().length > 20000 || draft.back.trim().length > 20000)) throw new Error('Invalid split drafts')
  return selected.map(draft => createCard(draft.front.trim(), draft.back.trim(), { kind: 'short_text' }))
}
