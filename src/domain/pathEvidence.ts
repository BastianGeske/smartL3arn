import type { Activity, Objective, PathAnswerResult, Progress } from '../../shared/learning-paths.mjs'
import { todayStr } from './dates'

export function recordContact(p: Progress, objectiveId: string, kind: NonNullable<Progress['contacts']>[number]['kind'], day = todayStr()): Progress {
  return { ...p, contacts: [...(p.contacts ?? []).filter(c => c.objectiveId !== objectiveId), { objectiveId, kind, day, at: Date.now() }] }
}
export function contactedToday(p: Progress, objectiveId: string, day = todayStr()) {
  // A future contact (clock or timezone change) is conservative evidence of contamination too.
  return !!p.contacts?.some(c => c.objectiveId === objectiveId && c.day >= day)
}
export function recordAttempt(p: Progress, goal: Objective, activity: Activity, result: PathAnswerResult,
  phase: 'practice' | 'check' | 'review', day = todayStr(), clearGap = false): Progress {
  const next = { ...p, attempts: [...(p.attempts ?? []), { objectiveId: goal.id, at: Date.now(), day, phase, attempt: p.attempt, result }] }
  if (phase !== 'practice') {
    const group = activity.skillGroup ?? activity.id
    const gaps = (p.gaps ?? []).filter(g => g.objectiveId !== goal.id || g.group !== group)
    if (result.verdict !== 'correct' || result.assisted) gaps.push({ objectiveId: goal.id, group })
    if (clearGap || result.verdict !== 'correct' || result.assisted) next.gaps = gaps
  }
  return next
}
export function correctionCases(goal: Objective, p: Progress) {
  const groups = new Set(p.gaps?.filter(g => g.objectiveId === goal.id).map(g => g.group))
  const seen = p.reviews?.find(r => r.objectiveId === goal.id)?.seen ?? p.seenChecks ?? []
  return goal.checks.filter(a => groups.has(a.skillGroup ?? a.id))
    .sort((a, b) => seen.indexOf(a.id) - seen.indexOf(b.id))
}
