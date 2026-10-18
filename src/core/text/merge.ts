import { diff3MergeRegions } from 'node-diff3'
import { splitLines } from './lines'

/** Which side a stable merge region came from. */
export type MergeSource = 'ours' | 'theirs' | 'base'
/** Resolution of one conflict block. */
export type MergeAccept = MergeSource | 'both'

/** 0-based line range inside one merge input. */
export interface MergeRange {
  readonly start: number
  readonly count: number
}

/**
 * One region of the three-way merge. Stable regions are resolved by the engine
 * (only one side changed, or both changed identically); conflict blocks are the
 * ones the user has to decide on.
 */
export interface MergeBlock {
  readonly id: string
  readonly kind: 'stable' | 'conflict'
  /** Auto source of a stable region; `null` for a conflict block. */
  readonly source: MergeSource | null
  readonly ours: readonly string[]
  readonly base: readonly string[]
  readonly theirs: readonly string[]
  readonly oursRange: MergeRange
  readonly baseRange: MergeRange
  readonly theirsRange: MergeRange
}

export interface MergeModel {
  /** Every region in file order. */
  readonly blocks: readonly MergeBlock[]
  /** Ids of the conflict blocks, in file order. */
  readonly conflictIds: readonly string[]
}

export type MergeResolutions = Readonly<Record<string, MergeAccept>>

export interface MergeLine {
  readonly text: string
  readonly blockId: string
  /** `true` while the line belongs to an unresolved conflict (marker or pending). */
  readonly conflict: boolean
}

export interface MergeRender {
  readonly lines: readonly MergeLine[]
  readonly unresolved: number
}

export const CONFLICT_MARKER_OURS = '<<<<<<< ours'
export const CONFLICT_MARKER_BASE = '||||||| base'
export const CONFLICT_MARKER_SEP = '======='
export const CONFLICT_MARKER_THEIRS = '>>>>>>> theirs'

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index])
}

function range(start: number, count: number): MergeRange {
  return { start, count }
}

const EMPTY_RANGE = range(0, 0)

/**
 * Splits base / ours / theirs into stable and conflict blocks using the
 * line-wise `diff3MergeRegions` engine. Both sides changing a line the same way
 * is a "false conflict": it is adopted automatically rather than offered to the
 * user.
 */
export function buildMergeModel(
  baseText: string,
  oursText: string,
  theirsText: string
): MergeModel {
  const base = splitLines(baseText)
  const ours = splitLines(oursText)
  const theirs = splitLines(theirsText)
  const blocks: MergeBlock[] = []

  for (const [index, region] of diff3MergeRegions(ours, base, theirs).entries()) {
    const id = `merge-block-${index}`

    if (region.stable) {
      const source: MergeSource =
        region.buffer === 'a' ? 'ours' : region.buffer === 'b' ? 'theirs' : 'base'
      const content = region.bufferContent
      blocks.push({
        id,
        kind: 'stable',
        source,
        ours: source === 'ours' ? content : [],
        base: source === 'base' ? content : [],
        theirs: source === 'theirs' ? content : [],
        oursRange: source === 'ours' ? range(region.bufferStart, region.bufferLength) : EMPTY_RANGE,
        baseRange: source === 'base' ? range(region.bufferStart, region.bufferLength) : EMPTY_RANGE,
        theirsRange:
          source === 'theirs' ? range(region.bufferStart, region.bufferLength) : EMPTY_RANGE
      })
      continue
    }

    if (sameLines(region.aContent, region.bContent)) {
      const content = region.aContent
      blocks.push({
        id,
        kind: 'stable',
        source: 'ours',
        ours: content,
        base: region.oContent,
        theirs: content,
        oursRange: range(region.aStart, region.aLength),
        baseRange: range(region.oStart, region.oLength),
        theirsRange: range(region.bStart, region.bLength)
      })
      continue
    }

    blocks.push({
      id,
      kind: 'conflict',
      source: null,
      ours: region.aContent,
      base: region.oContent,
      theirs: region.bContent,
      oursRange: range(region.aStart, region.aLength),
      baseRange: range(region.oStart, region.oLength),
      theirsRange: range(region.bStart, region.bLength)
    })
  }

  return {
    blocks,
    conflictIds: blocks.filter((block) => block.kind === 'conflict').map((block) => block.id)
  }
}

/** Content a stable block contributes to the merge result. */
export function stableContent(block: MergeBlock): readonly string[] {
  if (block.source === 'ours') return block.ours
  if (block.source === 'theirs') return block.theirs
  return block.base
}

/** Lines one conflict block contributes for the given resolution. */
export function resolveBlock(block: MergeBlock, accept: MergeAccept): readonly string[] {
  switch (accept) {
    case 'ours':
      return block.ours
    case 'theirs':
      return block.theirs
    case 'both':
      return [...block.ours, ...block.theirs]
    case 'base':
      return block.base
  }
}

/**
 * Renders the merge result line by line. Unresolved conflicts keep their
 * `<<<<<<< / ||||||| / ======= / >>>>>>>` markers instead of being dropped.
 */
export function renderMerge(model: MergeModel, resolutions: MergeResolutions): MergeRender {
  const lines: MergeLine[] = []
  let unresolved = 0

  for (const block of model.blocks) {
    const push = (text: string, conflict: boolean): void => {
      lines.push({ text, blockId: block.id, conflict })
    }

    if (block.kind === 'stable') {
      for (const text of stableContent(block)) push(text, false)
      continue
    }

    const accept = resolutions[block.id]
    if (accept) {
      for (const text of resolveBlock(block, accept)) push(text, false)
      continue
    }

    unresolved += 1
    push(CONFLICT_MARKER_OURS, true)
    for (const text of block.ours) push(text, true)
    push(CONFLICT_MARKER_BASE, true)
    for (const text of block.base) push(text, true)
    push(CONFLICT_MARKER_SEP, true)
    for (const text of block.theirs) push(text, true)
    push(CONFLICT_MARKER_THEIRS, true)
  }

  return { lines, unresolved }
}

/** Remaining unresolved conflict count for a resolution set. */
export function countUnresolved(
  model: MergeModel,
  resolutions: MergeResolutions
): number {
  return model.conflictIds.filter((id) => resolutions[id] === undefined).length
}

/** Merge result as plain text, ready to export. */
export function renderMergeText(render: MergeRender): string {
  return render.lines.map((line) => line.text).join('\n')
}

/** The conflict block whose given side covers `line` (0-based). */
export function conflictAtLine(
  model: MergeModel,
  side: MergeSource,
  line: number
): MergeBlock | null {
  for (const block of model.blocks) {
    if (block.kind !== 'conflict') continue
    const span =
      side === 'ours' ? block.oursRange : side === 'theirs' ? block.theirsRange : block.baseRange
    if (line >= span.start && line < span.start + span.count) return block
  }
  return null
}
