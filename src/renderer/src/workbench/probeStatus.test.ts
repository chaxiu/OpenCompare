import { describe, expect, it } from 'vitest'
import { codeProbeStatusEntries, PROBE_MISSING_VALUE } from './probeStatus'
import type { FilePairProbes } from './session'

const PROBES: FilePairProbes = {
  left: { path: '/a.ts', encoding: 'UTF-16LE', newline: 'CRLF', bytes: 16, sha256: 'left' },
  right: { path: '/b.ts', encoding: 'GBK', newline: 'LF', bytes: 5, sha256: 'right' }
}

describe('codeProbeStatusEntries', () => {
  it('lists left newline, left encoding, right newline, right encoding in that order', () => {
    const entries = codeProbeStatusEntries(PROBES, true)
    expect(entries.map((entry) => entry.key)).toEqual([
      'shell.status.leftNewline',
      'shell.status.leftEncoding',
      'shell.status.rightNewline',
      'shell.status.rightEncoding'
    ])
    expect(entries.map((entry) => entry.value)).toEqual(['CRLF', 'UTF-16LE', 'LF', 'GBK'])
  })

  it('renders only the missing side as a placeholder and keeps the other side real', () => {
    const leftOnly = codeProbeStatusEntries({ left: PROBES.left }, true)
    expect(leftOnly.map((entry) => entry.value)).toEqual([
      'CRLF',
      'UTF-16LE',
      PROBE_MISSING_VALUE,
      PROBE_MISSING_VALUE
    ])
    const rightOnly = codeProbeStatusEntries({ right: PROBES.right }, true)
    expect(rightOnly.map((entry) => entry.value)).toEqual([
      PROBE_MISSING_VALUE,
      PROBE_MISSING_VALUE,
      'LF',
      'GBK'
    ])
  })

  it('renders no entries when a two-column diff is not on screen', () => {
    expect(codeProbeStatusEntries(PROBES, false)).toEqual([])
    expect(codeProbeStatusEntries(undefined, true).map((entry) => entry.value)).toEqual([
      PROBE_MISSING_VALUE,
      PROBE_MISSING_VALUE,
      PROBE_MISSING_VALUE,
      PROBE_MISSING_VALUE
    ])
  })
})
