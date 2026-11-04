// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { detectNewline } from '@core/text/probe'
import { sha256Hex } from '@core/directory/hash'
import { CODE_SCENE } from '@shared/fixtures'
import type { PlatformPort, TextFileFacts } from '@shared/platform/types'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'
import { installJsdomViewport } from '../../../test/jsdomViewport'

const LEFT = '/memory/probe/left.ts'
const RIGHT = '/memory/probe/right.ts'
const REOPENED = '/memory/probe/reopened.ts'
const RIGHT_REOPENED = '/memory/probe/right-reopened.ts'
const SAME_LEFT = '/memory/probe/same-left.ts'
const SAME_RIGHT = '/memory/probe/same-right.ts'
const TEXTS: Record<string, string> = {
  [LEFT]: 'alpha\r\nbeta\r\n',
  [RIGHT]: 'gamma\n',
  [REOPENED]: 'alpha\nbeta\n',
  [RIGHT_REOPENED]: 'delta\r',
  [SAME_LEFT]: 'one\ntwo\n',
  [SAME_RIGHT]: 'one\nthree\n'
}
const FACTS: Record<string, Omit<TextFileFacts, 'path'>> = {
  [LEFT]: { encoding: 'UTF-16LE', newline: 'CRLF', bytes: 16, sha256: sha256Hex(TEXTS[LEFT]) },
  [RIGHT]: { encoding: 'GBK', newline: 'LF', bytes: 6, sha256: sha256Hex(TEXTS[RIGHT]) },
  [REOPENED]: { encoding: 'UTF-8 BOM', newline: 'Mixed', bytes: 11, sha256: sha256Hex(TEXTS[REOPENED]) },
  [RIGHT_REOPENED]: { encoding: 'UTF-16BE', newline: 'CR', bytes: 12, sha256: sha256Hex(TEXTS[RIGHT_REOPENED]) },
  [SAME_LEFT]: { encoding: 'UTF-8', newline: 'LF', bytes: 8, sha256: sha256Hex(TEXTS[SAME_LEFT]) },
  [SAME_RIGHT]: { encoding: 'UTF-8', newline: 'LF', bytes: 10, sha256: sha256Hex(TEXTS[SAME_RIGHT]) }
}
const LABEL_KEYS = ['shell.status.leftNewline', 'shell.status.leftEncoding', 'shell.status.rightNewline', 'shell.status.rightEncoding'] as const
installJsdomViewport()

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

function statusBar(): HTMLElement {
  const bar = document.querySelector<HTMLElement>('footer[data-shell-level="status"]')
  if (bar === null) throw new Error('missing status bar')
  return bar
}

/** Every label/value entry currently in the single-row status layer, in DOM order. */
function statusEntries(): { label: string; value: string }[] {
  return Array.from(statusBar().children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => {
      const labelElement = child.firstElementChild
      // A grouped wrapper (the right-aligned stat cluster) is not itself an entry.
      const label =
        labelElement !== null && labelElement.children.length === 0
          ? (labelElement.textContent ?? '')
          : ''
      return { label, value: child.querySelector('.tabular')?.textContent ?? '' }
    })
    .filter((entry) => entry.label !== '')
}

/** The status entries whose labels are named, in DOM order. */
function probeEntries(labels: readonly string[]): { label: string; value: string }[] {
  return statusEntries().filter((entry) => labels.includes(entry.label))
}

/** Opens the code view's single overflow menu and returns it. */
function openMoreMenu(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-shell-entry="more"]')
  if (trigger === null) throw new Error('missing more trigger')
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
  const menu = screen.queryByRole('menu')
  if (menu === null) throw new Error('more menu did not open')
  return menu
}

/** Runs one secondary code action through the overflow menu. */
function clickMore(label: string): void {
  fireEvent.click(
    within(openMoreMenu()).getByRole('menuitem', {
      name: (name: string) => name.includes(label)
    })
  )
}

