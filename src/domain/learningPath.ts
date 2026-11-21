import { criterionResults } from '../../shared/rubric.mjs'
import { todayStr, addDaysToIsoDate } from './dates'
import { t } from '../i18n'
import { currentObjective, freshStep, practiceCases, selfCheckRequired, selfCheckScore, stepActivity,
  type Activity, type Objective, type ObjectiveStep, type PathAnswerResult, type Progress, type SavedPath, type SelfCheckRound,
} from '../../shared/learning-paths.mjs'
import { localPathResult } from './pathFeedback'
import { initialResponse } from './tasks'
import type { StudyResponse } from './types'

export function position({ content, progress }: SavedPath) {
  const goals = content.chapters.flatMap(chapter => chapter.objectives)
  const goal = currentObjective(goals, progress)
  const chapter = goal && content.chapters.find(c => c.objectives.some(o => o.id === goal.id))
  const activity = stepActivity(goal, progress.phase, progress.variant)
  return { goal, chapter, activity, total: goals.length }
}

export function attemptKey(row: SavedPath): string {
  const { goal, activity } = position(row)
  return JSON.stringify([row.content.id, row.content.version, goal?.id, activity?.id, row.progress.attempt])
}

function moveToStep(progress: Progress, step: ObjectiveStep): Progress {
  const next = { ...progress }
  delete next.draft
  delete next.orderingInput
  delete next.seenChecks
  delete next.result
  delete next.selfCheck
  delete next.practiceAnswers
  delete next.lastPass
  return { ...next, ...step, attempt: progress.attempt + 1 }
}

function snapshotStep(p: Progress): ObjectiveStep {
  const { phase, variant, help, outcome, mode, prose, feedback, draft, orderingInput, seenChecks, result, selfCheck, practiceAnswers } = p
  return { phase, variant, help, outcome, mode, prose, feedback,
    ...(draft && { draft }), ...(orderingInput && { orderingInput }), ...(seenChecks && { seenChecks }),
    ...(result && { result }), ...(selfCheck && { selfCheck }), ...(practiceAnswers && { practiceAnswers }) }
}

function resumeObjective(progress: Progress, objectiveId?: string, paused = progress.pausedObjectives ?? []): Progress {
  const saved = paused.find(entry => entry.objectiveId === objectiveId)
  const next = moveToStep(progress, saved?.step ?? freshStep())
  next.pausedObjectives = paused.filter(entry => entry.objectiveId !== objectiveId)
  if (objectiveId) next.activeObjectiveId = objectiveId
  else delete next.activeObjectiveId
  return next
}

export function switchObjective(row: SavedPath, objectiveId: string): Progress {
  const p = row.progress
  const current = position(row).goal
  if (current?.id === objectiveId || p.passed.includes(objectiveId)
    || !row.content.chapters.some(chapter => chapter.objectives.some(goal => goal.id === objectiveId))) return p
  const paused = [...(p.pausedObjectives ?? [])]
  if (current) paused.push({ objectiveId: current.id, step: snapshotStep(p) })
  return resumeObjective(p, objectiveId, paused)
}

function begin(progress: Progress, phase: Progress['phase'], activity?: Activity, variant = 0): Progress {
  const construct = phase === 'check' && activity?.task.kind === 'ordering'
  const trackCheck = phase === 'check' && activity && (progress.phase === 'practice' || progress.seenChecks)
  const seenChecks = trackCheck ? [...(progress.seenChecks ?? []).filter(id => id !== activity.id), activity.id] : undefined
  return moveToStep(progress, { ...freshStep(), phase, variant, ...(seenChecks && { seenChecks }),
    ...(progress.practiceAnswers && { practiceAnswers: progress.practiceAnswers }),
    ...(construct ? { orderingInput: 'construct', draft: { kind: 'order', ids: [] } }
      : activity ? { draft: initialResponse(activity.task) } : {}) })
}

export function completeOrderingCheck(row: SavedPath, answer: StudyResponse): boolean {
  const task = position(row).activity?.task
  if (row.progress.phase !== 'check' || task?.kind !== 'ordering') return true
  return row.progress.orderingInput === 'construct' && answer.kind === 'order'
    && answer.ids.length === task.items.length && new Set(answer.ids).size === task.items.length
    && task.items.every(item => answer.ids.includes(item.id))
}

