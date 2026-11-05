/** Types for `scripts/four-state-legend.mjs`, shared by the script and its gates. */

export type FourStateLegendStatus = 'same' | 'added' | 'removed' | 'modified'

export interface FourStateLegendCounts {
  same: number
  added: number
  removed: number
  modified: number
}

export type FourStateLegendFailureReason =
  | 'legend-missing'
  | 'legend-duplicate'
  | 'status-missing'
  | 'count-non-finite'

export interface FourStateLegendSuccess {
  ok: true
  counts: FourStateLegendCounts
}

export interface FourStateLegendFailure {
  ok: false
  reason: FourStateLegendFailureReason
  detail: unknown
}

export type ReadFourStateLegendResult = FourStateLegendSuccess | FourStateLegendFailure

export const FOUR_STATE_LEGEND_SELECTOR: string
export const FOUR_STATE_STATUS_ATTRIBUTE: string
export const FOUR_STATE_STATUSES: readonly FourStateLegendStatus[]
export const FOUR_STATE_EXPRESSION: string
export function readFourStateLegend(document: Document): ReadFourStateLegendResult
