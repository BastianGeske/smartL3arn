import type { Objective, ObjectiveReview, Progress, SavedPath } from '../../shared/learning-paths.mjs'
import { parseNumeric } from '../../shared/tasks.mjs'
import { daysBetweenIsoDates, todayStr } from './dates'
import { scheduleCard } from './scheduling/fsrs'
import { evaluateResponse, fieldValue, initialResponse, responseError } from './tasks'
import type { StudyResponse, TaskDefinition } from './types'

function dueByDate(row: SavedPath, today: string) {
  const dates = new Map(row.progress.reviews?.map(r => [r.objectiveId, r.dueDate]))
  return row.progress.passed.map(id => ({ id, due: dates.get(id) ?? '' }))
    .filter(entry => entry.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due))
}

export function dueObjectives(row: SavedPath, today = todayStr()) {
  return dueByDate(row, today).map(entry => entry.id)
}

function cases(goal: Objective) {
  return [...(goal.reviewChecks ?? []), ...goal.checks]
}

export function reviewPosition(row: SavedPath) {
  const session = row.progress.reviewSession
  const goal = session && row.content.chapters.flatMap(c => c.objectives).find(g => g.id === session.queue[0])
  const activity = goal && cases(goal).find(a => a.id === session!.activityId)
  return { session, goal, activity }
}

function replaceRecord(progress: Progress, record: ObjectiveReview) {
  return [...(progress.reviews ?? []).filter(r => r.objectiveId !== record.objectiveId), record]
}

export function revisitCompleted(row: SavedPath, objectiveId: string, checkId?: string, today = todayStr()): Progress {
  const progress = row.progress
  if (!progress.passed.includes(objectiveId)) return progress
  const session = progress.reviewSession
  let next = progress
  if (session?.queue[0] === objectiveId && session.outcome === 'open' && !session.assisted) {
    next = { ...next, reviewSession: { ...session, assisted: true } }
  }
  const goal = row.content.chapters.flatMap(c => c.objectives).find(g => g.id === objectiveId)
  if (!checkId || !goal?.checks.some(check => check.id === checkId)) return next
  const record = next.reviews?.find(r => r.objectiveId === objectiveId) ?? { objectiveId, dueDate: today, seen: [] }
  if (record.seen.at(-1) === checkId) return next
  return { ...next, reviews: replaceRecord(next, { ...record, seen: [...record.seen.filter(id => id !== checkId), checkId] }) }
}

function openCase(row: SavedPath, queue: string[], retry: boolean, today: string): Progress {
  const progress = row.progress
  if (!queue.length) {
    const { reviewSession: _finished, ...lesson } = progress
    return lesson
  }
  const goal = row.content.chapters.flatMap(c => c.objectives).find(g => g.id === queue[0])!
  const record = progress.reviews?.find(r => r.objectiveId === goal.id) ??
    { objectiveId: goal.id, dueDate: today, seen: [] }
  // Keep reserved cases for delayed attempts when correcting a miss in the same session.
  const pool = retry ? goal.checks.filter(a => a.id !== progress.reviewSession?.activityId) : cases(goal)
  // An unseen held-out case comes first. Rotate exhausted pools in order of last exposure.
  const activity = pool.sort((a, b) => record.seen.indexOf(a.id) - record.seen.indexOf(b.id))[0]!
  const caseType = record.seen.includes(activity.id) ? 'repeat' :
    record.exposureKnown || goal.reviewChecks?.some(a => a.id === activity.id) ? 'new' : 'lesson'
  const seen = [...record.seen.filter(id => id !== activity.id), activity.id]
  return { ...progress, reviews: replaceRecord(progress, { ...record, seen }), reviewSession: {
    queue, activityId: activity.id, caseType, assisted: false, retry, outcome: 'open',
    draft: activity.task.kind === 'ordering' ? { kind: 'order', ids: [] } : initialResponse(activity.task)
  } }
}

export function startReview(row: SavedPath, today = todayStr()) {
  if (row.progress.reviewSession) return row.progress
  const chapterOf = new Map(row.content.chapters.flatMap(chapter =>
    chapter.objectives.map(goal => [goal.id, chapter.id] as const)))
  const remaining = dueByDate(row, today)
  const queue: string[] = []
  const selectedChapters = new Set<string | undefined>()
  while (queue.length < 3 && remaining.length) {
    const earliest = remaining[0]!.due
    const previousChapter = chapterOf.get(queue.at(-1) ?? '')
    const newChapter = remaining.findIndex(({ id, due }) => due === earliest && !selectedChapters.has(chapterOf.get(id)))
    const differentChapter = remaining.findIndex(({ id, due }) => due === earliest && chapterOf.get(id) !== previousChapter)
    const [selected] = remaining.splice(newChapter >= 0 ? newChapter : Math.max(0, differentChapter), 1)
    queue.push(selected!.id)
    selectedChapters.add(chapterOf.get(selected!.id))
  }
  return queue.length ? openCase(row, queue, false, today) : row.progress
}

export function nextReview(row: SavedPath, retry = false, today = todayStr()) {
  const session = row.progress.reviewSession
  if (!session || session.outcome === 'open' || (retry && (session.retry || session.outcome !== 'incorrect' && !session.assisted))) return row.progress
  return openCase(row, retry ? session.queue : session.queue.slice(1), retry, today)
}

export function reviewAnswerError(task: TaskDefinition, value: StudyResponse) {
  const invalid = responseError(task, value)
  if (invalid) return invalid
  if (value.kind === 'selection' && !value.ids.length || value.kind === 'boolean' && value.value === null ||
      task.kind === 'ordering' && (value.kind !== 'order' || value.ids.length !== task.items.length)) return 'path.answerFirst'
  if (value.kind === 'fields') {
    const fields = task.kind === 'matching' ? task.pairs : task.kind === 'cloze' ? task.gaps : []
    if (fields.some(f => !fieldValue(value.values, f.id).trim())) return 'path.answerFirst'
    if (task.kind === 'cloze' && task.gaps.some(g => g.kind === 'number' && !parseNumeric(fieldValue(value.values, g.id)))) return 'task.invalidMath'
  }
  return null
}

export function gradeReview(row: SavedPath, value: StudyResponse, reveal = false, today = todayStr()): Progress {
  const { session, goal, activity } = reviewPosition(row)
  const p = row.progress
  if (!session || session.outcome !== 'open' || !activity || !goal || (!reveal && reviewAnswerError(activity.task, value))) return p
  const correct = !reveal && evaluateResponse(activity, value)?.verdict === 'correct'
  const assisted = reveal || session.assisted
  const updated: Progress = { ...p, reviewSession: { ...session, draft: value, assisted, outcome: correct ? 'correct' : 'incorrect',
    ...(reveal && { revealed: true as const }) } }
  if (session.retry) return updated
  const record = p.reviews!.find(r => r.objectiveId === goal.id)!
  const previous = record.lastReview ?? record.learnedOn
  const { dueDate, lastReview, stability, difficulty, repetitions } = scheduleCard(record, correct && !assisted ? 2 : 0, today)
  updated.reviews = replaceRecord(p, { ...record, dueDate, lastReview, stability, difficulty, repetitions,
    ...(previous && { gapDays: Math.max(0, daysBetweenIsoDates(previous, today)) }),
    lastCase: session.caseType, lastResult: assisted ? 'assisted' : correct ? 'independent' : 'missed' })
  return updated
}
