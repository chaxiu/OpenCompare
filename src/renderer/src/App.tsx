import { useState } from 'react'
import type { JSX } from 'react'
import { PerfRunner } from './perf/PerfRunner'
import { createPlatformPort } from './platform'
import { Workbench } from './workbench/Workbench'

/** Only the harness window is loaded with `?perf=1`; every normal launch lacks it. */
function isPerfMeasurementWindow(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('perf')
}

export function App(): JSX.Element {
  const [platform] = useState(createPlatformPort)

  return isPerfMeasurementWindow() ? (
    <PerfRunner platform={platform} />
  ) : (
    <Workbench platform={platform} />
  )
}
