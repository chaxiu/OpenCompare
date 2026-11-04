/**
 * Deterministic newline and encoding probing over raw text bytes.
 *
 * Everything here is a pure function of the byte buffer: no Electron, React or
 * DOM dependency, no randomness and no probability guess. The judgment order is
 * fixed — BOM → BOM-less UTF-16 → strict UTF-8 → GBK → Unknown — so the same
 * bytes always produce the same label, in Node, the browser and the Electron
 * renderer.
 */
import { sha256Bytes } from '../directory/hash'

/** The newline styles {@link detectNewline} can report. */
export type NewlineKind = 'CRLF' | 'LF' | 'CR' | 'Mixed' | 'None'

/** The encoding labels {@link detectEncoding} can report. */
export type EncodingLabel = 'UTF-8' | 'UTF-8 BOM' | 'UTF-16LE' | 'UTF-16BE' | 'GBK' | 'Unknown'

/** Encodings the runtime decoder is asked for; `TextDecoder` accepts all four. */
export type TextDecoderLabel = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk'

/**
 * Builds one decoder. Injectable so a test can pin the degradation path when a
 * runtime lacks the GBK decoder; the default is the platform `TextDecoder`.
 */
export type TextDecoderFactory = (label: TextDecoderLabel) => TextDecoder

const runtimeDecoderFactory: TextDecoderFactory = (label) => new TextDecoder(label)

/** Optional seam shared by every probe function. */
export interface DecodeTextOptions {
  /** Replaces the runtime decoder; defaults to `new TextDecoder(label)`. */
  readonly decoderFactory?: TextDecoderFactory
}

/** A decoded body together with the encoding it was decoded as. */
export interface DecodedText {
  readonly text: string
  readonly encoding: EncodingLabel
}

/** Everything one {@link probeTextBytes} call derives from the same bytes. */
export interface TextBytesProbe {
  readonly text: string
  readonly encoding: EncodingLabel
  readonly newline: NewlineKind
  /** Length of the probed bytes, not of the decoded text. */
  readonly bytes: number
  /** Lowercase hex SHA-256 of the probed bytes, byte for byte. */
  readonly sha256: string
}

/**
 * A BOM-less UTF-16 body is recognised only when the NUL bytes sit on one
 * parity position for at least this share of code units, while the other parity
 * stays under {@link UTF16_OTHER_PARITY_NUL_LIMIT}. Both bounds live here, once:
 * no caller may keep a second copy.
 */
const UTF16_NUL_RATIO_THRESHOLD = 0.4
const UTF16_OTHER_PARITY_NUL_LIMIT = 0.1

/** GBK lead / trail byte ranges (the only boundary definition in the repo). */
const GBK_LEAD_MIN = 0x81
const GBK_LEAD_MAX = 0xfe
const GBK_TRAIL_MIN = 0x40
const GBK_TRAIL_MAX = 0xfe
const GBK_TRAIL_EXCLUDED = 0x7f

const REPLACEMENT_CHARACTER = '\ufffd'

/**
 * Counts newline terminators in decoded text. `\r\n` is one CRLF terminator and
 * is never also counted as a lone CR; a mix of two or more styles is `Mixed`.
 */
export function detectNewline(text: string): NewlineKind {
  let crlf = 0
  let lf = 0
  let cr = 0

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) {
        crlf += 1
        index += 1
      } else {
        cr += 1
      }
    } else if (code === 0x0a) {
      lf += 1
    }
  }

  const kinds = (crlf > 0 ? 1 : 0) + (lf > 0 ? 1 : 0) + (cr > 0 ? 1 : 0)
  if (kinds === 0) return 'None'
  if (kinds > 1) return 'Mixed'
  return crlf > 0 ? 'CRLF' : lf > 0 ? 'LF' : 'CR'
}

/**
 * Strict UTF-8 validation: overlong forms, surrogate code points, code points
 * above U+10FFFF and truncated sequences are all rejected, so an invalid body
 * never masquerades as UTF-8.
 */
