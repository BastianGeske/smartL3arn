import type { Activity, PathAnswerResult } from '../../shared/learning-paths.mjs'
import { evaluateResponse } from './tasks'
import type { StudyResponse } from './types'

export function localPathResult(activity: Activity, response: StudyResponse, assisted = false, revealed = false): PathAnswerResult {
  const verdict = revealed ? 'revealed' : evaluateResponse(activity, response)?.verdict
  return {
    activityId: activity.id, response, assisted: assisted || revealed,
    verdict: verdict === 'partially_correct' ? 'partial' : verdict === 'correct' || verdict === 'revealed' ? verdict : 'incorrect',
  }
}
