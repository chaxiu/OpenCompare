import { useState } from 'react'
import type { JSX } from 'react'
import { createPlatformPort } from './platform'
import { Workbench } from './workbench/Workbench'

export function App(): JSX.Element {
  const [platform] = useState(createPlatformPort)

  return <Workbench platform={platform} />
}