function isValidUtf8(bytes: Uint8Array): boolean {
  let index = 0
  while (index < bytes.length) {
    const lead = bytes[index]
    if (lead <= 0x7f) {
      index += 1
      continue
    }

    let extra: number
    let codePoint: number
    let minimum: number
    if (lead >= 0xc2 && lead <= 0xdf) {
      extra = 1
      codePoint = lead & 0x1f
      minimum = 0x80
    } else if (lead >= 0xe0 && lead <= 0xef) {
      extra = 2
      codePoint = lead & 0x0f
      minimum = 0x800
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      extra = 3
      codePoint = lead & 0x07
      minimum = 0x10000
    } else {
      return false
    }

    if (index + extra >= bytes.length) return false
    for (let offset = 1; offset <= extra; offset += 1) {
      const continuation = bytes[index + offset]
      if ((continuation & 0xc0) !== 0x80) return false
      codePoint = (codePoint << 6) | (continuation & 0x3f)
    }
    if (codePoint < minimum) return false
    if (codePoint > 0x10ffff) return false
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false

    index += extra + 1
  }
  return true
}

/** BOM-less UTF-16 guess from the NUL distribution; `null` when it is unclear. */
function guessBomlessUtf16(bytes: Uint8Array): 'UTF-16LE' | 'UTF-16BE' | null {
  if (bytes.length < 2 || bytes.length % 2 !== 0) return null

  let evenNuls = 0
  let oddNuls = 0
  for (let index = 0; index < bytes.length; index += 2) {
    if (bytes[index] === 0) evenNuls += 1
    if (bytes[index + 1] === 0) oddNuls += 1
  }

  const units = bytes.length / 2
  const evenRatio = evenNuls / units
  const oddRatio = oddNuls / units
  if (oddRatio >= UTF16_NUL_RATIO_THRESHOLD && evenRatio <= UTF16_OTHER_PARITY_NUL_LIMIT) {
    return 'UTF-16LE'
  }
  if (evenRatio >= UTF16_NUL_RATIO_THRESHOLD && oddRatio <= UTF16_OTHER_PARITY_NUL_LIMIT) {
    return 'UTF-16BE'
  }
  return null
}

/**
 * GBK shape check: single bytes stay in ASCII, every other byte opens a
 * two-byte character with a valid trail byte, and at least one such double-byte
 * character must be present — pure ASCII is never GBK.
 */
function isStructurallyGbk(bytes: Uint8Array): boolean {
  let index = 0
  let doubleBytes = 0
  while (index < bytes.length) {
    const lead = bytes[index]
    if (lead <= 0x7f) {
      index += 1
      continue
    }
    if (lead < GBK_LEAD_MIN || lead > GBK_LEAD_MAX) return false
    const trail = bytes[index + 1]
    if (trail === undefined) return false
    if (trail < GBK_TRAIL_MIN || trail > GBK_TRAIL_MAX) return false
    if (trail === GBK_TRAIL_EXCLUDED) return false
    doubleBytes += 1
    index += 2
  }
  return doubleBytes > 0
}

/** Decodes with replacement instead of throwing; used by every fallback path. */
function decodeLenient(
  bytes: Uint8Array,
  label: TextDecoderLabel,
  factory: TextDecoderFactory
): string {
  return factory(label).decode(bytes)
}

/** First BOM the buffer starts with, in fixed priority order. */
function bomEncoding(bytes: Uint8Array): EncodingLabel | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'UTF-8 BOM'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'UTF-16LE'
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'UTF-16BE'
  return null
}

/**
 * Detection result. `text` is set only when confirming the label already
 * decoded the body (GBK), so {@link decodeText} never decodes twice.
 */
interface Detection {
  readonly encoding: EncodingLabel
  readonly text?: string
}

/**
 * Detects the encoding of `bytes` in the fixed order BOM → BOM-less UTF-16 →
 * strict UTF-8 → GBK → Unknown.
 *
 * GBK is confirmed by an actual decode: when the runtime has no GBK decoder (or
 * it refuses the body), the answer is `Unknown` instead of a guess.
 */
