/**
 * Renderer-side orchestration of a real three-way merge session.
 *
 * It reads the three real files, derives the session identity and display text
 * and never touches the merge algorithm: `CodeView` / `@core/text/merge` rebuild
 * the conflict model from the bodies carried here.
 */
import type { PlatformPort, TextFileProbe } from '@shared/platform/types'
import type { MergeSide } from '@shared/mergeRequest'
import type { Translate } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { extensionFamily } from '@shared/fileExtensions'
import { baseName, contentFamily } from './fileKinds'
import type { MergeFileSides, WorkbenchSession } from './session'

/** Known merge-session failures the shell localizes from a stable code. */
export type MergeSessionErrorCode = 'READ_FAILED' | 'UNSUPPORTED_FILE_TYPE'

/** A merge build rejection carrying the stable code and the failing side. */
export class MergeSessionError extends Error {
  constructor(
    readonly code: MergeSessionErrorCode,
    readonly side: MergeSide,
    message: string,
    readonly path = ''
  ) {
    super(message)
    this.name = 'MergeSessionError'
  }
}

const MERGE_SIDE_KEYS: Record<MergeSide, MessageKey> = {
  base: 'files.merge.side.base',
  ours: 'files.merge.side.ours',
  theirs: 'files.merge.side.theirs'
}

const MERGE_ERROR_KEYS: Record<MergeSessionErrorCode, MessageKey> = {
  READ_FAILED: 'shell.merge.error.READ_FAILED',
  UNSUPPORTED_FILE_TYPE: 'shell.merge.error.UNSUPPORTED_FILE_TYPE'
}

/**
 * Stable id of one merge session, derived from the three ordered paths: the
 * same trio reuses its tab while a different order is a different session.
 */
export function mergeSessionId(base: string, ours: string, theirs: string): string {
  return `merge:${base} ↔ ${ours} ↔ ${theirs}`
}

type MergePathSet = Pick<MergeFileSides, MergeSide>

/**
 * The single derivation of a merge session's visible identity: the three file
 * names (collapsed to one when all three match, like a file pair) and the three
 * full absolute paths.
 */
export function mergeSessionText(paths: MergePathSet): {
  readonly title: string
  readonly subtitle: string
} {
  const names = [
    baseName(paths.base.path),
    baseName(paths.ours.path),
    baseName(paths.theirs.path)
  ]
  const sameName = names.every((name) => name === names[0])
  return {
    title: sameName ? names[0] : names.join(' ↔ '),
    subtitle: `${paths.base.path} ↔ ${paths.ours.path} ↔ ${paths.theirs.path}`
  }
}

/**
 * Reads the three real files in parallel and assembles the merge session. A
 * rejected read aborts the whole build, so the caller never upserts a partial
 * session or writes history.
 */
export async function buildMergeSession(
  platform: PlatformPort,
  base: string,
  ours: string,
  theirs: string
): Promise<WorkbenchSession> {
  const sides: readonly MergeSide[] = ['base', 'ours', 'theirs']
  const source: Record<MergeSide, string> = { base, ours, theirs }
  const texts = await Promise.all(
    sides.map(async (side) => {
      const path = source[side]
      // A known extension keeps the existing plain read; an unknown extension is
      // probed once and that same probe supplies the merge body.
      if (extensionFamily(path) !== null) {
        try {
          return await platform.readTextFile(path)
        } catch {
          throw new MergeSessionError('READ_FAILED', side, `Failed to read the ${side} merge input.`)
        }
      }
      let probe: TextFileProbe
      try {
        probe = await platform.probeTextFile(path)
      } catch {
        throw new MergeSessionError('READ_FAILED', side, `Failed to read the ${side} merge input.`)
      }
      if (contentFamily(path, probe) === null) {
        throw new MergeSessionError(
          'UNSUPPORTED_FILE_TYPE',
          side,
          `Unsupported file type: ${baseName(path)}.`,
          path
        )
      }
      return probe.text
    })
  )

  const merge: MergeFileSides = {
    base: { path: base, text: texts[0] },
    ours: { path: ours, text: texts[1] },
    theirs: { path: theirs, text: texts[2] }
  }
  const text = mergeSessionText(merge)

  return {
    id: mergeSessionId(base, ours, theirs),
    scene: 'code',
    title: text.title,
    subtitle: text.subtitle,
    columns: 3,
    stats: [{ label: 'conflicts', value: 0 }],
    merge
  }
}

/** Localizes a merge build failure; never echoes a raw diagnostic or a path. */
export function mergeSessionErrorMessage(cause: unknown, t: Translate): string {
  const side = cause instanceof MergeSessionError ? cause.side : null
  const key =
    cause instanceof MergeSessionError ? MERGE_ERROR_KEYS[cause.code] : MERGE_ERROR_KEYS.READ_FAILED
  return t(key, {
    side: side === null ? '' : t(MERGE_SIDE_KEYS[side]),
    path: cause instanceof MergeSessionError ? baseName(cause.path) : ''
  })
}
