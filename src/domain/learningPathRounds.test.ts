import { describe, expect, it } from 'vitest'
import example from '../../docs/learning-path.rounds.example.json'
import legacy from '../../docs/learning-path.example.json'
import { freshProgress, normalizePath, normalizePaths, type Objective, type SavedPath } from '../../shared/learning-paths.mjs'
import { advance, assist, attemptKey, gradeLocal, gradeWritten, position, relearnObjective, switchObjective } from './learningPath'
import { startReview } from './pathReview'
import type { StudyResponse } from './types'

function newPath(size = 5) {
  const content = normalizePath(example)
  const goal = content.chapters[0]!.objectives[0]!
  goal.selfCheckSize = size
  goal.checks.length = size + 2
  return normalizePaths([{ content, progress: freshProgress() }])[0]!
}
function correct(row: SavedPath): StudyResponse {
  const task = position(row).activity!.task
  if (task.kind === 'cloze') return { kind: 'fields', values: Object.fromEntries(task.gaps.map(gap => [gap.id, gap.answer])) }
  if (task.kind === 'calculation' && task.answer.kind === 'number') return { kind: 'text', value: task.answer.value }
  throw new Error('Unexpected test activity')
}
function openRound(size = 5) {
  const row = newPath(size)
  row.progress = advance(row)
  while (row.progress.phase === 'practice') {
    row.progress = gradeLocal(row, correct(row))
    row.progress = advance(row)
  }
  return normalizePaths([row])[0]!
}