function detect(bytes: Uint8Array, options: DecodeTextOptions): Detection {
  const bom = bomEncoding(bytes)
  if (bom !== null) return { encoding: bom }

  const utf16 = guessBomlessUtf16(bytes)
  if (utf16 !== null) return { encoding: utf16 }

  if (isValidUtf8(bytes)) return { encoding: 'UTF-8' }

  if (isStructurallyGbk(bytes)) {
    const factory = options.decoderFactory ?? runtimeDecoderFactory
    try {
      const decoded = decodeLenient(bytes, 'gbk', factory)
      if (!decoded.includes(REPLACEMENT_CHARACTER)) return { encoding: 'GBK', text: decoded }
    } catch {
      // No usable GBK decoder: fall through to the deterministic Unknown path.
    }
  }

  return { encoding: 'Unknown' }
}

/** The label {@link decodeText} would report for `bytes`. */
export function detectEncoding(bytes: Uint8Array, options: DecodeTextOptions = {}): EncodingLabel {
  return detect(bytes, options).encoding
}

/** Body with the leading BOM removed, but only when the bytes actually carry one. */
function strippedBody(bytes: Uint8Array, encoding: EncodingLabel): Uint8Array {
  if (encoding === 'UTF-8 BOM') return bytes.subarray(3)
  if (encoding === 'UTF-16LE') {
    return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2) : bytes
  }
  if (encoding === 'UTF-16BE') {
    return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff ? bytes.subarray(2) : bytes
  }
  return bytes
}

/**
 * Decodes `bytes` once and reports the label it was decoded as. The BOM is
 * stripped from the result, and `Unknown` decodes as UTF-8 with U+FFFD
 * replacements rather than throwing.
 */
export function decodeText(bytes: Uint8Array, options: DecodeTextOptions = {}): DecodedText {
  const detection = detect(bytes, options)
  const { encoding } = detection
  if (detection.text !== undefined) return { text: detection.text, encoding }

  const factory = options.decoderFactory ?? runtimeDecoderFactory
  if (encoding === 'UTF-8 BOM') {
    return { text: decodeLenient(strippedBody(bytes, encoding), 'utf-8', factory), encoding }
  }
  if (encoding === 'UTF-16LE' || encoding === 'UTF-16BE') {
    const label = encoding === 'UTF-16LE' ? 'utf-16le' : 'utf-16be'
    return { text: decodeLenient(strippedBody(bytes, encoding), label, factory), encoding }
  }
  // `UTF-8` and `Unknown` both decode as UTF-8; Unknown is the replacement path.
  return { text: decodeLenient(bytes, 'utf-8', factory), encoding }
}

/**
 * One call, one buffer: decoded text, encoding, newline style, byte length and
 * raw-byte SHA-256 all come from the very same `bytes`.
 */
export function probeTextBytes(
  bytes: Uint8Array,
  options: DecodeTextOptions = {}
): TextBytesProbe {
  const { text, encoding } = decodeText(bytes, options)
  return {
    text,
    encoding,
    newline: detectNewline(text),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes)
  }
}

/**
 * The single text / binary verdict over one probe result. Text means the
 * encoding was recognised and the decoded body has no `U+0000`.
 *
 * That is equivalent to "no NUL byte outside the UTF-16 layout": UTF-16 NULs
 * live in the high byte and never decode to `U+0000`, while any other NUL
 * decodes to `U+0000` under UTF-8 / GBK (0x00 is not a GBK lead or trail byte).
 */
export function isTextProbe(probe: Pick<TextBytesProbe, 'text' | 'encoding'>): boolean {
  return probe.encoding !== 'Unknown' && !probe.text.includes('\u0000')
}

/**
 * Probes in-memory text exactly as its UTF-8 encoding would be probed. Sample
 * bodies and snapshot-inlined files have no original bytes, so they take this
 * one path instead of a second detection rule set.
 */
export function probeTextString(text: string): TextBytesProbe {
  return probeTextBytes(new TextEncoder().encode(text))
}
