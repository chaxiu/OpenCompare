import { describe, expect, it } from 'vitest'
import { diffLineTexts, diffLineTextsWithFacts } from './diff'
import { foldNewlines } from './normalize'
import type { ComparisonOptions, TextFacts } from './normalize'
import { probeTextBytes } from './probe'

const encoder = new TextEncoder()
const utf8 = (text: string): Uint8Array => encoder.encode(text)

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

/** UTF-16 code units in the requested endianness; no BOM is added. */
function utf16(text: string, endianness: 'le' | 'be'): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (endianness === 'le') bytes.push(code & 0xff, (code >> 8) & 0xff)
    else bytes.push((code >> 8) & 0xff, code & 0xff)
  }
  return Uint8Array.from(bytes)
}

const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf])
const UTF16LE_BOM = Uint8Array.from([0xff, 0xfe])
const UTF16BE_BOM = Uint8Array.from([0xfe, 0xff])
/** GBK for "中文": 中 = D6 D0, 文 = CE C4. */
const GBK_CJK = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4])
const LF = Uint8Array.from([0x0a])

const SAME_TEXT = '中文\n'

/** Probe facts exactly as `probeTextBytes` derives them from the same bytes. */
function factsOf(bytes: Uint8Array): TextFacts {
  const probe = probeTextBytes(bytes)
  return { text: probe.text, encoding: probe.encoding, sha256: probe.sha256 }
}

const UTF8_FACTS = factsOf(utf8(SAME_TEXT))
const UTF16LE_FACTS = factsOf(concat(UTF16LE_BOM, utf16(SAME_TEXT, 'le')))
const UTF8_BOM_FACTS = factsOf(concat(UTF8_BOM, utf8(SAME_TEXT)))
const GBK_FACTS = factsOf(concat(GBK_CJK, LF))

const ENCODING_PAIRS: readonly (readonly [string, TextFacts, TextFacts])[] = [
  ['UTF-8 vs UTF-16LE', UTF8_FACTS, UTF16LE_FACTS],
  ['UTF-8 vs UTF-8 BOM', UTF8_FACTS, UTF8_BOM_FACTS],
  ['UTF-8 vs GBK', UTF8_FACTS, GBK_FACTS]
]

const STRICT_NEWLINE_PAIRS: readonly (readonly [string, string, string])[] = [
  ['CRLF vs LF', 'a\r\nb', 'a\nb'],
  ['LF vs CR', 'a\nb', 'a\rb'],
  ['Mixed vs LF', 'a\r\nb\r', 'a\nb\n']
]

const COMBOS: readonly ComparisonOptions[] = [
  {},
  { ignoreNewline: false },
  { ignoreEncoding: false },
  { ignoreNewline: false, ignoreEncoding: false }
]

const REAL_DIFFS: readonly (readonly [string, string, string])[] = [
  ['character substitution', 'const value = 1\nnext', 'const value = 2\nnext'],
  ['trailing space', 'alpha\nbeta', 'alpha \nbeta'],
  ['case change', 'Const Name', 'const name'],
  ['line order swap', 'one\ntwo', 'two\none']
]

const REAL_DIFF_CASES: [string, string, string, ComparisonOptions][] = COMBOS.flatMap((options) =>
  REAL_DIFFS.map(([name, left, right]): [string, string, string, ComparisonOptions] => [
    name,
    left,
    right,
    options
  ])
)

