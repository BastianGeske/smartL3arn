import { afterEach, expect, it, vi } from 'vitest'
import example from '../../docs/learning-path.rounds.example.json'
import legacy from '../../docs/learning-path.example.json'
import { normalizePath, freshProgress, normalizePaths, type SavedPath } from '../../shared/learning-paths.mjs'
import { advance, assist, gradeLocal, gradeWritten, attemptKey, position } from './learningPath'
import { gradeReview, startReview, nextReview, revisitCompleted, reviewPosition } from './pathReview'
import { recordContact } from './pathEvidence'
import { codeFingerprint, codeValidated, validateCodeRubric } from './pathCode'
import { codeEdit } from './codeEditor'
import { pathQuality } from './pathQuality'

afterEach(() => vi.useRealTimers())
function answer(row: SavedPath) {
  const task = position(row).activity!.task
  if (task.kind === 'cloze') return { kind: 'fields' as const, values: Object.fromEntries(task.gaps.map(g => [g.id, g.answer])) }
  if (task.kind === 'calculation' && task.answer.kind === 'number') return { kind: 'text' as const, value: task.answer.value }
  throw new Error('Unexpected task')
}
function round() {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 22, 10))
  const row = { content: normalizePath(example), progress: freshProgress() }
  row.progress = advance(row)
  while (row.progress.phase === 'practice') { row.progress = gradeLocal(row, answer(row)); row.progress = advance(row) }
  return row
}
function passed() {
  const row = round()
  for (let i = 0; i < 5; i++) { row.progress = gradeLocal(row, answer(row)); if (i < 4) row.progress = advance(row) }
  return row
}
it('retains failed rounds and first practice answers after revision, relearning and reload', () => {
  const row = round()
  const first = row.progress.attempts![0]!
  for (let i = 0; i < 5; i++) { row.progress = assist(row, 'solution'); if (i < 4) row.progress = advance(row) }
  row.progress = advance(row)
  expect(row.progress.roundHistory).toHaveLength(1)
  expect(row.progress.roundHistory![0]!.round.answers.every(a => a.verdict === 'revealed')).toBe(true)
  expect(normalizePaths([row])[0]!.progress.attempts![0]).toEqual(first)
  expect(normalizePaths([row])[0]!.progress.roundHistory).toEqual(row.progress.roundHistory)
})
it('does not confirm same-day relearning, but confirms a first independent delayed review', () => {
  const row = passed()
  // Force an early review to exercise the policy even if a legacy backup says it is due today.
  row.progress.reviews![0]!.dueDate = '2026-11-22'
  row.progress = startReview(row, '2026-11-22')
  expect(row.progress.reviewSession!.assisted).toBe(true)
  row.progress = gradeReview(row, { kind: 'text', value: '20' }, false, '2026-11-22')
  expect(row.progress.reviews![0]).toMatchObject({ dueDate: '2026-11-23', retention: 'reinforce' })
  row.progress = nextReview(row, false, '2026-11-22')
  row.progress = startReview(row, '2026-11-23')
  const activity = reviewPosition(row).activity!
  const task = activity.task
  if (task.kind !== 'calculation' || task.answer.kind !== 'number') throw new Error('Expected calculation')
  row.progress = gradeReview(row, { kind: 'text', value: task.answer.value }, false, '2026-11-23')
  expect(row.progress.reviews![0]).toMatchObject({ retention: 'confirmed', confirmedOn: '2026-11-23' })
})
it.each(['before', 'paused'] as const)('tracks rereading %s starting a review and survives reload', when => {
  const row = passed()
  if (when === 'paused') row.progress = startReview(row, '2026-11-23')
  row.progress = revisitCompleted(row, 'aenderung', undefined, '2026-11-23')
  row.progress = normalizePaths([row])[0]!.progress
  row.progress = startReview(row, '2026-11-23')
  row.progress = gradeReview(row, { kind: 'text', value: '20' }, false, '2026-11-23')
  expect(row.progress.reviews![0]).toMatchObject({ lastResult: 'assisted', dueDate: '2026-11-24', retention: 'reinforce' })
  expect(row.progress.passed).toEqual(['aenderung'])
})
it('checks a future queued objective for contacts made before its item opens', () => {
  const row = passed()
  const content = normalizePath(legacy)
  row.content.chapters.push(content.chapters[0]!)
  row.progress.passed.push('anteil')
  row.progress.reviews!.push({ objectiveId: 'anteil', learnedOn: '2026-11-22', dueDate: '2026-11-23', seen: [] })
  row.progress = startReview(row, '2026-11-23')
  row.progress = revisitCompleted(row, 'anteil', undefined, '2026-11-23')
  row.progress = gradeReview(row, { kind: 'text', value: '20' }, false, '2026-11-23')
  row.progress = nextReview(row, false, '2026-11-23')
  expect(row.progress.reviewSession).toMatchObject({ queue: ['anteil'], assisted: true })
})
it('prioritises a fresh case from a failed skill group and clears the gap only after delayed success', () => {
  const row = round(), goal = row.content.chapters[0]!.objectives[0]!
  for (const activity of [...goal.checks, ...goal.reviewChecks!]) delete activity.skillGroup
  goal.checks[0]!.skillGroup = 'base'
  goal.checks[5]!.skillGroup = 'base'
  row.progress = gradeLocal(row, { kind: 'fields', values: { basis: '90', prozent: '20' } })
  for (let i = 1; i < 5; i++) { row.progress = advance(row); row.progress = gradeLocal(row, answer(row)) }
  expect(row.progress.gaps).toEqual([{ objectiveId: goal.id, group: 'base' }])
  row.progress = startReview(row, '2026-11-23')
  expect(row.progress.reviewSession!.activityId).toBe('k6')
  row.progress = gradeReview(row, { kind: 'text', value: '25' }, false, '2026-11-23')
  expect(row.progress.gaps).toEqual([])
  expect(normalizePaths([row])[0]!.progress.reviews![0]!.retention).toBe('confirmed')
})
it('does not inflate stability after a confirmed objective is reread and answered correctly', () => {
  const row = passed()
  Object.assign(row.progress.reviews![0]!, { lastReview: '2026-11-23', stability: 20, difficulty: 5, repetitions: 3,
    lastResult: 'independent', lastCase: 'new', retention: 'confirmed' })
  row.progress = recordContact(row.progress, 'aenderung', 'solution', '2026-12-20')
  row.progress = startReview(row, '2026-12-20')
  row.progress = gradeReview(row, { kind: 'text', value: '20' }, false, '2026-12-20')
  expect(row.progress.reviews![0]!.stability).toBeLessThanOrEqual(20)
  expect(row.progress.reviews![0]!.retention).toBe('reinforce')
})
it('requires code evidence, language and a validation tied to the current rubric and model', () => {
  const row = round(), goal = row.content.chapters[0]!.objectives[0]!
  const written = { ...goal.checks[0]!.written!, input: 'code' as const, language: 'Python' }
  goal.requiredEvidence = 'code'
  for (const a of goal.checks) a.written = { ...written }
  expect(normalizePath(row.content).chapters[0]!.objectives[0]!.requiredEvidence).toBe('code')
  row.progress = gradeLocal(row, answer(row))
  expect(row.progress.selfCheck!.answers[0]!.assisted).toBe(true)
  row.progress = advance(row)
  row.progress = { ...row.progress, mode: 'written', prose: 'def f(x):\n    return x' }
  const activity = position(row).activity!
  const criteria = written.criteria.map(c => ({ id: c.id, status: 'satisfied', reason: 'Evidence.' }))
  expect(gradeWritten(row, attemptKey(row), row.progress.prose, criteria, 'a/model').selfCheck!.answers).toHaveLength(1)
  row.progress.codeValidations = [{ activityId: activity.id, model: 'a/model', fingerprint: codeFingerprint(activity.written!) }]
  expect(codeValidated(row.progress, activity.id, activity.written!, 'other/model')).toBe(false)
  expect(codeValidated(row.progress, activity.id, { ...activity.written!, reference: 'changed' }, 'a/model')).toBe(false)
  row.progress = gradeWritten(row, attemptKey(row), row.progress.prose, criteria, 'a/model')
  expect(row.progress.selfCheck!.answers[1]).toMatchObject({ verdict: 'correct', assisted: false })
  delete goal.checks[0]!.written!.language
  expect(() => normalizePath(row.content)).toThrow(/code evidence/)
})
it.each(['positive', 'partial', 'unclear', 'error', 'cancel'] as const)('checks code rubric probes: %s', async variant => {
  const written = normalizePath(example).chapters[0]!.objectives[0]!.checks[0]!.written!
  written.input = 'code'; written.language = 'Python'
  let calls = 0
  const evaluate = vi.fn(async () => {
    calls++
    if (variant === 'error') return { ok: false }
    const status = variant === 'unclear' ? 'unclear' : calls === 1 && variant !== 'positive' || variant === 'partial' ? 'satisfied' : 'missing'
    return { ok: true, result: { criteria: written.criteria.map(c => ({ id: c.id, status, reason: 'Probe.' })) } }
  })
  const valid = await validateCodeRubric(evaluate as never, written, 'Code', 'de', () => variant !== 'cancel')
  expect(valid).toBe(false)
})
it('accepts a rubric only after all three probes and sends code metadata', async () => {
  const written = normalizePath(example).chapters[0]!.objectives[0]!.checks[0]!.written!
  written.input = 'code'; written.language = 'Python'
  let calls = 0
  const evaluate = vi.fn(async () => ({ ok: true, result: { criteria: written.criteria.map(c => ({ id: c.id,
    status: calls === 0 ? 'satisfied' : 'missing', reason: 'Probe.' })) } }))
  evaluate.mockImplementation(async () => {
    const status = calls++ === 0 ? 'satisfied' : 'missing'
    return { ok: true, result: { criteria: written.criteria.map(c => ({ id: c.id, status, reason: 'Probe.' })) } }
  })
  expect(await validateCodeRubric(evaluate as never, written, 'Code', 'de')).toBe(true)
  expect(evaluate).toHaveBeenCalledTimes(3)
  expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ answerFormat: 'code', codeLanguage: 'Python' }))
})
it('preserves source and selection while indenting, outdenting and adding lines', () => {
  expect(codeEdit('a\nb', 0, 3, 'Tab')).toEqual({ value: '  a\n  b', start: 2, end: 7 })
  expect(codeEdit('  a\n  b', 0, 7, 'Tab', true)).toEqual({ value: 'a\nb', start: 0, end: 3 })
  expect(codeEdit('  return X', 10, 10, 'Enter')).toEqual({ value: '  return X\n  ', start: 13, end: 13 })
  expect(codeEdit('x', 1, 1, 'Tab').value).toBe('x  ')
})
it('imports legacy progress without fabricating retention and reports structural limits', () => {
  const row = { content: normalizePath(legacy), progress: freshProgress() }
  expect(normalizePaths([row])[0]!.progress.contacts).toBeUndefined()
  expect(pathQuality(row.content).map(i => i.key)).toContain('path.quality.legacy')
})
it('mixes related contrast groups within the same due date while keeping older work first', () => {
  const content = normalizePath(legacy), first = content.chapters[0]!.objectives[0]!
  const other = content.chapters[1]!.objectives[0]!
  first.contrastGroup = 'percent-base'
  const related = { ...first, id: 'related', practice: { ...first.practice, id: 'related-p' }, reviewChecks: undefined,
    checks: first.checks.map(a => ({ ...a, id: 'related-' + a.id })) }
  content.chapters.push({ id: 'third', title: 'Related', objectives: [related] })
  const row: SavedPath = { content, progress: { ...freshProgress(), passed: [first.id, other.id, related.id],
    reviews: [first, other, related].map(g => ({ objectiveId: g.id, dueDate: '2026-11-23', seen: [] })) } }
  expect(startReview(row, '2026-11-23').reviewSession!.queue).toEqual([first.id, related.id, other.id])
  row.progress.reviews![1]!.dueDate = '2026-11-22'
  expect(startReview(row, '2026-11-23').reviewSession!.queue[0]).toBe(other.id)
})
it('does not fabricate delayed retention for old objectives with no known learning date', () => {
  const content = normalizePath(legacy), goal = content.chapters[0]!.objectives[0]!
  const row: SavedPath = { content, progress: { ...freshProgress(), passed: [goal.id] } }
  row.progress = startReview(row, '2026-11-23')
  row.progress = gradeReview(row, { kind: 'text', value: '8' }, false, '2026-11-23')
  expect(row.progress.reviews![0]!.confirmedOn).toBeUndefined()
  expect(row.progress.reviews![0]!.learnedOn).toBe('2026-11-23')
})
it('rejects corrupt persisted contact dates and keeps validation fingerprints stable across normalization', () => {
  const row = passed()
  row.progress.contacts![0]!.day = '2026-99-99'
  expect(() => normalizePaths([row])).toThrow(/contact time/)
  const written = row.content.chapters[0]!.objectives[0]!.checks[0]!.written!
  const reordered = { ...written, input: 'code' as const, language: 'Python' }
  const original = { ...reordered, criteria: written.criteria }
  expect(codeFingerprint(original)).toBe(codeFingerprint(Object.fromEntries(Object.entries(original).reverse()) as typeof original))
})
it('preserves the first incorrect practice answer after the learner corrects it', () => {
  const row = { content: normalizePath(example), progress: freshProgress() }
  row.progress = advance(row)
  row.progress = gradeLocal(row, { kind: 'fields', values: { basis: '80', prozent: '20' } })
  row.progress = gradeLocal(row, { kind: 'fields', values: { basis: '80', prozent: '25' } })
  row.progress = advance(row)
  const restored = normalizePaths([row])[0]!
  expect(restored.progress.attempts!.map(a => a.result.verdict)).toEqual(['partial', 'correct'])
  expect(restored.progress.attempts![0]!.result.response).toMatchObject({ values: { prozent: '20' } })
})
