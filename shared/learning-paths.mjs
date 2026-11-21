import { normalizeTask } from './tasks.mjs'
import { criterionResults } from './rubric.mjs'

function expect(condition, field) {
  if (!condition) throw new Error('Invalid learning path · ' + field)
}
function object(v, field) {
  expect(v && typeof v === 'object' && !Array.isArray(v), field)
  return v
}
function string(v, field, max = 4000, empty = false) {
  expect(typeof v === 'string' && (empty || v.trim()) && v.length <= max, field)
  return v
}
function list(v, field, min, max) {
  expect(Array.isArray(v) && v.length >= min && v.length <= max, field)
  return v
}
function members(values, allowed, field, min = 0, max = allowed.length) {
  list(values, field, min, max)
  expect(new Set(values).size === values.length && values.every(id => allowed.includes(id)), field)
  return [...values]
}
function number(v, field, min = 0) {
  expect(Number.isSafeInteger(v) && v >= min && v <= 1000000000, field)
  return v
}
function choice(v, field, values) {
  expect(values.includes(v), field)
  return v
}
function id(v, seen, field) {
  expect(typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v) && !seen.has(v), field)
  seen.add(v)
  return v
}
function written(v) {
  object(v, 'written')
  const seen = new Set()
  const result = { question: string(v.question, 'written.question'), reference: string(v.reference, 'written.reference'),
    criteria: list(v.criteria, 'criteria', 1, 8).map(c => ({
      id: id(c?.id, seen, 'criterion.id'), description: string(c.description, 'criterion.description', 480)
    })) }
  if (v.practiceOnly !== undefined) {
    expect(typeof v.practiceOnly === 'boolean', 'written.practiceOnly')
    result.practiceOnly = v.practiceOnly
  }
  if (v.input !== undefined) result.input = choice(v.input, 'written.input', ['text', 'code', 'formula'])
  for (const key of ['paraphrase', 'partial', 'misconception']) result[key] = string(v[key], key, 1000)
  expect(new Set([result.paraphrase, result.partial, result.misconception]).size === 3, 'written.examples')
  return result
}
function activity(v, seen, check) {
  object(v, 'activity')
  const question = string(v.question, 'question')
  const task = normalizeTask(v.task, question)
  expect(!['short_text', 'long_text'].includes(task.kind) && task.answer?.kind !== 'formula', 'local task')
  expect(!check || task.kind !== 'true_false', 'independent check')
  const result = { id: id(v.id, seen, 'activity.id'), question, task, hint: string(v.hint, 'hint'),
    solution: string(v.solution, 'solution'), feedback: string(v.feedback, 'feedback') }
  if (v.written !== undefined) {
    expect(check, 'written check')
    result.written = written(v.written)
  }
  return result
}
export function missingSource(v) {
  if (v?.format !== 'smartL3arn.needsSource') return null
  expect(v.schemaVersion === 1, 'schemaVersion')
  return list(v.missing, 'missing', 1, 40).map(item => string(item, 'missing', 1000))
}
export function normalizePath(v) {
  object(v, 'content')
  expect(v.format === 'smartL3arn.learningPath' && v.schemaVersion === 1, 'format / schemaVersion')
  const seen = new Set(), objectives = new Set()
  const chapters = list(v.chapters, 'chapters', 1, 40).map(c => ({
    id: id(c?.id, seen, 'chapter.id'), title: string(c.title, 'chapter.title', 160),
    objectives: list(c.objectives, 'objectives', 1, 12).map(o => {
      const objectiveId = id(o?.id, seen, 'objective.id')
      objectives.add(objectiveId)
      const practice = activity(o.practice, seen, false)
      const checks = list(o.checks, 'checks', 2, 8).map(a => activity(a, seen, true))
      const practiceExtras = o.practiceExtras === undefined ? undefined :
        list(o.practiceExtras, 'practiceExtras', 2, 5).map(a => activity(a, seen, false))
      const selfCheckSize = o.selfCheckSize === undefined ? undefined : number(o.selfCheckSize, 'selfCheckSize', 3)
      expect(Boolean(practiceExtras) === (selfCheckSize !== undefined), 'practiceExtras and selfCheckSize')
      expect(selfCheckSize === undefined || selfCheckSize <= 6 && checks.length >= selfCheckSize + 2, 'selfCheckSize / reserve checks')
      const reviewChecks = o.reviewChecks === undefined ? undefined : list(o.reviewChecks, 'reviewChecks', 1, 3).map(a => {
        expect(a && a.written === undefined, 'reviewChecks.local')
        return activity(a, seen, true)
      })
      const opening = o.opening === undefined ? undefined : {
        question: string(o.opening?.question, 'opening.question'), answer: string(o.opening?.answer, 'opening.answer')
      }
      const questions = [practice, ...(practiceExtras ?? []), ...checks, ...(reviewChecks ?? [])].map(a => a.question.trim().replace(/\s+/g, ' ').toLowerCase())
      expect(new Set(questions).size === questions.length, 'distinct practice and check variants')
      return { id: objectiveId, goal: string(o.goal, 'goal', 400), evidence: string(o.evidence, 'evidence'),
        source: string(o.source, 'source'), explanation: string(o.explanation, 'explanation', 8000),
        example: string(o.example, 'example', 8000), practice, checks, ...(opening && { opening }), ...(reviewChecks && { reviewChecks }),
        ...(practiceExtras && { practiceExtras, selfCheckSize }) }
    })
  }))
  const reviewCards = list(v.reviewCards ?? [], 'reviewCards', 0, 500).map(c => {
    expect(objectives.has(c?.objectiveId), 'reviewCards.objectiveId')
    return { id: id(c.id, seen, 'reviewCard.id'), objectiveId: c.objectiveId,
      front: string(c.front, 'front'), back: string(c.back, 'back') }
  })
  return { format: v.format, schemaVersion: 1, id: id(v.id, new Set(), 'id'), version: number(v.version, 'version', 1),
    title: string(v.title, 'title', 120), chapters, reviewCards }
}
export const pathKey = p => p.id + '@' + p.version
export function freshStep() {
  return { phase: 'lesson', variant: 0, help: 'none', outcome: 'open', mode: 'local', prose: '', feedback: '' }
}
export function freshProgress() {
  return { ...freshStep(), passed: [], attempt: 0, transferred: [], practiceOnly: [] }
}
export function currentObjective(goals, { activeObjectiveId, passed }) {
  return activeObjectiveId === undefined ? goals.find(goal => !passed.includes(goal.id)) : goals.find(goal => goal.id === activeObjectiveId)
}
export function practiceCases(goal) {
  return [goal.practice, ...(goal.practiceExtras ?? [])]
}
export function selfCheckRequired(size) {
  return Math.ceil(size * 4 / 5)
}
export function selfCheckScore(round) {
  return round.answers.filter(answer => !answer.assisted && answer.verdict === 'correct').length
}
export function stepActivity(goal, phase, variant) {
  if (phase === 'practice' && goal) return goal.practiceExtras ? practiceCases(goal)[variant] : goal.practice
  if (phase === 'check') return goal?.checks[variant]
}
function draft(v, task, construct) {
  object(v, 'draft')
  const text = s => string(s, 'draft text', 20000, true)
  const members = (values, allowed) => {
    list(values, 'draft ids', 0, allowed.length)
    expect(values.every(x => allowed.includes(x)) && new Set(values).size === values.length, 'draft ids')
    return [...values]
  }
  if (task?.kind === 'calculation') {
    if (v.kind === 'text' && ['number','fraction'].includes(task.answer.kind)) return { kind: v.kind, value: text(v.value) }
    if (v.kind === 'fraction' && task.answer.kind === 'fraction') return { kind: v.kind, numerator: text(v.numerator), denominator: text(v.denominator) }
    if (v.kind === 'quantity' && task.answer.kind === 'quantity') return { kind: v.kind, value: text(v.value), unit: text(v.unit) }
  }
  if (task?.kind === 'true_false' && v.kind === 'boolean' && [true,false,null].includes(v.value)) return { kind: v.kind, value: v.value }
  if (['single_choice','multiple_choice'].includes(task?.kind) && v.kind === 'selection') return { kind: v.kind, ids: members(v.ids, task.options.map(i => i.id)) }
  if (task?.kind === 'ordering' && v.kind === 'order') {
    const ids = members(v.ids, task.correctOrder)
    expect(construct || ids.length === task.correctOrder.length, 'draft order')
    return { kind: v.kind, ids }
  }
  if (['cloze','matching'].includes(task?.kind) && v.kind === 'fields') {
    const allowed = (task.gaps ?? task.pairs).map(i => i.id)
    const entries = Object.entries(object(v.values, 'draft fields'))
    members(entries.map(([k]) => k), allowed)
    return { kind: v.kind, values: Object.fromEntries(entries.map(([k,s]) => [k,text(s)])) }
  }
  expect(false, 'draft kind')
}
export function normalizePathDraft({ content, progress: p }, value) {
  object(value, 'draft')
  const goal = currentObjective(content.chapters.flatMap(c => c.objectives), p)
  const activity = stepActivity(goal, p.phase, p.variant)
  expect(activity && p.outcome === 'open', 'draft activity')
  return { prose: string(value.prose, 'prose', 4000, true),
    draft: draft(value.draft, activity.task, p.orderingInput === 'construct') }
}
export function normalizeReviewDraft(row, value) {
  const session = row.progress.reviewSession
  expect(session?.outcome === 'open', 'review draft')
  const goal = row.content.chapters.flatMap(c => c.objectives).find(g => g.id === session.queue[0])
  const activity = [...goal.checks, ...(goal.reviewChecks ?? [])].find(a => a.id === session.activityId)
  return draft(value, activity.task, true)
}
function practiceActivities(goals, passed) {
  const completed = new Set(passed)
  const activities = new Map()
  for (const goal of goals) {
    if (!completed.has(goal.id)) continue
    for (const activity of practiceCases(goal)) activities.set(activity.id, { activity, construct: false })
    for (const check of goal.checks) activities.set(check.id, { activity: check, construct: true })
  }
  return activities
}
function practiceDraft(activities, activityId, value) {
  const match = activities.get(activityId)
  expect(match, 'practiceDrafts.activityId')
  return draft(value, match.activity.task, match.construct)
}
export function normalizePracticeDraft({ content, progress }, activityId, value) {
  return practiceDraft(practiceActivities(content.chapters.flatMap(c => c.objectives), progress.passed), activityId, value)
}
function reviewProgress(v, goals, passed) {
  const result = {}
  const goalById = new Map(goals.map(g => [g.id, g]))
  const date = (value, field) => {
    expect(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(value).toJSON()?.slice(0, 10) === value, field)
    return value
  }
  const caseTypes = ['new', 'repeat', 'lesson']
  if (v.reviews !== undefined) {
    const records = list(v.reviews, 'reviews', 0, passed.length)
    members(records.map(r => r?.objectiveId), passed, 'reviews.objectiveId')
    result.reviews = records.map(r => {
      const goal = goalById.get(r.objectiveId)
      const seen = members(r.seen, [...goal.checks, ...(goal.reviewChecks ?? [])].map(a => a.id), 'reviews.seen')
      const row = { objectiveId: goal.id, dueDate: date(r.dueDate, 'reviews.dueDate'), seen }
      if (r.exposureKnown !== undefined) {
        expect(typeof r.exposureKnown === 'boolean', 'reviews.exposureKnown')
        row.exposureKnown = r.exposureKnown
      }
      if (r.learnedOn !== undefined) row.learnedOn = date(r.learnedOn, 'reviews.learnedOn')
      if (r.lastReview !== undefined) {
        row.lastReview = date(r.lastReview, 'reviews.lastReview')
        row.lastResult = choice(r.lastResult, 'reviews.lastResult', ['independent', 'missed', 'assisted'])
        row.lastCase = choice(r.lastCase, 'reviews.lastCase', caseTypes)
        if (r.gapDays !== undefined) row.gapDays = number(r.gapDays, 'reviews.gapDays')
        for (const [field, min, max] of [['stability', 0.1, 365000], ['difficulty', 1, 10]]) {
          expect(Number.isFinite(r[field]) && r[field] >= min && r[field] <= max, 'reviews.' + field)
          row[field] = r[field]
        }
        row.repetitions = number(r.repetitions, 'reviews.repetitions')
      }
      return row
    })
  }
  if (v.reviewSession !== undefined) {
    const session = object(v.reviewSession, 'reviewSession')
    const queue = members(session.queue, passed, 'reviewSession.queue', 1, 3)
    const goal = goalById.get(queue[0])
    const activity = [...goal.checks, ...(goal.reviewChecks ?? [])].find(a => a.id === session.activityId)
    expect(activity && result.reviews?.some(r => r.objectiveId === goal.id && r.seen.includes(activity.id)), 'reviewSession.activity')
    expect(typeof session.assisted === 'boolean' && typeof session.retry === 'boolean', 'reviewSession flags')
    result.reviewSession = { queue, activityId: activity.id, draft: draft(session.draft, activity.task, true),
      assisted: session.assisted, retry: session.retry, outcome: choice(session.outcome, 'reviewSession.outcome', ['open','correct','incorrect']),
      caseType: choice(session.caseType, 'reviewSession.caseType', caseTypes) }
    if (session.revealed !== undefined) {
      expect(session.revealed === true && session.assisted && session.outcome === 'incorrect', 'reviewSession.revealed')
      result.reviewSession.revealed = true
    }
  }
  return result
}
function answerResult(value, activity, construct) {
  const v = object(value, 'answer result')
  expect(activity && v.activityId === activity.id && typeof v.assisted === 'boolean', 'answer result activity')
  const verdict = choice(v.verdict, 'answer verdict', ['correct','partial','incorrect','revealed'])
  expect(verdict !== 'revealed' || v.assisted, 'revealed answer')
  const result = { activityId: activity.id, verdict, assisted: v.assisted }
  if (v.prose !== undefined) {
    expect(activity.written && v.response === undefined, 'written answer result')
    result.prose = string(v.prose, 'answer prose', 4000, verdict === 'revealed')
    if (verdict !== 'revealed') {
      const criteria = criterionResults(v.criteria, activity.written.criteria)
      expect(criteria, 'answer criteria')
      result.criteria = criteria
    }
  } else {
    expect(v.criteria === undefined, 'local answer criteria')
    if (v.response !== undefined) result.response = draft(v.response, activity.task, construct)
    else expect(verdict === 'revealed', 'answer result response')
  }
  return result
}
function selfCheckRound(value, goal) {
  const v = object(value, 'selfCheck')
  const size = goal?.selfCheckSize
  expect(size, 'selfCheck configured')
  const queue = members(v.queue, goal.checks.map(a => a.id), 'selfCheck.queue', size, size)
  const repeated = members(v.repeated, queue, 'selfCheck.repeated')
  const answers = list(v.answers, 'selfCheck.answers', 0, size).map((entry, index) =>
    answerResult(entry, goal.checks.find(a => a.id === queue[index]), true))
  return { queue, repeated, answers }
}
function studyStep(v, current) {
  object(v, 'study step')
  const phase = choice(v.phase, 'phase', ['lesson','practice','check'])
  const variant = number(v.variant, 'variant')
  const active = stepActivity(current, phase, variant)
  expect(phase === 'lesson' ? variant === 0 : !!active, 'activity')
  expect(!active || v.draft !== undefined, 'missing draft')
  const help = choice(v.help, 'help', ['none','hint','lesson','solution'])
  const outcome = choice(v.outcome, 'outcome', ['open','retry','next'])
  expect(outcome === 'open' || (outcome === 'next' ? phase === 'practice' : phase === 'check'), 'outcome')
  const orderingCheck = phase === 'check' && active?.task.kind === 'ordering'
  expect(v.orderingInput === undefined || (orderingCheck && v.orderingInput === 'construct'), 'ordering input')
  const construct = v.orderingInput === 'construct'
  const savedDraft = v.draft === undefined ? undefined : draft(v.draft, active?.task, construct)
  const resetOrder = orderingCheck && outcome === 'open' && !construct
  const mode = choice(v.mode, 'mode', ['local','written'])
  expect(mode === 'local' || active?.written, 'written mode')
  const seenChecks = v.seenChecks === undefined ? undefined : list(v.seenChecks, 'seenChecks', 0, current?.checks.length ?? 0)
  if (seenChecks) expect(new Set(seenChecks).size === seenChecks.length &&
    seenChecks.every(id => current?.checks.some(a => a.id === id)), 'seenChecks')
  const round = v.selfCheck === undefined ? undefined : selfCheckRound(v.selfCheck, current)
  if (round) {
    const index = round.answers.length - (outcome === 'open' ? 0 : 1)
    expect(phase === 'check' && active?.id === round.queue[index] && seenChecks?.includes(active.id), 'selfCheck position')
    expect(v.result === undefined, 'selfCheck answer result')
    expect(round.answers.length < round.queue.length || selfCheckScore(round) < selfCheckRequired(round.queue.length), 'selfCheck already passed')
  }
  expect(!current?.selfCheckSize || phase !== 'check' || round, 'selfCheck missing')
  const result = v.result === undefined ? undefined : answerResult(v.result, active, construct)
  let practiceAnswers
  if (current?.practiceExtras && phase !== 'lesson') {
    if (phase === 'practice' && outcome === 'next') {
      expect(result?.verdict === 'correct' || result?.verdict === 'revealed', 'completed practice result')
    }
    const cases = practiceCases(current)
    const size = phase === 'practice' ? variant : cases.length
    practiceAnswers = list(v.practiceAnswers ?? [], 'practiceAnswers', size, size)
      .map((entry, index) => {
        const answer = answerResult(entry, cases[index], false)
        expect(answer.verdict === 'correct' || answer.verdict === 'revealed', 'practiceAnswers verdict')
        return answer
      })
  }
  return { phase, variant, help, outcome, mode,
    prose: string(v.prose, 'prose', 4000, true), feedback: string(v.feedback, 'feedback', 8000, true),
    ...(seenChecks && { seenChecks: [...seenChecks] }),
    ...(construct || resetOrder ? { orderingInput: 'construct' } : {}),
    ...(savedDraft === undefined ? {} : { draft: resetOrder ? { kind: 'order', ids: [] } : savedDraft }),
    ...(round && { selfCheck: round }),
    ...(practiceAnswers?.length && { practiceAnswers }),
    ...(result && { result })
  }
}
function progress(v, content) {
  object(v, 'progress')
  const goals = content.chapters.flatMap(c => c.objectives)
  const passed = list(v.passed, 'passed', 0, goals.length)
  const goalById = new Map(goals.map(goal => [goal.id, goal]))
  expect(new Set(passed).size === passed.length && passed.every(id => goalById.has(id)), 'passed objectives')
  const current = currentObjective(goals, v)
  expect(v.activeObjectiveId === undefined || (current && !passed.includes(current.id)), 'activeObjectiveId')

  const transferred = list(v.transferred, 'transferred', 0, content.reviewCards.length)
  expect(new Set(transferred).size === transferred.length && transferred.every(x => content.reviewCards.some(c => c.id === x && passed.includes(c.objectiveId))), 'transferred')
  const practiceOnly = list(v.practiceOnly ?? [], 'practiceOnly', 0, goals.length * 8)
  const writtenIds = new Set(goals.flatMap(g => g.checks.filter(c => c.written).map(c => c.id)))
  expect(new Set(practiceOnly).size === practiceOnly.length && practiceOnly.every(id => writtenIds.has(id)), 'practiceOnly')
  const result = { ...studyStep(v, current), ...reviewProgress(v, goals, passed),
    passed: goals.filter(g => passed.includes(g.id)).map(g => g.id),
    attempt: number(v.attempt, 'attempt'), transferred: [...transferred], practiceOnly: [...practiceOnly]
  }
  if (v.activeObjectiveId !== undefined) result.activeObjectiveId = current.id
  if (v.pausedObjectives !== undefined) {
    const seen = new Set()
    result.pausedObjectives = list(v.pausedObjectives, 'pausedObjectives', 0, goals.length).map(entry => {
      const goal = goalById.get(entry?.objectiveId)
      expect(goal && goal !== current && !passed.includes(goal.id) && !seen.has(goal.id), 'pausedObjectives.objectiveId')
      seen.add(goal.id)
      return { objectiveId: goal.id, step: studyStep(entry.step, goal) }
    })
  }
  if (v.practiceDrafts !== undefined) {
    const activities = practiceActivities(goals, passed)
    const seen = new Set()
    result.practiceDrafts = list(v.practiceDrafts, 'practiceDrafts', 0, activities.size).map(entry => {
      const activityId = entry?.activityId
      expect(!seen.has(activityId), 'practiceDrafts.activityId')
      seen.add(activityId)
      return { activityId, draft: practiceDraft(activities, activityId, entry?.draft) }
    })
  }
  if (v.lastPass !== undefined) {
    const pass = v.lastPass
    expect(passed.includes(pass?.objectiveId), 'lastPass.objectiveId')
    const goal = goalById.get(pass.objectiveId)
    result.lastPass = { objectiveId: pass.objectiveId, feedback: string(pass.feedback, 'lastPass.feedback', 8000, true) }
    if (pass.result !== undefined) result.lastPass.result = answerResult(pass.result, goal.checks.find(a => a.id === pass.result?.activityId), true)
  }
  if (v.completedChecks !== undefined) {
    const entries = list(v.completedChecks, 'completedChecks', 0, passed.length)
    members(entries.map(entry => entry?.objectiveId), passed, 'completedChecks.objectiveId')
    result.completedChecks = entries.map(({ objectiveId, round: savedRound }) => {
      const round = selfCheckRound(savedRound, goalById.get(objectiveId))
      expect(round.answers.length === round.queue.length && selfCheckScore(round) >= selfCheckRequired(round.queue.length), 'completedChecks round')
      return { objectiveId, round }
    })
  }
  return result
}
export function normalizePaths(v) {
  const seen = new Set()
  return list(v,'learningPaths',0,100).map(row => {
    const content = normalizePath(row?.content)
    expect(!seen.has(pathKey(content)), 'duplicate path version')
    seen.add(pathKey(content))
    return {content, progress: progress(row.progress, content)}
  })
}