function openRoundItem(p: Progress, goal: Objective, round: SelfCheckRound) {
  const variant = goal.checks.findIndex(activity => activity.id === round.queue[round.answers.length])
  return { ...begin(p, 'check', goal.checks[variant], variant), selfCheck: round }
}
function startRound(p: Progress, goal: Objective) {
  // Negative index means unseen. Stable sort keeps author order for unseen cases.
  const seen = p.seenChecks ?? []
  const queue = goal.checks.map(activity => activity.id)
    .sort((a, b) => seen.indexOf(a) - seen.indexOf(b))
    .slice(0, goal.selfCheckSize!)
  return openRoundItem(p, goal, { queue, repeated: queue.filter(id => seen.includes(id)), answers: [] })
}
export function advance(row: SavedPath): Progress {
  const { goal } = position(row), p = row.progress
  if (!goal) return p
  if (p.phase === 'lesson') return begin(p, 'practice', goal.practice)
  if (p.phase === 'practice' && p.outcome === 'next') {
    const completed = goal.practiceExtras && p.result ? { ...p, practiceAnswers: [...(p.practiceAnswers ?? []), p.result] } : p
    const nextPractice = practiceCases(goal)[p.variant + 1]
    if (nextPractice) return begin(completed, 'practice', nextPractice, p.variant + 1)
    return goal.selfCheckSize ? startRound(completed, goal) : begin(completed, 'check', goal.checks[0])
  }
  if (p.phase === 'check' && p.outcome === 'retry') {
    if (p.selfCheck) return p.selfCheck.answers.length < p.selfCheck.queue.length
      ? openRoundItem(p, goal, p.selfCheck) : startRound(p, goal)
    const variant = (p.variant + 1) % goal.checks.length
    return begin(p, 'check', goal.checks[variant], variant)
  }
  return p
}

export function assist(row: SavedPath, help: Exclude<Progress['help'], 'none'>): Progress {
  const { activity, goal } = position(row), p = row.progress
  if (!activity || p.outcome !== 'open') return p
  if (help === 'solution' && p.phase === 'practice' && goal?.practiceExtras && !p.result) return p
  if (help === 'solution' && (p.selfCheck || p.result)) {
    const revealed: PathAnswerResult = { activityId: activity.id, verdict: 'revealed', assisted: true,
      ...(p.mode === 'written' ? { prose: p.prose } : { response: p.result?.response ?? (p.phase === 'check' ? p.draft : undefined) }) }
    const updated = { ...p, help, attempt: p.attempt + 1 }
    return graded({ ...row, progress: updated }, revealed, '')
  }
  return { ...p, help, attempt: p.attempt + 1, feedback: '',
    outcome: help !== 'solution' ? 'open' : p.phase === 'practice' ? 'next' : 'retry' }
}

function passObjective(row: SavedPath, evidence: Omit<NonNullable<Progress['lastPass']>, 'objectiveId'>, selfCheck?: SelfCheckRound): Progress {
  const p = row.progress
  const { goal, activity } = position(row)
  const objectiveId = goal!.id
  const goals = row.content.chapters.flatMap(chapter => chapter.objectives)
  const passed = goals.filter(g => g.id === objectiveId || p.passed.includes(g.id)).map(g => g.id)
  const index = goals.findIndex(g => g.id === objectiveId)
  const nextGoal = [...goals.slice(index + 1), ...goals.slice(0, index)].find(g => !passed.includes(g.id))
  const next = resumeObjective({ ...p, passed }, nextGoal?.id)
  const today = todayStr()
  next.reviews = [...(p.reviews ?? []), { objectiveId, learnedOn: today,
    dueDate: addDaysToIsoDate(today, 1), exposureKnown: !!p.seenChecks,
    seen: [...new Set([...(p.seenChecks ?? []), activity!.id])] }]
  if (selfCheck) next.completedChecks = [...(p.completedChecks ?? []), { objectiveId, round: selfCheck }]
  return { ...next, lastPass: { objectiveId, ...evidence } }
}
function graded(row: SavedPath, result: PathAnswerResult, feedback: string): Progress {
  const p = row.progress
  const correct = result.verdict === 'correct'
  if (p.selfCheck) {
    const round = { ...p.selfCheck, answers: [...p.selfCheck.answers, result] }
    if (round.answers.length === round.queue.length && selfCheckScore(round) >= selfCheckRequired(round.queue.length)) {
      return passObjective(row, { feedback: '' }, round)
    }
    return { ...p, selfCheck: round, outcome: 'retry', feedback: '' }
  }
  if (p.phase === 'check' && correct && !result.assisted) return passObjective(row, { feedback, result })
  return { ...p, result, feedback: t(correct ? 'path.correct' : 'path.incomplete') + '\n' + feedback,
    outcome: p.phase === 'check' ? 'retry' : correct || result.verdict === 'revealed' ? 'next' : 'open' }
}