describe('learning path rounds', () => {
  it('requires three or more practices, enough reserves and unique local cases', () => {
    const invalid: ((goal: Objective) => void)[] = [
      goal => { goal.practiceExtras!.pop() },
      goal => delete goal.selfCheckSize,
      goal => { goal.checks.pop() },
      goal => { goal.practiceExtras![0]!.question = goal.checks[0]!.question.toUpperCase() },
      goal => { goal.practiceExtras![0]!.task = { kind: 'long_text' } },
    ]
    for (const change of invalid) {
      const content = normalizePath(example)
      change(content.chapters[0]!.objectives[0]!)
      expect(() => normalizePath(content)).toThrow()
    }
    expect(normalizePath(legacy).chapters[0]!.objectives[0]!.selfCheckSize).toBeUndefined()
  })

  it('keeps the attempted answer and preserves practice and check state across topic switches and reload', () => {
    const row = newPath()
    row.content.chapters.push(normalizePath(legacy).chapters[0]!)
    row.progress = advance(row)
    expect(assist(row, 'solution')).toBe(row.progress)
    row.progress = gradeLocal(row, { kind: 'fields', values: { basis: '80', prozent: '20' } })
    expect(row.progress.result?.verdict).toBe('partial')
    expect(row.progress.outcome).toBe('open')
    row.progress = assist(row, 'solution')
    row.progress = advance(row)
    expect(position(row).activity?.id).toBe('p2')
    row.progress = normalizePaths([row])[0]!.progress
    expect(row.progress.practiceAnswers?.[0]).toMatchObject({ verdict: 'revealed', assisted: true, response: { values: { prozent: '20' } } })
    while (row.progress.phase === 'practice') {
      row.progress = gradeLocal(row, correct(row))
      row.progress = advance(row)
    }
    row.progress = gradeLocal(row, correct(row))
    const savedRound = row.progress.selfCheck
    row.progress = switchObjective(row, 'anteil')
    row.progress = normalizePaths([row])[0]!.progress
    row.progress = switchObjective(row, 'aenderung')
    expect(row.progress.selfCheck).toEqual(savedRound)
    expect(row.progress.practiceAnswers).toHaveLength(3)
    row.progress = advance(row)
    expect(position(row).activity?.id).toBe('k2')
  })

  it('fails with two of three and prefers fresh cases before the oldest repeat', () => {
    const row = openRound(3)
    row.progress = gradeLocal(row, correct(row))
    row.progress = advance(row)
    row.progress = assist(row, 'hint')
    row.progress = gradeLocal(row, correct(row))
    row.progress = advance(row)
    row.progress = gradeLocal(row, correct(row))
    expect(row.progress.passed).toEqual([])
    expect(row.progress.reviews).toBeUndefined()
    expect(row.progress.selfCheck?.answers.map(answer => answer.assisted)).toEqual([false, true, false])
    row.progress = normalizePaths([row])[0]!.progress
    row.progress = advance(row)
    expect(row.progress.selfCheck).toEqual({ queue: ['k4', 'k5', 'k1'], repeated: ['k1'], answers: [] })
  })

  it('returns to instruction after a failed round without erasing exposure or other objectives', () => {
    const row = openRound(3)
    row.content.chapters.push(normalizePath(legacy).chapters[0]!)
    row.progress = switchObjective(row, 'anteil')
    row.progress = advance(row)
    row.progress = gradeLocal(row, { kind: 'text', value: '6' })
    row.progress = advance(row)
    row.progress = gradeLocal(row, { kind: 'text', value: '15' })
    expect(position(row).goal?.id).toBe('aenderung')
    expect(relearnObjective(row)).toBe(row.progress)
    for (let i = 0; i < 3; i++) {
      row.progress = gradeLocal(row, i === 0 ? { kind: 'fields', values: { basis: '90', prozent: '20' } } : correct(row))
      if (i < 2) row.progress = advance(row)
    }
    const previous = row.progress
    row.progress = relearnObjective(row)
    expect(row.progress).toMatchObject({ phase: 'lesson', outcome: 'open', seenChecks: ['k1', 'k2', 'k3'],
      passed: ['anteil'], reviews: previous.reviews, attempt: previous.attempt + 1 })
    expect(row.progress.selfCheck).toBeUndefined()
    expect(row.progress.practiceAnswers).toBeUndefined()
    row.progress = normalizePaths([row])[0]!.progress
    row.progress = advance(row)
    while (row.progress.phase === 'practice') {
      row.progress = gradeLocal(row, correct(row))
      row.progress = advance(row)
      row.progress = normalizePaths([row])[0]!.progress
    }
    expect(row.progress.selfCheck).toEqual({ queue: ['k4', 'k5', 'k1'], repeated: ['k1'], answers: [] })
    expect(startReview(row, '2100-01-01').reviewSession?.queue).toEqual(['anteil'])
  })

  it('passes with four of five, preserving feedback and reserving the delayed case', () => {
    const row = openRound()
    row.progress = { ...row.progress, mode: 'written', prose: 'Der Ausgangspreis war vor dem Zuschlag 72 Euro.' }
    const results = [{ id: 'basis', status: 'satisfied', reason: 'Ausgangspreis belegt.' },
      { id: 'rate', status: 'missing', reason: 'Der relative Zuschlag fehlt.' }]
    row.progress = gradeWritten(row, attemptKey(row), row.progress.prose, results)
    expect(row.progress.selfCheck?.answers[0]).toMatchObject({ verdict: 'partial', criteria: results })
    for (let i = 0; i < 4; i++) {
      row.progress = advance(row)
      row.progress = gradeLocal(row, correct(row))
    }
    expect(row.progress.passed).toEqual(['aenderung'])
    const recovered = normalizePaths([row])[0]!
    expect(recovered.progress.completedChecks?.[0]?.round.answers).toHaveLength(5)
    const [review] = recovered.progress.reviews!
    expect(review?.seen).toEqual(['k1', 'k2', 'k3', 'k4', 'k5'])
    expect(startReview(recovered, review!.dueDate).reviewSession?.activityId).toBe('k7')
  })

  it('uses the same local case after an ambiguous provider result', () => {
    const row = openRound()
    row.progress = { ...row.progress, mode: 'written', prose: 'Auf den Ausgangswert.' }
    const results = [{ id: 'basis', status: 'unclear', reason: 'Ausgangswert unklar.' },
      { id: 'rate', status: 'missing', reason: 'Der relative Zuschlag fehlt.' }]
    row.progress = gradeWritten(row, attemptKey(row), row.progress.prose, results)
    expect(row.progress).toMatchObject({ mode: 'local', outcome: 'open', prose: 'Auf den Ausgangswert.', selfCheck: { answers: [] } })
    expect(position(row).activity?.id).toBe('k1')
    row.progress = assist(row, 'solution')
    expect(normalizePaths([row])[0]!.progress.selfCheck?.answers[0]).toMatchObject({ assisted: true, verdict: 'revealed' })
  })
})
