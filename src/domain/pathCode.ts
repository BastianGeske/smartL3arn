import { criterionResults } from '../../shared/rubric.mjs'
import type { Progress, WrittenCheck } from '../../shared/learning-paths.mjs'

type Evaluate = NonNullable<NonNullable<Window['smartL3arn']>['evaluateCriteria']>
export const codeFingerprint = (written: WrittenCheck) => JSON.stringify([written.input ?? 'text', written.language ?? '', !!written.practiceOnly, written.question, written.reference, written.criteria.map(c => [c.id, c.description]), written.paraphrase, written.partial, written.misconception])
export function codeValidated(p: Progress, activityId: string, written: WrittenCheck, model: string) {
  return !!model && !written.practiceOnly && !p.practiceOnly.includes(activityId) && !!p.codeValidations?.some(v =>
    v.activityId === activityId && v.model === model && v.fingerprint === codeFingerprint(written))
}
export async function validateCodeRubric(evaluate: Evaluate, written: WrittenCheck, deckName: string, language: 'de' | 'en', active = () => true) {
  for (const [field, expected] of [['paraphrase', true], ['partial', false], ['misconception', false]] as const) {
    if (!active()) return false
    const response = await evaluate({ deckName, question: written.question, referenceAnswer: written.reference,
      userAnswer: written[field], criteria: written.criteria, language, answerFormat: 'code', codeLanguage: written.language })
    if (!active()) return false
    const checked = response.ok && criterionResults(response.result?.criteria, written.criteria)
    if (!checked || checked.some(r => r.status === 'unclear') || checked.every(r => r.status === 'satisfied') !== expected) return false
  }
  return true
}