describe.each([
  ['zh', zh],
  ['en', en]
] as const)('code probe status bar (%s)', (language, dictionary) => {
  it('shows the deduped probe facts from a picked pair and keeps them through editing and a side reopen', async () => {
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
    const [leftNewline, leftEncoding, rightNewline, rightEncoding] = labels
    await waitFor(() =>
      expect(probeEntries(labels)).toEqual([
        { label: leftNewline, value: 'CRLF' },
        { label: rightNewline, value: 'LF' },
        { label: leftEncoding, value: 'UTF-16LE' },
        { label: rightEncoding, value: 'GBK' }
      ])
    )
    expect(calls).toEqual([LEFT, RIGHT])

    // No engineering chrome: the bar keeps the scene measures and probe facts only.
    const bar = statusBar()
    expect(bar.querySelector('[data-shell-legend]')).toBeNull()
    const allowed = new Set([
      ...labels,
      dictionary['shell.stat.linesLeft'],
      dictionary['shell.stat.linesRight']
    ])
    for (const entry of statusEntries()) {
      expect(allowed.has(entry.label), entry.label).toBe(true)
    }
    expect(within(bar).getByText(dictionary['shell.stat.linesLeft'])).toBeDefined()
    expect(within(bar).getByText(dictionary['shell.stat.linesRight'])).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: dictionary['files.code.overwriteRight'] }))
    clickMore(dictionary['files.code.reset'])
    expect(probeEntries(labels).map((entry) => entry.value)).toEqual([
      'CRLF',
      'LF',
      'UTF-16LE',
      'GBK'
    ])

    // Replacing the left file changes only the left pair of values.
    clickMore(dictionary['files.action.openLeft'])
    await waitFor(() =>
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual([
        'Mixed',
        'LF',
        'UTF-8 BOM',
        'GBK'
      ])
    )

    // The right side is symmetric: only its own pair of values moves.
    clickMore(dictionary['files.action.openRight'])
    await waitFor(() =>
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual([
        'Mixed',
        'CR',
        'UTF-8 BOM',
        'UTF-16BE'
      ])
    )
    expect(calls).toEqual([LEFT, RIGHT, REOPENED, RIGHT_REOPENED])
  })

  it('shows equal encoding and newline once, and expands only a real difference', async () => {
    const { port, calls } = await probePort()
    const queue = [SAME_LEFT, SAME_RIGHT, LEFT, RIGHT]
    renderWithI18n(
      <Workbench platform={{ ...port, selectFile: async () => queue.shift() ?? null }} />,
      language
    )
    fireEvent.click(
      screen.getAllByRole('button', { name: dictionary['shell.toolbar.openFile'] })[0]
    )

    const newline = dictionary['shell.status.newline']
    const encoding = dictionary['shell.status.encoding']
    await waitFor(() =>
      expect(probeEntries([newline, encoding])).toEqual([
        { label: newline, value: 'LF' },
        { label: encoding, value: 'UTF-8' }
      ])
    )
    for (const key of LABEL_KEYS) {
      expect(statusEntries().some((entry) => entry.label === dictionary[key]), key).toBe(false)
    }

    // A genuinely different pair still expands into left / right labels.
    fireEvent.click(screen.getAllByRole('button', { name: dictionary['shell.toolbar.openFile'] })[0])
    const labels = LABEL_KEYS.map((key) => dictionary[key])
    await waitFor(() =>
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual([
        'CRLF',
        'LF',
        'UTF-16LE',
        'GBK'
      ])
    )
    expect(probeEntries([newline, encoding])).toEqual([])
    expect(calls).toEqual([SAME_LEFT, SAME_RIGHT, LEFT, RIGHT])
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
      expect(probeEntries(labels).map((entry) => entry.value)).toEqual([
        'CRLF',
        'LF',
        'UTF-16LE',
        'GBK'
      ])
    )
    expect(calls).toEqual([LEFT, RIGHT])
  })
})

describe('code probe status bar merge visibility', () => {
  it('hides the probe entries in the merge view and restores the deduped sample facts in diff view', async () => {
    const { port, calls } = await probePort()
    renderWithI18n(<Workbench platform={port} showDebugSamples />, 'zh')
    fireEvent.click(screen.getByRole('button', { name: zh['shell.settings.open'] }))
    const settings = screen.getByRole('dialog', { name: '设置' })
    fireEvent.click(settings.querySelector('[data-sample-entry="code"]') as HTMLElement)
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 5000 })

    expect(probeEntries(LABEL_KEYS.map((key) => zh[key]))).toEqual([])
    expect(probeEntries([zh['shell.status.newline'], zh['shell.status.encoding']])).toEqual([])
    expect(calls).toEqual([])

    fireEvent.click(screen.getByRole('tab', { name: zh['files.code.mode.diff'] }))
    await waitFor(() =>
      expect(
        probeEntries([zh['shell.status.newline'], zh['shell.status.encoding']])
      ).toEqual([
        { label: zh['shell.status.newline'], value: detectNewline(CODE_SCENE.diff.left.text) },
        { label: zh['shell.status.encoding'], value: 'UTF-8' }
      ])
    )
    expect(calls).toEqual([])
  })
})