describe('normalization switches', () => {
  it('ac-default-on: omitted, empty and explicit-true options return the same result', () => {
    const sample = ['alpha\r\nbeta', 'alpha\r\nbeta gamma ']
    const omitted = diffLineTexts(sample[0], sample[1])
    const empty = diffLineTexts(sample[0], sample[1], {})
    const explicit = diffLineTexts(sample[0], sample[1], {
      ignoreNewline: true,
      ignoreEncoding: true
    })

    expect(empty).toEqual(omitted)
    expect(explicit).toEqual(omitted)
    expect(omitted.normalization.ignoreNewline).toBe(true)
    expect(omitted.normalization.ignoreEncoding).toBe(true)
    expect(omitted.identical).toBe(false)
  })

  it('ac-fold-newline-styles: CRLF, LF and lone CR fold to the same two lines', () => {
    const crlf = 'a\r\nb'
    const lf = 'a\nb'
    const cr = 'a\rb'

    for (const [left, right] of [
      [crlf, lf],
      [lf, cr],
      [crlf, cr]
    ]) {
      const result = diffLineTexts(left, right)
      expect(result.identical).toBe(true)
      expect(result.differenceCount).toBe(0)
      expect(result.blocks).toHaveLength(0)
      expect(result.rows.map((row) => [row.leftText, row.rightText])).toEqual([
        ['a', 'a'],
        ['b', 'b']
      ])
    }

    expect(foldNewlines(crlf)).toBe(lf)
    // Folding only touches terminators: an inline space is still a difference.
    expect(diffLineTexts('a \r\nb', 'a\r\nb').identical).toBe(false)
  })

  it('ac-final-newline-kept: a missing final newline still differs when enabled', () => {
    const result = diffLineTexts('a', 'a\n')
    expect(result.identical).toBe(false)
    expect(result.differenceCount).toBeGreaterThanOrEqual(1)
    expect(result.blocks.length).toBeGreaterThanOrEqual(1)
  })

  it.each(STRICT_NEWLINE_PAIRS)(
    'ac-strict-newline: %s reports a block with terminal-free rows',
    (_name, left, right) => {
      const result = diffLineTexts(left, right, { ignoreNewline: false })

      expect(result.identical).toBe(false)
      expect(result.differenceCount).toBeGreaterThanOrEqual(1)
      expect(result.blocks.length).toBeGreaterThanOrEqual(1)
      expect(result.rows.some((row) => row.status !== 'same')).toBe(true)
      expect(result.normalization.newline.different).toBe(true)
      expect(result.normalization.newline.ignored).toBe(false)
      for (const row of result.rows) {
        expect(row.leftText ?? '').not.toMatch(/[\r\n]/)
        expect(row.rightText ?? '').not.toMatch(/[\r\n]/)
      }
    }
  )

  it.each(ENCODING_PAIRS)(
    'ac-encoding-on: %s is identical while encoding is ignored',
    (_name, left, right) => {
      const result = diffLineTextsWithFacts(left, right)

      expect(result.identical).toBe(true)
      expect(result.differenceCount).toBe(0)
      expect(result.blocks).toHaveLength(0)
      expect(result.normalization.encoding.comparable).toBe(true)
      expect(result.normalization.encoding.byteDifference).toBe(false)
      expect(result.normalization.encoding.different).toBe(true)
      expect(result.normalization.encoding.ignored).toBe(true)
    }
  )

  it.each(ENCODING_PAIRS)(
    'ac-strict-encoding-signal: %s is a visible byte difference',
    (_name, left, right) => {
      const result = diffLineTextsWithFacts(left, right, { ignoreEncoding: false })

      expect(result.identical).toBe(false)
      expect(result.differenceCount).toBe(1)
      expect(result.blocks).toHaveLength(0)
      expect(result.normalization.encoding.byteDifference).toBe(true)
      expect(result.normalization.encoding.different).toBe(true)
      expect(result.normalization.encoding.ignored).toBe(false)
      expect(result.normalization.encoding.left).toBe('UTF-8')
    }
  )

  it('ac-newline-byte-not-resurrected: strict encoding never re-reports a newline byte difference', () => {
    const left = factsOf(utf8('a\r\nb'))
    const right = factsOf(utf8('a\nb'))
    const result = diffLineTextsWithFacts(left, right, { ignoreNewline: true, ignoreEncoding: false })

    expect(left.sha256).not.toBe(right.sha256)
    expect(result.identical).toBe(true)
    expect(result.differenceCount).toBe(0)
    expect(result.normalization.encoding.byteDifference).toBe(false)
  })

  it('ac-no-facts-safe: strict encoding without facts stays text-only', () => {
    const result = diffLineTexts('a\nb', 'a\nc', { ignoreEncoding: false })
    expect(result.identical).toBe(false)
    expect(result.differenceCount).toBeGreaterThanOrEqual(1)
    expect(result.normalization.encoding.comparable).toBe(false)
    expect(result.normalization.encoding.byteDifference).toBe(false)
    expect(result.normalization.encoding.left).toBeNull()
    expect(result.normalization.encoding.right).toBeNull()

    const same = diffLineTexts('a\nb', 'a\nb', { ignoreEncoding: false })
    expect(same.identical).toBe(true)
    expect(same.differenceCount).toBe(0)
  })

  it.each(REAL_DIFF_CASES)(
    'ac-real-diff-all-combos: %s still reports a difference',
    (_name, left, right, options) => {
      const result = diffLineTexts(left, right, options)

      expect(result.identical).toBe(false)
      expect(result.differenceCount).toBeGreaterThanOrEqual(1)
      expect(result.blocks.length).toBeGreaterThanOrEqual(1)
      expect(result.rows.some((row) => row.status !== 'same')).toBe(true)
    }
  )
})

