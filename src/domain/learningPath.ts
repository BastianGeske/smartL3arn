import { criterionResults } from '../../shared/rubric.mjs'
import { t } from '../i18n'
import { freshProgress, type Activity, type Progress, type SavedPath } from '../../shared/learning-paths.mjs'
import { evaluateResponse, initialResponse } from './tasks'
import type { StudyResponse } from './types'

export function position({ content, progress }: SavedPath) {
  const goals = content.chapters.flatMap(chapter => chapter.objectives)
  const goal = goals[progress.passed.length]
  const chapter = goal && content.chapters.find(c => c.objectives.some(o => o.id === goal.id))
  const activity = goal && (progress.phase === 'practice' ? goal.practice
    : progress.phase === 'check' ? goal.checks[progress.variant] : undefined)
  return { goal, chapter, activity, total: goals.length }
}

export function attemptKey(row: SavedPath): string {
  const { goal, activity } = position(row)
  return JSON.stringify([row.content.id, row.content.version, goal?.id, activity?.id, row.progress.attempt])
}

function begin(progress: Progress, phase: Progress['phase'], activity?: Activity, variant = 0): Progress {
  const construct = phase === 'check' && activity?.task.kind === 'ordering'
  return { ...freshProgress(), passed: progress.passed, transferred: progress.transferred, practiceOnly: progress.practiceOnly,
    attempt: progress.attempt + 1, phase, variant,
    ...(construct ? { orderingInput: 'construct', draft: { kind: 'order', ids: [] } }
      : activity ? { draft: initialResponse(activity.task) } : {}) }
}

export function completeOrderingCheck(row: SavedPath, answer: StudyResponse): boolean {
  const task = position(row).activity?.task
  if (row.progress.phase !== 'check' || task?.kind !== 'ordering') return true
  return row.progress.orderingInput === 'construct' && answer.kind === 'order'
    && answer.ids.length === task.items.length && new Set(answer.ids).size === task.items.length
    && task.items.every(item => answer.ids.includes(item.id))
}

export function advance(row: SavedPath): Progress {
  const { goal } = position(row), p = row.progress
  if (!goal) return p
  if (p.phase === 'lesson') return begin(p, 'practice', goal.practice)
  if (p.phase === 'practice' && p.outcome === 'next') return begin(p, 'check', goal.checks[0])
  if (p.phase === 'check' && p.outcome === 'retry') {
    const variant = (p.variant + 1) % goal.checks.length
    return begin(p, 'check', goal.checks[variant], variant)
  }
  return p
}

export function assist(row: SavedPath, help: Exclude<Progress['help'], 'none'>): Progress {
  const { activity } = position(row), p = row.progress
  if (!activity || p.outcome !== 'open') return p
  return { ...p, help, attempt: p.attempt + 1, feedback: '',
    outcome: help !== 'solution' ? 'open' : p.phase === 'practice' ? 'next' : 'retry' }
}

function graded(row: SavedPath, correct: boolean, feedback: string): Progress {
  const p = row.progress
  if (p.phase === 'check' && correct && p.help === 'none') {
    const next = begin(p, 'lesson')
    next.passed = [...p.passed, position(row).goal!.id]
    return { ...next, feedback }
  }
  return { ...p, feedback: t(correct ? 'path.correct' : 'path.incomplete') + '\n' + feedback,
    outcome: p.phase === 'check' ? 'retry' : correct ? 'next' : 'open' }
}

export function gradeLocal(row: SavedPath, answer: StudyResponse): Progress {
  const { activity } = position(row), p = row.progress
  if (!activity || p.mode !== 'local' || p.outcome !== 'open' || !completeOrderingCheck(row, answer)) return p
  const evaluation = evaluateResponse(activity, answer)
  const correct = evaluation?.verdict === 'correct'
  let feedback = correct ? activity.solution : activity.feedback
  if (!correct && evaluation?.parts?.length) {
    const missed = evaluation.parts.filter(part => !part.correct).slice(0, 3).map(part => part.label.slice(0, 120))
    if (missed.length) feedback += '\n' + t('path.revisitParts', { parts: missed.join(', ') })
  }
  return graded({ ...row, progress: { ...p, draft: answer } }, correct, feedback)
}

export function gradeWritten(row: SavedPath, expectedAttempt: string, submitted: string, results: unknown): Progress {
  const p = row.progress, written = position(row).activity?.written
  if (!written || p.mode !== 'written' || p.outcome !== 'open' || p.prose !== submitted || attemptKey(row) !== expectedAttempt) return p
  const checked = criterionResults(results, written.criteria)
  if (!checked) return p
  const feedback = checked.map((result, index) =>
    t(result.status === 'satisfied' ? 'path.satisfied' : result.status === 'missing' ? 'path.notYet' : 'path.ambiguous')
    + ' · ' + written.criteria[index]!.description + ' — ' + result.reason).join('\n')
  if (checked.some(r => r.status === 'unclear')) return { ...p, feedback: t('path.unclear'), mode: 'local', attempt: p.attempt + 1 }
  const correct = checked.every(r => r.status === 'satisfied')
  const activityId = position(row).activity!.id
  const canonical = (s: string) => s.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()
  const knownWrong = [written.partial, written.misconception].some(s => canonical(s) === canonical(submitted))
  if (written.practiceOnly || p.practiceOnly.includes(activityId) || (correct && knownWrong)) {
    return { ...p, outcome: 'retry', feedback: t('path.unreliable'),
      practiceOnly: [...new Set([...p.practiceOnly, activityId])] }
  }
  return graded(row, correct, feedback)
}
