import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Bytes } from '../directory/hash'
import { decodeText, detectEncoding, detectNewline, probeTextBytes } from './probe'
import type { TextDecoderFactory } from './probe'

const encoder = new TextEncoder()
const utf8 = (text: string): Uint8Array => encoder.encode(text)
const bytesOf = (hex: string): Uint8Array =>
  Uint8Array.from(hex.trim().split(/\s+/).map((byte) => Number.parseInt(byte, 16)))

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

/** UTF-16 code units with the requested endianness; no BOM is added. */
function utf16(text: string, endianness: 'le' | 'be'): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (endianness === 'le') bytes.push(code & 0xff, (code >> 8) & 0xff)
    else bytes.push((code >> 8) & 0xff, code & 0xff)
  }
  return Uint8Array.from(bytes)
}

/** GBK for "中文\n": 中 = D6 D0, 文 = CE C4, LF = 0A. */
const GBK_CJK_LINE = bytesOf('D6 D0 CE C4 0A')

/** Independent SHA-256 via Node crypto, so the core digest is cross-checked. */
const nodeSha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

/** Every `gbk` request fails; every other decoder is the runtime one. */
const withoutGbkDecoder: TextDecoderFactory = (label) => {
  if (label === 'gbk') throw new Error('gbk decoder unavailable in this runtime')
  return new TextDecoder(label)
}

describe('detectNewline', () => {
  it.each([
    ['a\r\nb\r\n', 'CRLF'],
    ['\r\n', 'CRLF'],
    ['a\nb\n', 'LF'],
    ['a\rb\r', 'CR'],
    ['single line', 'None'],
    ['', 'None'],
    ['a\r\nb\nc', 'Mixed'],
    ['a\r\nb\rc', 'Mixed'],
    ['a\nb\rc', 'Mixed']
  ] as const)('%j is %s', (text, kind) => {
    expect(detectNewline(text)).toBe(kind)
  })
})

describe('detectEncoding / decodeText — BOM', () => {
  it.each([
    ['UTF-8 BOM', concat(bytesOf('EF BB BF'), utf8('hello')), 'hello'],
    ['UTF-16LE', concat(bytesOf('FF FE'), utf16('hi', 'le')), 'hi'],
    ['UTF-16BE', concat(bytesOf('FE FF'), utf16('hi', 'be')), 'hi']
  ] as const)('flags %s and strips the BOM', (encoding, bytes, text) => {
    expect(detectEncoding(bytes)).toBe(encoding)
    expect(decodeText(bytes)).toEqual({ text, encoding })
    expect(decodeText(bytes).text.startsWith('\ufeff')).toBe(false)
  })

  it('wins over every later heuristic, even when the body looks like GBK', () => {
    expect(detectEncoding(concat(bytesOf('EF BB BF'), GBK_CJK_LINE))).toBe('UTF-8 BOM')
    expect(detectEncoding(concat(bytesOf('FF FE'), utf16('hello', 'le')))).toBe('UTF-16LE')
  })
})

describe('detectEncoding / decodeText — BOM-less UTF-16', () => {
  it.each([
    ['UTF-16LE', utf16('hello', 'le')],
    ['UTF-16BE', utf16('hello', 'be')]
  ] as const)('detects %s from the NUL parity and decodes it', (encoding, bytes) => {
    expect(detectEncoding(bytes)).toBe(encoding)
    expect(decodeText(bytes).text).toBe('hello')
  })

  it('wins over the single-byte stream that also fits', () => {
    const bytes = bytesOf('68 00 65 00 6C 00 6C 00 6F 00')
    expect(detectEncoding(bytes)).toBe('UTF-16LE')
    expect(decodeText(bytes).text).toBe('hello')
  })

  it('does not guess when the NUL distribution is ambiguous', () => {
    expect(detectEncoding(Uint8Array.from([0x61, 0x00, 0x00, 0x62]))).toBe('UTF-8')
    const oddLength = Uint8Array.from([0x68, 0x00, 0x69])
    expect(detectEncoding(oddLength)).not.toBe('UTF-16LE')
    expect(detectEncoding(oddLength)).not.toBe('UTF-16BE')
  })
})

