// @vitest-environment jsdom
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CodeSceneFixture } from '@shared/fixtures'
import type { FilePair } from '@renderer/workbench/session'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from './CodeView'
import { moreItem } from '../../../test/shellMenu'

const platform = createWebPlatformPort()

afterEach(cleanup)

function pairWith(extension: 'ts' | 'txt'): FilePair {
  return {
    left: { path: `/pairs/left.${extension}`, text: 'const a = 1\n\nconst b = 2\n' },
    right: { path: `/pairs/right.${extension}`, text: 'const a = 1\nconst b = 3\n' }
  }
}

/** Everything functional that must not move when syntax colouring turns on. */
function snapshot(): string {
  const count = document.querySelector('[data-code-diff-count]')?.textContent ?? ''
  const counter =
    Array.from(document.querySelectorAll('[data-shell-level="view-toolbar"] span')).find((span) =>
      /^\d+\/\d+$/.test(span.textContent ?? '')
    )?.textContent ?? ''
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-diff-row]')).map((row) => {
    const gutter = row.firstElementChild?.textContent ?? ''
    const cell = row.children[1]
    return `${gutter}|${cell instanceof HTMLElement ? cell.className : ''}`
  })
  return JSON.stringify({ count, counter, rows })
}

function renderSnapshot(pair: FilePair, toggles: readonly string[] = []): string {
  renderWithI18n(<CodeView pair={pair} platform={platform} />)
  for (const label of toggles) fireEvent.click(moreItem(label))
  return snapshot()
}

const syntaxSignature = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-syntax]')).map(
    (span) => `${span.className}|${span.textContent ?? ''}`
  )

const MERGE_FIXTURE: CodeSceneFixture = {
  scene: 'code',
  composition: { same: 0, added: 0, removed: 0, modified: 0, conflict: 1 },
  diff: { left: { path: '/samples/left.ts', text: 'alpha\n' }, right: { path: '/samples/right.ts', text: 'beta\n' } },
  merge: {
    base: { path: '/samples/base.ts', text: 'const value = 1\n' },
    ours: { path: '/samples/ours.ts', text: 'const value = 2\n' },
    theirs: { path: '/samples/theirs.ts', text: 'const value = 3\n' }
  }
}

describe('syntax colouring keeps the comparison feature-parity', () => {
  it('keeps counts, counters, line numbers and row tones identical for every switch state', () => {
    for (const toggles of [[], ['忽略换行'], ['忽略编码'], ['忽略空白差异']] as const) {
      cleanup()
      const ts = renderSnapshot(pairWith('ts'), toggles)
      cleanup()
      const txt = renderSnapshot(pairWith('txt'), toggles)
      expect(ts).toEqual(txt)
    }
  })

  it('produces the same syntax class sequence under light and dark themes', () => {
    document.documentElement.dataset.theme = 'dark'
    renderWithI18n(<CodeView pair={pairWith('ts')} platform={platform} />)
    const dark = syntaxSignature()
    cleanup()
    document.documentElement.dataset.theme = 'light'
    renderWithI18n(<CodeView pair={pairWith('ts')} platform={platform} />)
    const light = syntaxSignature()
    delete document.documentElement.dataset.theme
    expect(dark.length).toBeGreaterThan(0)
    expect(light).toEqual(dark)
  })

  it('never colours the untouched three-way merge view', () => {
    renderWithI18n(<CodeView fixture={MERGE_FIXTURE} defaultMode="merge" platform={platform} />)
    expect(document.querySelectorAll('[data-syntax]')).toHaveLength(0)
  })
})