describe('normalization facts', () => {
  it('ac-count-single-source: one total drives identical in every mode', () => {
    const text = diffLineTexts('alpha\nbeta', 'alpha\ngamma')
    expect(text.differenceCount).toBe(text.blocks.length)
    expect(text.identical).toBe(text.differenceCount === 0)

    const bytes = diffLineTextsWithFacts(UTF8_FACTS, UTF8_BOM_FACTS, { ignoreEncoding: false })
    expect(bytes.blocks).toHaveLength(0)
    expect(bytes.blocks.length + 1).toBe(bytes.differenceCount)
    expect(bytes.identical).toBe(bytes.differenceCount === 0)

    const same = diffLineTexts('alpha', 'alpha')
    expect(same.differenceCount).toBe(0)
    expect(same.identical).toBe(true)
  })

  it('ac-signal-labels: labels stay inside the probe vocabulary', () => {
    const newlineKinds = ['CRLF', 'LF', 'CR', 'Mixed', 'None']
    const encodingLabels = ['UTF-8', 'UTF-8 BOM', 'UTF-16LE', 'UTF-16BE', 'GBK', 'Unknown']

    const textResult = diffLineTexts('a\r\nb\r', 'a\nb')
    expect(newlineKinds).toContain(textResult.normalization.newline.left)
    expect(newlineKinds).toContain(textResult.normalization.newline.right)
    expect(textResult.normalization.newline.left).toBe('Mixed')
    expect(textResult.normalization.encoding.left).toBeNull()
    expect(textResult.normalization.encoding.right).toBeNull()

    const utf16be = factsOf(concat(UTF16BE_BOM, utf16('ab', 'be')))
    const factsResult = diffLineTextsWithFacts(factsOf(utf8('ab')), utf16be)
    expect(encodingLabels).toContain(factsResult.normalization.encoding.left)
    expect(encodingLabels).toContain(factsResult.normalization.encoding.right)
    expect(factsResult.normalization.encoding.left).toBe('UTF-8')
    expect(factsResult.normalization.encoding.right).toBe('UTF-16BE')
  })

  it('ac-no-mutation: comparison leaves texts and facts untouched', () => {
    const left = factsOf(utf8('alpha\r\nbeta'))
    const right = factsOf(concat(UTF8_BOM, utf8('alpha\nbeta')))
    const snapshot = JSON.stringify({ left, right })

    diffLineTextsWithFacts(left, right, { ignoreNewline: false, ignoreEncoding: false })

    expect(JSON.stringify({ left, right })).toBe(snapshot)
  })
})
