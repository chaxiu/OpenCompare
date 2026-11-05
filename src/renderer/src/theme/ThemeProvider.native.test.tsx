// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { JSX } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlatformPort, Theme } from '@shared/platform/types'
import { useTheme } from './context'
import { ThemeProvider } from './ThemeProvider'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.removeProperty('color-scheme')
})

function ModeControl(): JSX.Element {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="mode">{theme}</span>
      {(['light', 'dark', 'system'] as const).map((mode: Theme) => (
        <button key={mode} type="button" onClick={() => setTheme(mode)}>
          {mode}
        </button>
      ))}
    </div>
  )
}

describe('native theme push', () => {
  it('pushes the mode on mount and on every change, never the resolved value', () => {
    const setNativeTheme = vi.fn(async () => undefined)
    render(
      <ThemeProvider initialTheme="dark" platform={{ setNativeTheme }}>
        <ModeControl />
      </ThemeProvider>
    )

    expect(setNativeTheme).toHaveBeenNthCalledWith(1, 'dark')
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(setNativeTheme).toHaveBeenLastCalledWith('light')
    fireEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(setNativeTheme).toHaveBeenLastCalledWith('system')
    expect(screen.getByTestId('mode').textContent).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('swallows a failed native push and still applies the switch', async () => {
    const setNativeTheme = vi.fn(async () => {
      throw new Error('native channel unavailable')
    })
    render(
      <ThemeProvider initialTheme="dark" platform={{ setNativeTheme }}>
        <ModeControl />
      </ThemeProvider>
    )

    await waitFor(() => expect(setNativeTheme).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByTestId('mode').textContent).toBe('light')
  })

  it('works without a platform or without the optional method', () => {
    for (const platform of [undefined, {} as Pick<PlatformPort, 'setNativeTheme'>]) {
      const view = render(
        <ThemeProvider initialTheme="dark" platform={platform}>
          <ModeControl />
        </ThemeProvider>
      )
      fireEvent.click(screen.getByRole('button', { name: 'light' }))
      expect(document.documentElement.dataset.theme).toBe('light')
      view.unmount()
    }
  })
})
