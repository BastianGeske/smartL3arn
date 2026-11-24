import type { LearningPath } from '../../shared/learning-paths.mjs'
import type { TranslationKey } from '../i18n'

export function pathQuality(path: LearningPath) {
  return path.chapters.flatMap(c => c.objectives.flatMap(goal => {
    const keys: TranslationKey[] = []
    if (!goal.practiceExtras || !goal.selfCheckSize) keys.push('path.quality.legacy')
    if (!goal.reviewChecks?.length) keys.push('path.quality.transfer')
    if (!goal.checks.every(a => a.skillGroup)) keys.push('path.quality.skills')
    if (!goal.contrastGroup) keys.push('path.quality.contrast')
    if (goal.checks.some(a => a.written?.input === 'code' && !a.written.language)) keys.push('path.quality.language')
    return keys.map(key => ({ objectiveId: goal.id, goal: goal.goal, key }))
  }))
}
