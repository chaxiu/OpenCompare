/**
 * Opt-in registry of the large objects the renderer holds today.
 *
 * The directory memory harness needs to prove *which* comparison trees and row
 * models are still reachable after a commit. A `WeakRef` registry answers that
 * without keeping anything alive: entries only extend while the real holder
 * still references the object. Recording is disabled by default, so the normal
 * workbench pays a single boolean check and no object is retained.
 *
 * Counting is only meaningful right after a real GC (`--expose-gc`); the
 * harness performs that before asking. Unit tests inject a controllable ref
 * factory instead of relying on GC timing.
 */
export type LivenessKind = 'comparison' | 'rowModel'

export interface LivenessCounts {
  readonly comparisons: number
  readonly rowModels: number
}

/** Minimal weak-reference seam; `WeakRef` in production, a stub in tests. */
export interface LivenessRef {
  deref(): object | undefined
}

export interface LivenessOptions {
  /** Ref factory, injectable so tests never depend on real GC timing. */
  readonly createRef?: (value: object) => LivenessRef
}

const weakRef = (value: object): LivenessRef => new WeakRef(value)

let enabled = false
let createRef: (value: object) => LivenessRef = weakRef
let tracked = new WeakSet<object>()
let comparisonRefs: LivenessRef[] = []
let rowModelRefs: LivenessRef[] = []

/** Enables/disables recording and clears everything recorded so far. */
export function setLivenessEnabled(next: boolean, options: LivenessOptions = {}): void {
  createRef = options.createRef ?? weakRef
  enabled = next
  tracked = new WeakSet()
  comparisonRefs = []
  rowModelRefs = []
}

export function isLivenessEnabled(): boolean {
  return enabled
}

/** Registers one object once per recording session; a no-op when disabled. */
export function trackLive(kind: LivenessKind, value: object): void {
  if (!enabled || tracked.has(value)) return
  tracked.add(value)
  const refs = kind === 'comparison' ? comparisonRefs : rowModelRefs
  refs.push(createRef(value))
}

/**
 * Live counts of everything still reachable since recording was enabled.
 * Cleared weak refs are dropped as they are observed, so repeated calls do not
 * report objects a GC already collected.
 */
export function livenessCounts(): LivenessCounts {
  comparisonRefs = comparisonRefs.filter((ref) => ref.deref() !== undefined)
  rowModelRefs = rowModelRefs.filter((ref) => ref.deref() !== undefined)
  return { comparisons: comparisonRefs.length, rowModels: rowModelRefs.length }
}
