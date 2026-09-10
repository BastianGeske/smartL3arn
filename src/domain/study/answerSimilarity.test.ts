import { describe, expect, it } from 'vitest'
import {
  answerSimilarity,
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

  it('maps similarity thresholds to the intended rating suggestion', () => {
    expect(similarityBand(0.97).suggested).toBe(3)
    expect(similarityBand(0.82).suggested).toBe(2)
    expect(similarityBand(0.5).suggested).toBe(1)
    expect(similarityBand(0.49).suggested).toBe(0)
  })
})