export function gradeLocal(row: SavedPath, answer: StudyResponse): Progress {
  const { activity } = position(row), p = row.progress
  if (!activity || p.mode !== 'local' || p.outcome !== 'open' || !completeOrderingCheck(row, answer)) return p
  const result = localPathResult(activity, answer, p.help !== 'none')
  return graded({ ...row, progress: { ...p, draft: answer } }, result, result.verdict === 'correct' ? activity.solution : activity.feedback)
}

const latexTextCommands = new Set([
  '\\text', '\\textnormal', '\\textrm', '\\textsf', '\\texttt', '\\textup', '\\textmd',
  '\\textbf', '\\textit', '\\textsl', '\\textsc', '\\emph', '\\mbox', '\\hbox',
  '\\operatorname', '\\tag', '\\url', '\\href',
])
const latexLiteralCommands = new Set(['\\verb', '\\Verb', '\\def', '\\gdef', '\\edef', '\\xdef', '\\newcommand', '\\renewcommand'])

function canonicalFormula(source: string): string {
  const formula = source.trim()
  const literal = () => JSON.stringify(formula)
  if (/^[a-zA-Z0-9.()\s=+\-*/^<>]+$/u.test(formula)) {
    return JSON.stringify(formula.replace(/\s*([=+\-*/^<>])\s*/gu, '$1'))
  }
  // Keep TeX control sequences as separate tokens so \alpha x cannot become \alphax.
  const tokens = formula.match(/\\(?:[a-zA-Z]+|[^\r\n])|[ \t\r\n]+|./gsu) ?? []
  const normalized: string[] = []
  const whitespace = (token: string) => /^[ \t\r\n]+$/.test(token)
  let depth = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (whitespace(token)) continue
    if (token === '%' || token === '\\' || latexLiteralCommands.has(token)) return literal()
    normalized.push(token)
    if (token === '{') depth++
    if (token === '}') {
      depth--
      if (depth < 0) return literal()
    }
    if (latexTextCommands.has(token)) {
      while (i + 1 < tokens.length && whitespace(tokens[i + 1]!)) i++
      if ((token === '\\operatorname' || token === '\\tag') && tokens[i + 1] === '*') {
        normalized.push(tokens[++i]!)
        while (i + 1 < tokens.length && whitespace(tokens[i + 1]!)) i++
      }
      const start = ++i
      if (tokens[start] !== '{') return literal()
      let groupDepth = 1
      while (groupDepth && ++i < tokens.length) {
        if (tokens[i] === '%') return literal()
        if (tokens[i] === '{') groupDepth++
        if (tokens[i] === '}') groupDepth--
      }
      if (groupDepth) return literal()
      normalized.push(tokens.slice(start, i + 1).join(''))
    } else if (token === '"') {
      const start = i + 1
      while (++i < tokens.length && tokens[i] !== '"') { /* Preserve quoted content verbatim. */ }
      if (i === tokens.length) return literal()
      normalized.push(tokens.slice(start, i + 1).join(''))
    }
  }
  return depth ? literal() : JSON.stringify(normalized)
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
  const canonical = (text: string) => {
    if (written.input === 'code') return text.replace(/\r\n?/g, '\n').replace(/(?:\n[ \t]*)+$/, '')
    if (written.input === 'formula') return canonicalFormula(text)
    return text.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()
  }
  const comparison = canonical(submitted)
  const knownWrong = [written.partial, written.misconception].some(s => canonical(s) === comparison)
  if (written.practiceOnly || p.practiceOnly.includes(activityId) || (correct && knownWrong)) {
    if (p.selfCheck) return { ...p, mode: 'local', attempt: p.attempt + 1, feedback: t('path.unreliable'),
      practiceOnly: [...new Set([...p.practiceOnly, activityId])] }
    return { ...p, outcome: 'retry', feedback: t('path.unreliable'),
      practiceOnly: [...new Set([...p.practiceOnly, activityId])] }
  }
  return graded(row, { activityId, prose: submitted, criteria: checked, assisted: p.help !== 'none',
    verdict: correct ? 'correct' : checked.some(r => r.status === 'satisfied') ? 'partial' : 'incorrect' }, feedback)
}
