// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FileDiffStatus } from '@core/directory/compare'
import { DIFF_LABEL_KEYS, DIFF_STATUSES } from '@renderer/components/diffSemantics'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(() => {
  cleanup()
})

/** The four visible numbers of the first `CompositionLegend` on screen. */
function legendNumbers(): Record<FileDiffStatus, number> {
  const labels = DIFF_STATUSES.filter((status) => status !== 'conflict').map(
    (status) => zh[DIFF_LABEL_KEYS[status]]
  )
  const legend = Array.from(document.querySelectorAll<HTMLElement>('span')).find((span) => {
    const cells = Array.from(span.children)
    return (
      cells.length === labels.length &&
      labels.every((label, index) => cells[index]?.textContent?.includes(label) === true)
    )
  })
  if (!legend) throw new Error('no composition legend found')
  const counts = {} as Record<FileDiffStatus, number>
  Array.from(legend.children).forEach((cell, index) => {
    const status = DIFF_STATUSES[index] as FileDiffStatus
    counts[status] = Number(cell.querySelector('.tabular')?.textContent)
  })
  return counts
}

/** Opens a directory pair through the typed-path dialog (no native picker). */
async function openDirectoryPair(left: string, right: string): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: zh['shell.toolbar.newCompare'] })[0])
  const panel = await screen.findByRole('dialog')
  fireEvent.change(within(panel).getByLabelText(zh['shell.compare.leftPath']), {
    target: { value: left }
  })
  fireEvent.change(within(panel).getByLabelText(zh['shell.compare.rightPath']), {
    target: { value: right }
  })
  fireEvent.click(within(panel).getByRole('button', { name: zh['shell.compare.submit'] }))
}

describe('directory sync refresh failure', () => {
  it('says the write completed, closes the applied preview and keeps the session', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/refresh-left/same.txt', 'same\n')
    await base.writeTextFile('/memory/refresh-right/same.txt', 'same\n')
    await base.writeTextFile('/memory/refresh-left/new.txt', 'left only\n')

    // The first planned write lands, then the refresh re-read is refused. The
    // injected message carries the IPC wrapper, which must never reach the user.
    let written = false
    const refreshFailure = (path: string): Error =>
      new Error(
        `Error invoking remote method 'platform:list-directory': Error: ` +
          `无法读取目录 ${path}：没有访问权限（EACCES）。`
      )
    const port = {
      ...base,
      writeTextFile: async (path: string, content: string, modifiedMs?: number) => {
        await base.writeTextFile(path, content, modifiedMs)
        written = true
      },
      listDirectory: async (path: string) => {
        if (written) throw refreshFailure(path)
        return base.listDirectory(path)
      },
      listDirectories: async (paths: readonly string[]) => {
        if (written) throw refreshFailure(paths[0] ?? '')
        return base.listDirectories(paths)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair('/memory/refresh-left', '/memory/refresh-right')

    const previewButton = await screen.findByRole(
      'button',
      { name: zh['directory.toolbar.previewSync'] },
      { timeout: 30_000 }
    )
    await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
    // The pre-sync session state: one identical pair and one left-only file.
    expect(legendNumbers()).toMatchObject({ same: 1, added: 0, removed: 1, modified: 0 })

    fireEvent.click(previewButton)
    const dialog = await screen.findByRole('dialog')
    const apply = within(dialog).getByRole('button', { name: zh['directory.sync.apply'] })
    await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(apply)

    const notice = await screen.findByRole('alert', {}, { timeout: 30_000 })
    const text = notice.textContent ?? ''
    expect(text).toContain('写入已完成')
    expect(text).toContain('新增拷贝 1')
    expect(text).toContain('无法读取目录')
    expect(text).toContain('EACCES')
    expect(text).not.toContain('Error invoking remote method')
    expect(notice.className).toContain('text-danger')

    // The applied preview is gone: the same landed plan cannot be confirmed again.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['directory.sync.apply'] })).toBeNull()

    // The current session is kept (still the pre-write tree), and the file really
    // landed on disk — only the refresh failed.
    expect(screen.getByRole('tab', { name: /refresh-left ↔ refresh-right/ })).toBeDefined()
    // A refreshed session would show `same: 2`; the kept session still shows the
    // pre-write split, which is exactly "the current session was not replaced".
    expect(legendNumbers()).toMatchObject({ same: 1, added: 0, removed: 1, modified: 0 })
    await expect(base.exists('/memory/refresh-right/new.txt')).resolves.toBe(true)
  }, 60_000)
})
