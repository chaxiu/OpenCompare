/**
 * The status-bar readout of a code file pair's original probe facts.
 *
 * Pure by construction: the only inputs are the facts frozen on the session and
 * whether a two-column diff is actually on screen. Editing, saving, normalising
 * or merging cannot reach this function's output, so the four values can never
 * be re-derived from a working copy.
 */
import type { MessageKey } from '@renderer/i18n/messages'
import type { FilePairProbes } from './session'

/** Shown for a side that does not exist; never a fabricated encoding. */
export const PROBE_MISSING_VALUE = '—'

/** One status entry: a dictionary label plus an untranslated technical value. */
export interface ProbeStatusEntry {
  readonly key: MessageKey
  readonly value: string
}

/**
 * Status entries of a two-column code diff. Newline and encoding facts are
 * deduped: when both sides agree the bar shows the fact once, and only a real
 * difference expands into the left / right pair. A merge view has no
 * left/right semantics, so it renders none.
 */
export function codeProbeStatusEntries(
  probes: FilePairProbes | undefined,
  diffVisible: boolean
): readonly ProbeStatusEntry[] {
  if (!diffVisible) return []
  const leftNewline = probes?.left?.newline ?? PROBE_MISSING_VALUE
  const rightNewline = probes?.right?.newline ?? PROBE_MISSING_VALUE
  const leftEncoding = probes?.left?.encoding ?? PROBE_MISSING_VALUE
  const rightEncoding = probes?.right?.encoding ?? PROBE_MISSING_VALUE

  const newline: ProbeStatusEntry[] =
    leftNewline === rightNewline
      ? [{ key: 'shell.status.newline', value: leftNewline }]
      : [
          { key: 'shell.status.leftNewline', value: leftNewline },
          { key: 'shell.status.rightNewline', value: rightNewline }
        ]
  const encoding: ProbeStatusEntry[] =
    leftEncoding === rightEncoding
      ? [{ key: 'shell.status.encoding', value: leftEncoding }]
      : [
          { key: 'shell.status.leftEncoding', value: leftEncoding },
          { key: 'shell.status.rightEncoding', value: rightEncoding }
        ]
  return [...newline, ...encoding]
}
