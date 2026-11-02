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
 * The four entries of a two-column code diff, in fixed order:
 * left newline → left encoding → right newline → right encoding.
 * A merge view has no left/right semantics, so it renders none.
 */
export function codeProbeStatusEntries(
  probes: FilePairProbes | undefined,
  diffVisible: boolean
): readonly ProbeStatusEntry[] {
  if (!diffVisible) return []
  return [
    {
      key: 'shell.status.leftNewline',
      value: probes?.left?.newline ?? PROBE_MISSING_VALUE
    },
    {
      key: 'shell.status.leftEncoding',
      value: probes?.left?.encoding ?? PROBE_MISSING_VALUE
    },
    {
      key: 'shell.status.rightNewline',
      value: probes?.right?.newline ?? PROBE_MISSING_VALUE
    },
    {
      key: 'shell.status.rightEncoding',
      value: probes?.right?.encoding ?? PROBE_MISSING_VALUE
    }
  ]
}
