import { normalizeTask } from './tasks.mjs'

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
      const questions = [practice, ...checks].map(a => a.question.trim().replace(/\s+/g, ' ').toLowerCase())
      expect(new Set(questions).size === questions.length, 'distinct practice and check variants')
      return { id: objectiveId, goal: string(o.goal, 'goal', 400), evidence: string(o.evidence, 'evidence'),
        source: string(o.source, 'source'), explanation: string(o.explanation, 'explanation', 8000),
        example: string(o.example, 'example', 8000), practice, checks }
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
export function freshProgress() {
  return { passed: [], phase: 'lesson', variant: 0, attempt: 0, help: 'none', outcome: 'open', mode: 'local',
    prose: '', feedback: '', transferred: [], practiceOnly: [] }
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
  const goal = content.chapters.flatMap(c => c.objectives)[p.passed.length]
  const activity = p.phase === 'practice' ? goal?.practice : p.phase === 'check' ? goal?.checks[p.variant] : undefined
  expect(activity && p.outcome === 'open', 'draft activity')
  return { prose: string(value.prose, 'prose', 4000, true),
    draft: draft(value.draft, activity.task, p.orderingInput === 'construct') }
}
function progress(v, content) {
  object(v, 'progress')
  const goals = content.chapters.flatMap(c => c.objectives)
  const passed = list(v.passed, 'passed', 0, goals.length)
  expect(passed.every((x,i) => x === goals[i].id), 'passed objectives')
  const current = goals[passed.length]
  const phase = choice(v.phase, 'phase', ['lesson','practice','check'])
  const variant = number(v.variant, 'variant')
  const active = phase === 'check' ? current?.checks[variant] : phase === 'practice' ? current?.practice : undefined
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
  const transferred = list(v.transferred, 'transferred', 0, content.reviewCards.length)
  expect(new Set(transferred).size === transferred.length && transferred.every(x => content.reviewCards.some(c => c.id === x && passed.includes(c.objectiveId))), 'transferred')
  const practiceOnly = list(v.practiceOnly ?? [], 'practiceOnly', 0, goals.length * 8)
  const writtenIds = new Set(goals.flatMap(g => g.checks.filter(c => c.written).map(c => c.id)))
  expect(new Set(practiceOnly).size === practiceOnly.length && practiceOnly.every(id => writtenIds.has(id)), 'practiceOnly')
  return { passed: [...passed], practiceOnly: [...practiceOnly], phase, variant, attempt: number(v.attempt,'attempt'), help, outcome, mode,
    prose: string(v.prose, 'prose', 4000, true), feedback: string(v.feedback, 'feedback', 8000, true), transferred: [...transferred],
    ...(construct || resetOrder ? {orderingInput: 'construct'} : {}),
    ...(savedDraft === undefined ? {} : {draft: resetOrder ? {kind: 'order', ids: []} : savedDraft}) }
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
