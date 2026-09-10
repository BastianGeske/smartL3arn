import { describe, expect, it } from 'vitest'
import { parseCards, parseCsvLine } from './importExport'

describe('card import', () => {
  it('parses quoted CSV fields and escaped quotes', () => {
    expect(parseCsvLine('"Hello, world","He said ""hi"""')).toEqual([
      'Hello, world',
      'He said "hi"',
    ])
  })

  it('parses tab-delimited cards and skips comments', () => {
    expect(parseCards('# Vocabulary\nHaus\thouse\nBaum\ttree')).toEqual([
      { front: 'Haus', back: 'house' },
      { front: 'Baum', back: 'tree' },
    ])
  })
})
