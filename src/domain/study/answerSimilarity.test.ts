import { describe, expect, it } from 'vitest'
import {
  answerSimilarity,
  calibrationMatch,
  evaluationBand,
  localEvaluation,
  normalizeAnswer,
  similarityBand,
} from './answerSimilarity'

describe('answer similarity', () => {
  it('ignores casing, punctuation and diacritics', () => {
    expect(normalizeAnswer('  Héllo, WORLD! ')).toBe('hello world')
    expect(answerSimilarity('Héllo, world!', 'hello world')).toBe(1)
  })

  it('returns zero for an omitted answer', () => {
    expect(answerSimilarity('', 'correct')).toBe(0)
  })

  it('maps similarity thresholds to semantic verdicts', () => {
    expect(similarityBand(0.97).verdict).toBe('correct')
    expect(similarityBand(0.82).verdict).toBe('mostly_correct')
    expect(similarityBand(0.5).verdict).toBe('partially_correct')
    expect(similarityBand(0.49).verdict).toBe('incorrect')
  })

  it('turns a local comparison into the shared evaluation shape', () => {
    const evaluation = localEvaluation('Berlin', 'Berlin', 'Network unavailable')
    expect(evaluationBand(evaluation).label).toBe('Correct')
    expect(evaluation.source).toBe('local')
    expect(evaluation.localSimilarity).toBe(1)
    expect(evaluation.fallbackReason).toBe('Network unavailable')
  })

  it('calibrates confidence against semantic correctness', () => {
    expect(calibrationMatch('high', 'correct')).toBe(true)
    expect(calibrationMatch('high', 'mostly_correct')).toBe(false)
    expect(calibrationMatch('medium', 'partially_correct')).toBe(true)
    expect(calibrationMatch('low', 'incorrect')).toBe(true)
  })
})
