import type { JSX } from 'react'
import { createPlatformPort } from './platform'

export function App(): JSX.Element {
  const platform = createPlatformPort()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl font-semibold tracking-tight">OpenCompare</h1>
      <p className="text-sm text-neutral-400">Shell mounted — scaffold ready.</p>
      <p className="text-xs text-neutral-500">
        PlatformPort: <span className="text-neutral-300">{platform.kind}</span>
      </p>
    </main>
  )
}
