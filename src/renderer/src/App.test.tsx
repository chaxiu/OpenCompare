// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App in web render mode', () => {
  it('mounts the shell on the in-memory PlatformPort when no Electron bridge exists', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'OpenCompare' })).toBeDefined()
    expect(screen.getByText('web')).toBeDefined()
  })
})
