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

  it.each([
    ['3', '-3'],
    ['100', '101'],
    ['9007199254740992', '9007199254740993'],
    ['-123456789012345678901234567890', '123456789012345678901234567890'],
    ['0.000000000000000000001', '0.000000000000000000002'],
    ['--3', '-3'],
    ['1 5', '1.5'],
    ['3!', '3'],
  ])('marks different numerical values %s and %s as incorrect', (typed, correct) => {
    expect(answerSimilarity(typed, correct)).toBe(0)
    expect(localEvaluation(typed, correct).verdict).toBe('incorrect')
  })

  it.each([
    ['1,50', '1.5'], ['+003.00', '3'], ['\u22123', '-3'],
    ['-0,00', '+0'], ['-.50', '-0.5'], [' 42 ', '042.000'],
    ['9007199254740993.000', '9007199254740993'],
  ])('recognizes equivalent numerical values %s and %s', (typed, correct) => {
    expect(answerSimilarity(typed, correct)).toBe(1)
  })

  it('retains numerical minus signs in text while ignoring word hyphens', () => {
    expect(normalizeAnswer('Value: \u22123; long-term')).toBe('value -3 long term')
    expect(answerSimilarity('Value: 3', 'Value: -3')).toBeLessThan(1)
  })

  it('retains fuzzy matching for text answers', () => {
    expect(answerSimilarity('Berln', 'Berlin')).toBeGreaterThan(0.8)
    expect(answerSimilarity('Berln', 'Berlin')).toBeLessThan(1)
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
