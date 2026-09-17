import { describe, expect, it } from 'vitest'
import { parseHexTokens } from './hexTokens'
import type { OcrWord } from './hexTokens'
import type { BlobCandidate } from './swatchBlobs'

function word(
  text: string,
  x0 = 0,
  y0 = 0,
  confidence = 90,
): OcrWord {
  return {
    text,
    confidence,
    bbox: { x0, y0, x1: x0 + 20, y1: y0 + 10 },
  }
}

describe('parseHexTokens', () => {
  it('accepts strict hash-prefixed six-digit hex', () => {
    expect(parseHexTokens([word('#A1b2C3')])).toEqual([
      {
        hex: '#a1b2c3',
        confidence: 90,
        repaired: false,
        bbox: { x0: 0, y0: 0, x1: 20, y1: 10 },
      },
    ])
  })

  it('accepts a bare hex near a blob and rejects one far away', () => {
    const blobs: BlobCandidate[] = [
      {
        hex: '#ff0000',
        area: 100,
        bbox: { x0: 0, y0: 0, x1: 20, y1: 20 },
      },
    ]

    expect(
      parseHexTokens(
        [word('101828', 25, 5), word('475467', 100, 100)],
        blobs,
      ).map((candidate) => candidate.hex),
    ).toEqual(['#101828'])
  })

  it('expands three-digit shorthand and flags it as repaired', () => {
    expect(parseHexTokens([word('#AbC')])[0]).toMatchObject({
      hex: '#aabbcc',
      repaired: true,
    })
  })

  it('repairs at most two ambiguous characters and lowers confidence', () => {
    const [candidate] = parseHexTokens([word('#1O1828', 0, 0, 87)])

    expect(candidate).toMatchObject({
      hex: '#101828',
      repaired: true,
    })
    expect(candidate.confidence).toBeLessThan(87)
    expect(parseHexTokens([word('#OOIS28')])).toEqual([])
  })

  it('does not repair a token without a hash prefix', () => {
    expect(parseHexTokens([word('1O1828')])).toEqual([])
  })

  it('deduplicates and preserves grouped reading order', () => {
    const candidates = parseHexTokens([
      word('#ffffff', 80, 30),
      word('#112233', 50, 10),
      word('#445566', 10, 12),
      word('#FFFFFF', 20, 50),
    ])

    expect(candidates.map((candidate) => candidate.hex)).toEqual([
      '#445566',
      '#112233',
      '#ffffff',
    ])
  })

  it('joins a split hash with the hex digits that follow it', () => {
    expect(parseHexTokens([word('#', 60, 40, 55), word('2F6BFF', 84, 40)])).toEqual([
      {
        hex: '#2f6bff',
        confidence: 90,
        repaired: false,
        bbox: { x0: 60, y0: 40, x1: 104, y1: 50 },
      },
    ])
  })

  it('joins a split hash with three-digit shorthand', () => {
    expect(parseHexTokens([word('#', 60, 40), word('ABC', 84, 40)])[0]).toMatchObject(
      { hex: '#aabbcc', repaired: true },
    )
  })

  it('leaves a hash joined to a non-hex word alone', () => {
    expect(parseHexTokens([word('#', 60, 40), word('hello', 84, 40)])).toEqual([])
  })

  it('does not join a hash the next word sits far away from', () => {
    // 20 px of clear space beside a 10 px-tall word is past the 1.5x reach.
    expect(parseHexTokens([word('#', 60, 40), word('2F6BFF', 100, 40)])).toEqual(
      [],
    )
  })

  it('does not join a hash to a word on another line', () => {
    expect(parseHexTokens([word('#', 60, 40), word('2F6BFF', 60, 60)])).toEqual(
      [],
    )
  })

  it('caps results at twelve candidates', () => {
    const words = Array.from({ length: 13 }, (_, index) =>
      word(`#${index.toString(16).padStart(6, '0')}`, 0, index * 20),
    )

    expect(parseHexTokens(words)).toHaveLength(12)
  })
})
