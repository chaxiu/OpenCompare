// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { detectNewline } from '@core/text/probe'
import { sha256Hex } from '@core/directory/hash'
import { CODE_SCENE } from '@shared/fixtures'
import type { PlatformPort, TextFileFacts } from '@shared/platform/types'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

const LEFT = '/memory/probe/left.ts'
const RIGHT = '/memory/probe/right.ts'
const REOPENED = '/memory/probe/reopened.ts'
const RIGHT_REOPENED = '/memory/probe/right-reopened.ts'
const TEXTS: Record<string, string> = {
  [LEFT]: 'alpha\r\nbeta\r\n',
  [RIGHT]: 'gamma\n',
  [REOPENED]: 'alpha\nbeta\n',
  [RIGHT_REOPENED]: 'delta\r'
}
const FACTS: Record<string, Omit<TextFileFacts, 'path'>> = {
  [LEFT]: { encoding: 'UTF-16LE', newline: 'CRLF', bytes: 16, sha256: sha256Hex(TEXTS[LEFT]) },
  [RIGHT]: { encoding: 'GBK', newline: 'LF', bytes: 6, sha256: sha256Hex(TEXTS[RIGHT]) },
  [REOPENED]: { encoding: 'UTF-8 BOM', newline: 'Mixed', bytes: 11, sha256: sha256Hex(TEXTS[REOPENED]) },
  [RIGHT_REOPENED]: { encoding: 'UTF-16BE', newline: 'CR', bytes: 12, sha256: sha256Hex(TEXTS[RIGHT_REOPENED]) }
}
const LABEL_KEYS = ['shell.status.leftNewline', 'shell.status.leftEncoding', 'shell.status.rightNewline', 'shell.status.rightEncoding'] as const
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
})

afterEach(cleanup)

/** A memory port whose probe seam answers fixed facts and records every call. */
async function probePort(): Promise<{ port: PlatformPort; calls: string[] }> {
  const base = createWebPlatformPort()
  for (const [path, text] of Object.entries(TEXTS)) await base.writeTextFile(path, text)
  const calls: string[] = []
  return {
    calls,
    port: {
      ...base,
      probeTextFile: async (path) => {
        calls.push(path)
        return {
          path,
          ...(FACTS[path] ?? {
            encoding: 'Unknown' as const,
            newline: 'None' as const,
            bytes: 0,
            sha256: sha256Hex('')
          }),
          text: TEXTS[path] ?? ''
        }
      }
    }
  }
}

/** The four probe entries currently in the status layer, in DOM order. */
function probeEntries(labels: readonly string[]): { label: string; value: string }[] {
  const bar = document.querySelector<HTMLElement>('footer[data-shell-level="status"]')
  if (bar === null) throw new Error('missing status bar')
  return Array.from(bar.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => ({
      label: child.firstElementChild?.textContent ?? '',
      value: child.querySelector('.tabular')?.textContent ?? ''
    }))
    .filter((entry) => labels.includes(entry.label))
}

describe.each([
  ['zh', zh],
  ['en', en]
] as const)('code probe status bar (%s)', (language, dictionary) => {
  it('shows four literal values from a picked pair and keeps them through editing and a side reopen', async () => {
    const { port, calls } = await probePort()
    const queue = [LEFT, RIGHT, REOPENED, RIGHT_REOPENED]
    renderWithI18n(
      <Workbench platform={{ ...port, selectFile: async () => queue.shift() ?? null }} />,
      language
    )
    fireEvent.click(
      screen.getAllByRole('button', { name: dictionary['shell.toolbar.openFile'] })[0]
    )

    const labels = LABEL_KEYS.map((key) => dictionary[key])
    await waitFor(() =>
      expect(probeEntries(labels)).toEqual([
        { label: labels[0], value: 'CRLF' },
        { label: labels[1], value: 'UTF-16LE' },
        { label: labels[2], value: 'LF' },
        { label: labels[3], value: 'GBK' }
      ])
    )
    expect(calls).toEqual([LEFT, RIGHT])

    fireEvent.click(screen.getByRole('button', { name: dictionary['files.code.overwriteRight'] }))
    fireEvent.click(screen.getByRole('button', { name: dictionary['files.code.reset'] }))
    expect(probeEntries(labels).map((entry) => entry.value)).toEqual(['CRLF', 'UTF-16LE', 'LF', 'GBK'])

    // Replacing the left file changes only the left pair of values.
    fireEvent.click(screen.getByRole('button', { name: dictionary['files.action.openLeft'] }))
    await waitFor(() =>
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual(['Mixed', 'UTF-8 BOM', 'LF', 'GBK'])
    )

    // The right side is symmetric: only its own pair of values moves.
    fireEvent.click(screen.getByRole('button', { name: dictionary['files.action.openRight'] }))
    await waitFor(() =>
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual(['Mixed', 'UTF-8 BOM', 'CR', 'UTF-16BE'])
    )
    expect(calls).toEqual([LEFT, RIGHT, REOPENED, RIGHT_REOPENED])
  })

  it('shows the same values when the pair is typed into the manual dialog', async () => {
    const { port, calls } = await probePort()
    renderWithI18n(<Workbench platform={port} />, language)
    fireEvent.click(
      screen.getAllByRole('button', { name: dictionary['shell.toolbar.newCompare'] })[0]
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(dictionary['shell.compare.leftPath']), {
      target: { value: LEFT }
    })
    fireEvent.change(within(dialog).getByLabelText(dictionary['shell.compare.rightPath']), {
      target: { value: RIGHT }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: dictionary['shell.compare.submit'] }))
    const labels = LABEL_KEYS.map((key) => dictionary[key])
    await waitFor(() =>
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual(['CRLF', 'UTF-16LE', 'LF', 'GBK'])
    )
    expect(calls).toEqual([LEFT, RIGHT])
  })
})

describe('code probe status bar merge visibility', () => {
  it('hides the left/right entries in the merge view and restores the sample facts in diff view', async () => {
    const { port, calls } = await probePort()
    renderWithI18n(<Workbench platform={port} showDebugSamples />, 'zh')
    fireEvent.click(screen.getByRole('button', { name: zh['shell.settings.open'] }))
    const settings = screen.getByRole('dialog', { name: '设置' })
    fireEvent.click(settings.querySelector('[data-sample-entry="code"]') as HTMLElement)
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 5000 })

    expect(probeEntries(LABEL_KEYS.map((key) => zh[key]))).toEqual([])
    expect(calls).toEqual([])

    fireEvent.click(screen.getByRole('tab', { name: zh['files.code.mode.diff'] }))
    await waitFor(() =>
      expect(probeEntries(LABEL_KEYS.map((key) => zh[key])).map((entry) => entry.value)).toEqual([
        detectNewline(CODE_SCENE.diff.left.text),
        'UTF-8',
        detectNewline(CODE_SCENE.diff.right.text),
        'UTF-8'
      ])
    )
    expect(calls).toEqual([])
  })
})
