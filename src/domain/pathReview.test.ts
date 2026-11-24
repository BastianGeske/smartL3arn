import { afterEach, expect, it, vi } from 'vitest'
import example from '../../docs/learning-path.example.json'
import { freshProgress, normalizePath, normalizePaths, type SavedPath } from '../../shared/learning-paths.mjs'
import { advance, gradeLocal } from './learningPath'
import { dueObjectives, gradeReview, nextReview, startReview } from './pathReview'

afterEach(() => vi.useRealTimers())
function learned(): SavedPath {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 24, 23, 58))
  const row = { content: normalizePath(example), progress: freshProgress() }
  row.progress = advance(row)
  row.progress = gradeLocal(row, { kind: 'text', value: '6' })
  row.progress = advance(row)
  row.progress = gradeLocal(row, { kind: 'text', value: '15' })
  return row
}

it('schedules tomorrow, grades one independent delayed answer and keeps the lesson draft intact', () => {
  const row = learned()
  row.progress = advance(row)
  const lesson = { ...row.progress }
  expect(dueObjectives(row)).toEqual([])
  row.progress = startReview(row, '2026-11-05')
  expect(row.progress.reviewSession).toMatchObject({ caseType: 'new', activityId: 'anteil-review' })
  row.progress = gradeReview(row, { kind: 'text', value: '8' }, false, '2026-11-05')
  expect(row.progress.reviews![0]).toMatchObject({ lastResult: 'independent', gapDays: 12, repetitions: 1, dueDate: '2026-11-08' })
  expect(gradeReview(row, { kind: 'text', value: '0' })).toBe(row.progress)
  row.progress = nextReview(row)
  expect(row.progress.reviewSession).toBeUndefined()
  expect(row.progress).toMatchObject({ phase: lesson.phase, variant: lesson.variant, draft: lesson.draft, prose: lesson.prose })
  expect(row.progress.reviews![0]!.retention).toBe('confirmed')
  expect(normalizePaths([row])).toEqual([row])
})

it.each(['miss', 'hint', 'reveal'])('preserves the first result after a %s and a successful immediate retry', kind => {
  const row = learned()
  const day = '2026-10-25'
  row.progress = startReview(row, day)
  row.progress.reviewSession!.assisted = kind === 'hint'
  row.progress = gradeReview(row, { kind: 'text', value: kind === 'miss' ? '20' : '8' }, kind === 'reveal', day)
  const records = row.progress.reviews
  expect(records?.[0]).toMatchObject({ lastResult: kind === 'miss' ? 'missed' : 'assisted', dueDate: '2026-10-26' })
  row.progress = nextReview(row, true, day)
  expect(row.progress.reviewSession?.activityId).toBe('a-check2')
  row.progress = gradeReview(row, { kind: 'text', value: '27' }, false, day)
  expect(row.progress.reviews![0]).toMatchObject({ ...records![0], seen: row.progress.reviews![0]!.seen })
  row.progress = nextReview(row)
  row.progress = startReview(row, '2026-10-26')
  expect(row.progress.reviewSession).toMatchObject({ caseType: 'repeat', activityId: 'anteil-review' })
})

it('mixes at most three overdue objectives, including legacy paths without review content or history', () => {
  const content = normalizePath(example)
  const template = content.chapters[0]!.objectives[0]!
  content.chapters[0]!.objectives = Array.from({ length: 4 }, (_, i) => ({ ...template, id: 'g' + i,
    practice: { ...template.practice, id: 'p' + i }, reviewChecks: undefined,
    checks: template.checks.map(a => ({ ...a, id: a.id + i })) }))
  content.chapters.length = 1
  content.reviewCards = []
  const row = { content, progress: { ...freshProgress(), passed: ['g0', 'g1', 'g2', 'g3'] } }
  row.progress = startReview(row)
  expect(row.progress.reviewSession).toMatchObject({ queue: ['g0', 'g1', 'g2'], caseType: 'lesson' })
  for (const id of ['g0','g1','g2']) {
    expect(row.progress.reviewSession!.queue[0]).toBe(id)
    row.progress = gradeReview(row, { kind: 'text', value: '15' })
    row.progress = nextReview(row)
  }
  expect(dueObjectives(row)).toEqual(['g3'])
  expect(normalizePaths([row])[0]!.progress.reviews?.[0]?.gapDays).toBeUndefined()
})

it.each([
  { firstDate: '2026-10-25', secondDate: '2026-10-25', queue: ['anteil', 'wechsel', 'a2'] },
  { firstDate: '2026-10-24', secondDate: '2026-10-25', queue: ['anteil', 'a2', 'a3'] },
  { firstDate: undefined, secondDate: undefined, queue: ['anteil', 'wechsel', 'a2'] },
])('mixes chapters within due dates and resumes the stored queue ($firstDate, $secondDate)', ({ firstDate, secondDate, queue }) => {
  const content = normalizePath(example)
  const chapter = content.chapters[0]!
  const template = chapter.objectives[0]!
  for (const id of ['a2', 'a3']) {
    chapter.objectives.push({ ...template, id, practice: { ...template.practice, id: id + '-practice' },
      checks: template.checks.map(a => ({ ...a, id: id + '-' + a.id })), reviewChecks: undefined })
  }
  const passed = ['anteil', 'a2', 'a3', 'wechsel']
  const reviews = passed.flatMap(objectiveId => {
    const dueDate = objectiveId === 'wechsel' ? secondDate : firstDate
    return dueDate ? [{ objectiveId, dueDate, seen: [] }] : []
  })
  const row: SavedPath = { content, progress: { ...freshProgress(), passed, reviews } }
  expect(dueObjectives(row, '2026-10-25')).toEqual(passed)
  row.progress = startReview(row, '2026-10-25')
  expect(row.progress.reviewSession?.queue).toEqual(queue)
  expect(startReview(row, '2026-11-01')).toBe(row.progress)
})

it('rejects reserved cases duplicating ordinary checks, along with stale or invalid review drafts', () => {
  const row = learned(), goal = row.content.chapters[0]!.objectives[0]!
  const question = goal.reviewChecks![0]!.question
  goal.reviewChecks![0]!.question = '  ' + goal.checks[0]!.question.toUpperCase() + ' '
  expect(() => normalizePath(row.content)).toThrow(/distinct/)
  goal.reviewChecks![0]!.question = question
  row.progress = startReview(row, '2026-10-25')
  row.progress.reviewSession!.draft = { kind: 'fields', values: {} }
  expect(() => normalizePaths([row])).toThrow(/draft/)
})