describe('detectEncoding / decodeText — strict UTF-8', () => {
  it('accepts multi-byte CJK and keeps the text identical', () => {
    expect(detectEncoding(utf8('中文\n'))).toBe('UTF-8')
    expect(decodeText(utf8('中文\n'))).toEqual({ text: '中文\n', encoding: 'UTF-8' })
  })

  it('decides UTF-8 before GBK when both shapes fit', () => {
    // E4 B8 AD E6 96 87 is also structurally valid GBK; the fixed order says UTF-8.
    const bytes = bytesOf('E4 B8 AD E6 96 87')
    expect(detectEncoding(bytes)).toBe('UTF-8')
    expect(decodeText(bytes).text).toBe('中文')
  })

  it('never reports invalid UTF-8 as UTF-8', () => {
    expect(detectEncoding(Uint8Array.from([0x80]))).not.toBe('UTF-8')
    expect(detectEncoding(Uint8Array.from([0xe4, 0xb8]))).not.toBe('UTF-8')
  })
})

describe('detectEncoding / decodeText — GBK and Unknown', () => {
  it('decodes a double-byte GBK body back to the original text', () => {
    expect(detectEncoding(GBK_CJK_LINE)).toBe('GBK')
    expect(decodeText(GBK_CJK_LINE)).toEqual({ text: '中文\n', encoding: 'GBK' })
  })

  it('never reports pure ASCII as GBK', () => {
    expect(detectEncoding(utf8('plain ascii\n'))).toBe('UTF-8')
  })

  it('degrades to Unknown deterministically without throwing', () => {
    const bytes = Uint8Array.from([0xff, 0xff, 0xff])
    expect(detectEncoding(bytes)).toBe('Unknown')
    const decoded = decodeText(bytes)
    expect(decoded.encoding).toBe('Unknown')
    expect(decoded.text).toContain('\ufffd')
    expect(decodeText(bytes)).toEqual(decoded)
  })

  it('returns Unknown instead of guessing when no GBK decoder exists', () => {
    expect(detectEncoding(GBK_CJK_LINE, { decoderFactory: withoutGbkDecoder })).toBe('Unknown')
    const decoded = decodeText(GBK_CJK_LINE, { decoderFactory: withoutGbkDecoder })
    expect(decoded.encoding).toBe('Unknown')
    expect(decoded.text).toContain('\ufffd')
    expect(decoded.text).not.toBe('中文\n')
    expect(decodeText(GBK_CJK_LINE, { decoderFactory: withoutGbkDecoder })).toEqual(decoded)
  })
})

describe('probeTextBytes', () => {
  it('returns every fact from the same bytes with an independently computed digest', () => {
    const bytes = utf8('abc')
    expect(probeTextBytes(bytes)).toEqual({
      text: 'abc',
      encoding: 'UTF-8',
      newline: 'None',
      bytes: 3,
      sha256: nodeSha256(bytes)
    })
  })

  it('hashes the raw bytes and derives the newline from the decoded text', () => {
    const bytes = utf8('a\r\nb')
    const probe = probeTextBytes(bytes)
    expect(probe).toMatchObject({
      encoding: 'UTF-8',
      newline: 'CRLF',
      bytes: 4,
      sha256: sha256Bytes(bytes)
    })
  })

  it('probes an empty body as UTF-8 with no newline', () => {
    const empty = new Uint8Array()
    expect(probeTextBytes(empty)).toEqual({
      text: '',
      encoding: 'UTF-8',
      newline: 'None',
      bytes: 0,
      sha256: nodeSha256(empty)
    })
  })

  it('reports the GBK probe facts from the same bytes', () => {
    expect(probeTextBytes(GBK_CJK_LINE)).toMatchObject({
      encoding: 'GBK',
      text: '中文\n',
      newline: 'LF',
      bytes: GBK_CJK_LINE.length,
      sha256: sha256Bytes(GBK_CJK_LINE)
    })
  })
})
