import { describe, expect, it } from 'vitest'
import { createCard, deckToAnkiText, deckToCsv, parseCards, parseCsvLine } from './importExport'

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

  it.each([
    'Convert 6" to centimetres',
    'Explain the " symbol',
    'What does "" mean?',
    'Read "six inches" aloud',
    'Convert 6", then explain it',
    '"Six inches" includes a literal " symbol',
  ])('preserves literal quotes in a tab-delimited question: %s', (front) => {
    const back = '15.24 cm; the " symbol means inches'
    expect(parseCards(`\uFEFF# Ignore "comment\r\n\r\n${front}\t${back}\r\nNext\tAnswer`)).toEqual([
      { front, back },
      { front: 'Next', back: 'Answer' },
    ])
  })

  it('round-trips literal quotes from the Anki TXT exporter', () => {
    const cards = [
      createCard('Convert 6" to centimetres', '15.24 cm'),
      createCard('"Six inches" includes a literal " symbol', 'The " symbol means inches'),
    ]
    expect(parseCards(deckToAnkiText({ id: 'deck', name: 'Deck', cards }))).toEqual(
      cards.map(({ front, back }) => ({ front, back })),
    )
  })

  it.each(['\n', '\r\n', '\r'])('exports Anki TXT as one record per card with %j field line breaks', (newline) => {
    const cards = [createCard(`Convert 6"${newline}to centimetres`, 'Answer\twith <markup> & text')]
    const text = deckToAnkiText({ id: 'deck', name: 'Deck', cards })
    expect(text).toBe('Convert 6"<br>to centimetres\tAnswer with &lt;markup&gt; &amp; text')
    expect(parseCards(text)).toEqual([
      { front: 'Convert 6"<br>to centimetres', back: 'Answer with &lt;markup&gt; &amp; text' },
    ])
  })

  it('retains literal quotes within unquoted CSV fields', () => {
    const line = 'Convert 6" to centimetres,15.24 cm'
    expect(parseCsvLine(line)).toEqual(['Convert 6" to centimetres', '15.24 cm'])
    expect(parseCards(`${line}\nQuestion,The " symbol means inches`)).toEqual([
      { front: 'Convert 6" to centimetres', back: '15.24 cm' },
      { front: 'Question', back: 'The " symbol means inches' },
    ])
  })

  it.each(['\n', '\r\n', '\r'])('round-trips quoted multiline cards with %j line breaks', (newline) => {
    const cards = [
      createCard(`Line 1${newline}# inside the question${newline}${newline}Line 2`, `Answer, with "quotes"${newline}Second line`),
      createCard('# A question, not a comment', 'An answer\twith a tab'),
    ]
    expect(parseCards(deckToCsv({ id: 'deck', name: 'Deck', cards }))).toEqual(
      cards.map(({ front, back }) => ({ front, back })),
    )
  })

  it('ignores tabs inside quoted CSV fields when detecting the delimiter', () => {
    expect(parseCards('"Question\twith a tab","Answer"')).toEqual([
      { front: 'Question\twith a tab', back: 'Answer' },
    ])
  })

  it('ignores tabs and escaped quotes inside either quoted CSV field', () => {
    expect(parseCards(' Question, "An answer with ""quotes""\tand a tab"\n"A\tquestion with ""quotes""",Answer')).toEqual([
      { front: 'Question', back: 'An answer with "quotes"\tand a tab' },
      { front: 'A\tquestion with "quotes"', back: 'Answer' },
    ])
  })

  it('keeps a quoted field open when a CSV physical line ends in an escaped quote', () => {
    expect(parseCards('"A question with ""\n# literal quote",Answer')).toEqual([
      { front: 'A question with "\n# literal quote', back: 'Answer' },
    ])
  })

  it.each([',', '\t'])('recognizes only the first header, with delimiter %j', (delimiter) => {
    expect(parseCards(`\uFEFF# Comment with an unmatched "\r\n\r\n Front ${delimiter} BACK \r\nQuestion${delimiter}Answer\r\nfront${delimiter}back`)).toEqual([
      { front: 'Question', back: 'Answer' },
      { front: 'front', back: 'back' },
    ])
  })

  it('still accepts CSV without a header and with escaped quotes', () => {
    expect(parseCards('# Ignore "this comment\n\n"Hello, world","He said ""hi"""\n')).toEqual([
      { front: 'Hello, world', back: 'He said "hi"' },
    ])
  })

  it('rejects the entire CSV if a quoted field is incomplete', () => {
    expect(() => parseCards('front,back\nQuestion,Answer\n"Unclosed,answer')).toThrow(SyntaxError)
  })

  it('still rejects an unclosed quoted CSV field containing a tab', () => {
    expect(() => parseCards('Question,"Unclosed\tanswer')).toThrow(SyntaxError)
  })
})
