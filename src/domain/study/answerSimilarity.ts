import { t } from '../../i18n'
import type {
  AnswerEvaluation,
  AnswerVerdict,
  ConfidenceLevel,
} from '../types'

export function normalizeAnswer(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:!?'"()[\]{}\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1]
        : Math.min(
          previous[rightIndex - 1],
          previous[rightIndex],
          current[rightIndex - 1],
        ) + 1
    }
    previous = current
  }
  return previous[right.length]
}

export function answerSimilarity(typed: string, correct: string): number {
  const normalizedTyped = normalizeAnswer(typed)
  const normalizedCorrect = normalizeAnswer(correct)
  if (!normalizedTyped && !normalizedCorrect) return 1
  if (!normalizedTyped || !normalizedCorrect) return 0
  if (normalizedTyped === normalizedCorrect) return 1
  const maxLength = Math.max(normalizedTyped.length, normalizedCorrect.length)
  return Math.max(0, 1 - levenshtein(normalizedTyped, normalizedCorrect) / maxLength)
}

export interface SimilarityBand {
  band: 'perfect' | 'close' | 'partial' | 'wrong'
  label: string
  verdict: AnswerVerdict
}

export function similarityBand(score: number): SimilarityBand {
  if (score >= 0.97) return { band: 'perfect', label: t('verdict.correct'), verdict: 'correct' }
  if (score >= 0.82) return { band: 'close', label: t('verdict.mostly_correct'), verdict: 'mostly_correct' }
  if (score >= 0.5) return { band: 'partial', label: t('verdict.partially_correct'), verdict: 'partially_correct' }
  return { band: 'wrong', label: t('verdict.incorrect'), verdict: 'incorrect' }
}

export function localEvaluation(
  typed: string,
  correct: string,
  fallbackReason?: string,
): AnswerEvaluation {
  const score = answerSimilarity(typed, correct)
  const band = similarityBand(score)
  return {
    source: 'local',
    verdict: band.verdict,
    feedback: t(typed.trim() ? 'smart.localCompared' : 'smart.noAnswer'),
    localSimilarity: score,
    ...(fallbackReason ? { fallbackReason } : {}),
  }
}

export function evaluationBand(evaluation: AnswerEvaluation): SimilarityBand {
  const bands: Record<AnswerVerdict, SimilarityBand> = {
    correct: { band: 'perfect', label: t('verdict.correct'), verdict: 'correct' },
    mostly_correct: { band: 'close', label: t('verdict.mostly_correct'), verdict: 'mostly_correct' },
    partially_correct: { band: 'partial', label: t('verdict.partially_correct'), verdict: 'partially_correct' },
    incorrect: { band: 'wrong', label: t('verdict.incorrect'), verdict: 'incorrect' },
  }
  return bands[evaluation.verdict]
}

export function calibrationMatch(
  level: ConfidenceLevel,
  verdict: AnswerVerdict | null,
): boolean | null {
  if (verdict === null) return null
  if (level === 'high') return verdict === 'correct'
  if (level === 'medium') {
    return verdict === 'mostly_correct' || verdict === 'partially_correct'
  }
  return verdict === 'partially_correct' || verdict === 'incorrect'
}
