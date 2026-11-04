import { describe, expect, it } from 'vitest'
import { codeProbeStatusEntries, PROBE_MISSING_VALUE } from './probeStatus'
import type { FilePairProbes } from './session'

const PROBES: FilePairProbes = {
  left: { path: '/a.ts', encoding: 'UTF-16LE', newline: 'CRLF', bytes: 16, sha256: 'left' },
  right: { path: '/b.ts', encoding: 'GBK', newline: 'LF', bytes: 5, sha256: 'right' }
}

describe('codeProbeStatusEntries', () => {
  it('lists left newline, right newline, left encoding, right encoding in that order', () => {
    const entries = codeProbeStatusEntries(PROBES, true)
    expect(entries.map((entry) => entry.key)).toEqual([
      'shell.status.leftNewline',
      'shell.status.rightNewline',
      'shell.status.leftEncoding',
      'shell.status.rightEncoding'
    ])
    expect(entries.map((entry) => entry.value)).toEqual(['CRLF', 'LF', 'UTF-16LE', 'GBK'])
  })

  it('renders only the missing side as a placeholder and keeps the other side real', () => {
    const leftOnly = codeProbeStatusEntries({ left: PROBES.left }, true)
    expect(leftOnly.map((entry) => entry.value)).toEqual([
      'CRLF',
      PROBE_MISSING_VALUE,
      'UTF-16LE',
      PROBE_MISSING_VALUE
    ])
    const rightOnly = codeProbeStatusEntries({ right: PROBES.right }, true)
    expect(rightOnly.map((entry) => entry.value)).toEqual([
      PROBE_MISSING_VALUE,
      'LF',
      PROBE_MISSING_VALUE,
      'GBK'
    ])
  })

  it('renders no entries when a two-column diff is not on screen', () => {
    expect(codeProbeStatusEntries(PROBES, false)).toEqual([])
    // Both sides are missing, so each same-value fact dedupes to one entry.
    expect(codeProbeStatusEntries(undefined, true).map((entry) => entry.key)).toEqual([
      'shell.status.newline',
      'shell.status.encoding'
    ])
    expect(codeProbeStatusEntries(undefined, true).map((entry) => entry.value)).toEqual([
      PROBE_MISSING_VALUE,
      PROBE_MISSING_VALUE
    ])
  })

  it('collapses equal newline and encoding facts to one entry each', () => {
    const same = codeProbeStatusEntries(
      {
        left: { path: '/a.ts', encoding: 'UTF-8', newline: 'LF', bytes: 16, sha256: 'left' },
        right: { path: '/b.ts', encoding: 'UTF-8', newline: 'LF', bytes: 5, sha256: 'right' }
      },
      true
    )
    expect(same.map((entry) => entry.key)).toEqual([
      'shell.status.newline',
      'shell.status.encoding'
    ])
    expect(same.map((entry) => entry.value)).toEqual(['LF', 'UTF-8'])
  })
})
