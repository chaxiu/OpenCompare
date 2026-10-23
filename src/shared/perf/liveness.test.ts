import { describe, expect, it } from 'vitest'
import type { LivenessRef } from './liveness'
import { isLivenessEnabled, livenessCounts, setLivenessEnabled, trackLive } from './liveness'

/**
 * Controllable weak reference: `alive` holds the strong references, so a test
 * can "collect" an object by deleting it from the set instead of hoping a real
 * GC runs (vitest does not enable `--expose-gc`).
 */
function stubRefs() {
  const alive = new Set<object>()
  return {
    collect(value: object) {
      alive.delete(value)
    },
    createRef(value: object): LivenessRef {
      alive.add(value)
      return { deref: () => (alive.has(value) ? value : undefined) }
    }
  }
}

describe('liveness registry', () => {
  it('records nothing while disabled', () => {
    setLivenessEnabled(false)
    trackLive('comparison', { id: 1 })
    trackLive('rowModel', { id: 2 })
    expect(isLivenessEnabled()).toBe(false)
    expect(livenessCounts()).toEqual({ comparisons: 0, rowModels: 0 })
  })

  it('counts a tracked object once per kind', () => {
    const refs = stubRefs()
    setLivenessEnabled(true, { createRef: refs.createRef })
    const comparison = { id: 'comparison' }
    const left = { id: 'left' }
    const right = { id: 'right' }
    trackLive('comparison', comparison)
    trackLive('comparison', comparison)
    trackLive('rowModel', left)
    trackLive('rowModel', right)
    expect(livenessCounts()).toEqual({ comparisons: 1, rowModels: 2 })
    setLivenessEnabled(false)
  })

  it('drops a count once the object is no longer reachable', () => {
    const refs = stubRefs()
    setLivenessEnabled(true, { createRef: refs.createRef })
    const oldComparison = { id: 'old' }
    const current = { id: 'current' }
    trackLive('comparison', oldComparison)
    trackLive('comparison', current)
    expect(livenessCounts().comparisons).toBe(2)

    refs.collect(oldComparison)
    expect(livenessCounts()).toEqual({ comparisons: 1, rowModels: 0 })
    setLivenessEnabled(false)
  })

  it('starts a fresh recording when enabled again', () => {
    const refs = stubRefs()
    setLivenessEnabled(true, { createRef: refs.createRef })
    trackLive('comparison', { id: 'a' })
    expect(livenessCounts().comparisons).toBe(1)

    setLivenessEnabled(true, { createRef: refs.createRef })
    expect(livenessCounts()).toEqual({ comparisons: 0, rowModels: 0 })
    trackLive('comparison', { id: 'a' })
    expect(livenessCounts().comparisons).toBe(1)
    setLivenessEnabled(false)
  })
})
