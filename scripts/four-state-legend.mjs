/**
 * One read path for the four-state legend, shared by the release verifier
 * (CDP, against a real Electron window) and the jsdom regression tests.
 *
 * The legend is located by its own semantics (`[data-shell-legend]`), never by
 * a surrounding status bar or toolbar. `readFourStateLegend` must stay
 * self-contained (no module-scope references) because `FOUR_STATE_EXPRESSION`
 * serializes its source for `Runtime.evaluate`; that keeps the CDP side and the
 * DOM-test side on exactly one implementation.
 */

export const FOUR_STATE_LEGEND_SELECTOR = '[data-shell-legend]'
export const FOUR_STATE_STATUS_ATTRIBUTE = 'data-legend-status'
export const FOUR_STATE_STATUSES = ['same', 'added', 'removed', 'modified']

/**
 * Reads `{ same, added, removed, modified }` from the single legend in the app
 * shell. Never returns `null` counts: a missing, duplicated, incomplete or
 * non-finite legend is a distinguishable failure instead of a silent skip.
 *
 * @param {Document} document
 * @returns {{ ok: true, counts: { same: number, added: number, removed: number, modified: number } } |
 *   { ok: false, reason: 'legend-missing' | 'legend-duplicate' | 'status-missing' | 'count-non-finite', detail: unknown }}
 */
export function readFourStateLegend(document) {
  const roots = document.querySelectorAll('[data-shell-legend]')
  if (roots.length === 0) {
    return {
      ok: false,
      reason: 'legend-missing',
      detail: { selector: '[data-shell-legend]' }
    }
  }
  if (roots.length > 1) {
    return { ok: false, reason: 'legend-duplicate', detail: { count: roots.length } }
  }
  const root = roots[0]
  const counts = { same: 0, added: 0, removed: 0, modified: 0 }
  for (const status of ['same', 'added', 'removed', 'modified']) {
    const cell = root.querySelector(`[data-legend-status="${status}"]`)
    if (cell === null) {
      return { ok: false, reason: 'status-missing', detail: { status } }
    }
    const countNode = cell.querySelector('.tabular')
    const text = countNode === null ? '' : (countNode.textContent ?? '').trim()
    const value = text === '' ? Number.NaN : Number(text)
    if (!Number.isFinite(value)) {
      return { ok: false, reason: 'count-non-finite', detail: { status, text } }
    }
    counts[status] = value
  }
  return { ok: true, counts }
}

/** The one CDP expression: the same function body, serialized. */
export const FOUR_STATE_EXPRESSION = `(${readFourStateLegend.toString()})(document)`
