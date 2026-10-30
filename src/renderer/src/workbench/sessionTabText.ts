/**
 * Display-text rules for the session tabs.
 *
 * A tab receives the title and subtitle the shell already derived from the
 * session's real left / right paths (see `sessionDisplay`); this module only
 * decides how much of that text fits the tab budget at one window tier. It is
 * pure — no DOM, no React, no Electron — so the same numbers drive both the
 * component and its tests.
 *
 * Clipping is always head-trimmed: the rendered text is one `…` followed by a
 * contiguous tail of the input, which keeps the file extension visible. The
 * rules are deterministic and idempotent: clipping an already clipped text
 * returns it unchanged.
 */
import type { WidthTier } from './shellLayout'

/** The only ellipsis character used by the tabs (U+2026). */
export const TAB_ELLIPSIS = '…'

/** Separator of the two sides of a derived tab text (`A ↔ B`). */
export const PAIR_SEPARATOR = ' ↔ '

/** Separator in front of the file-format segment of a subtitle. */
export const SUBTITLE_FORMAT_SEPARATOR = ' · '

/**
 * Width budget of one window tier. Columns are approximate character cells
 * (the tab copy renders at `text-xs`), and `chrome` is everything a tab always
 * spends besides its text: horizontal padding, icon, gaps and the close button.
 */
export interface TabTierBudget {
  /** Upper bound of one tab container, in px. */
  readonly tabMaxWidthPx: number
  /** Fixed non-text width of one tab, in px. */
  readonly chromeWidthPx: number
  /** Character budget of the title at this tier. */
  readonly titleCols: number
  /** Character budget of the subtitle at this tier; `0` hides the subtitle. */
  readonly subtitleCols: number
  /** Width of one character cell, in px. */
  readonly columnPx: number
}

/**
 * The single tier table. The component reads it, the tests read it; no other
 * place may hold a second copy of these numbers.
 */
export const TAB_TIER_BUDGETS: Readonly<Record<WidthTier, TabTierBudget>> = {
  compact: {
    tabMaxWidthPx: 200,
    chromeWidthPx: 72,
    titleCols: 20,
    subtitleCols: 0,
    columnPx: 6
  },
  regular: {
    tabMaxWidthPx: 400,
    chromeWidthPx: 72,
    titleCols: 30,
    subtitleCols: 24,
    columnPx: 6
  },
  wide: {
    tabMaxWidthPx: 520,
    chromeWidthPx: 72,
    titleCols: 40,
    subtitleCols: 32,
    columnPx: 6
  }
}

/** One clipped text plus the bookkeeping callers (and tests) assert on. */
export interface ClippedText {
  /** Text to render as-is. */
  readonly text: string
  /** True when the input did not fit and part of it was dropped. */
  readonly truncated: boolean
  /** How many characters of the input are no longer rendered. */
  readonly omittedCount: number
  /** Index in the input where the omitted run starts. */
  readonly omittedAt: number
}

/** Budgets are character counts; below one character a text is meaningless. */
function budgetOf(budget: number): number {
  if (!Number.isFinite(budget)) return 1
  return Math.max(1, Math.floor(budget))
}

function unchanged(input: string): ClippedText {
  return { text: input, truncated: false, omittedCount: 0, omittedAt: input.length }
}

/** Trims the head of `input` so that `…` plus the tail fits `budget` chars. */
export function clipTail(input: string, budget: number): ClippedText {
  const limit = budgetOf(budget)
  if (input.length <= limit) return unchanged(input)
  const keep = limit - 1
  const tail = keep === 0 ? '' : input.slice(input.length - keep)
  return {
    text: TAB_ELLIPSIS + tail,
    truncated: true,
    omittedCount: input.length - keep,
    omittedAt: input.length - keep
  }
}

/** Column split of an `A ↔ B` text: at most one column apart, both non-empty. */
export function splitPairBudget(budget: number): { leftCols: number; rightCols: number } {
  const remaining = Math.max(2, budgetOf(budget) - PAIR_SEPARATOR.length)
  const leftCols = Math.ceil(remaining / 2)
  return { leftCols, rightCols: remaining - leftCols }
}

/**
 * Clips an `A ↔ B` text. Both sides keep their own tail, the separator and its
 * two spaces always survive, and no side is ever reduced to an empty string.
 * A text without a separator falls back to plain tail clipping.
 */
export function clipPair(input: string, budget: number): ClippedText {
  const limit = budgetOf(budget)
  if (input.length <= limit) return unchanged(input)

  const at = input.indexOf(PAIR_SEPARATOR)
  if (at <= 0 || limit <= PAIR_SEPARATOR.length + 1) return clipTail(input, budget)

  const left = input.slice(0, at)
  const right = input.slice(at + PAIR_SEPARATOR.length)
  if (right.length === 0) return clipTail(input, budget)

  const { leftCols, rightCols } = splitPairBudget(limit)
  const leftClip = clipTail(left, leftCols)
  const rightClip = clipTail(right, rightCols)
  const text = leftClip.text + PAIR_SEPARATOR + rightClip.text
  return {
    text,
    truncated: true,
    omittedCount: leftClip.omittedCount + rightClip.omittedCount,
    omittedAt: leftClip.truncated
      ? leftClip.omittedAt
      : at + PAIR_SEPARATOR.length + rightClip.omittedAt
  }
}

/** Title rule: a derived title is either one name or an `A ↔ B` pair. */
export function clipTitle(input: string, budget: number): ClippedText {
  return clipPair(input, budget)
}

/**
 * Subtitle rule: when a subtitle is over budget, the ` · <format>` suffix is
 * dropped first and only the remaining path is clipped. A subtitle that fits
 * keeps its suffix.
 */
export function clipSubtitle(input: string, budget: number): ClippedText {
  const limit = budgetOf(budget)
  if (input.length <= limit) return unchanged(input)

  const at = input.lastIndexOf(SUBTITLE_FORMAT_SEPARATOR)
  if (at < 0) return clipTail(input, limit)

  const path = input.slice(0, at)
  const dropped = input.length - path.length
  if (path.length <= limit) {
    return { text: path, truncated: true, omittedCount: dropped, omittedAt: at }
  }

  const clipped = clipTail(path, limit)
  return {
    text: clipped.text,
    truncated: true,
    omittedCount: clipped.omittedCount + dropped,
    omittedAt: clipped.omittedAt
  }
}
