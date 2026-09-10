import type { ConfidenceLevel, Rating } from '../types'

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
  suggested: Rating
}

export function similarityBand(score: number): SimilarityBand {
  if (score >= 0.97) return { band: 'perfect', label: 'Perfect', suggested: 3 }
  if (score >= 0.82) return { band: 'close', label: 'Very close', suggested: 2 }
  if (score >= 0.5) return { band: 'partial', label: 'Partial match', suggested: 1 }
  return { band: 'wrong', label: 'Not quite', suggested: 0 }
}

export function calibrationMatch(
  level: ConfidenceLevel,
  score: number | null,
): boolean | null {
  if (score === null) return null
  if (level === 'high') return score >= 0.82
  if (level === 'medium') return score >= 0.5 && score < 0.97
  return score < 0.82
}
