// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FileDiffStatus } from '@core/directory/compare'
import { DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import { DIFF_LABEL_KEYS, DIFF_STATUSES } from '@renderer/components/diffSemantics'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { FILTER_LABEL_KEYS } from '@renderer/views/directoryCopy'
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

/** Left-hand tree of the open directory session. */
function leftTree(): HTMLElement {
  return screen.getAllByRole('tree')[0]
}

function treeItem(title: string): HTMLElement {
  const row = within(leftTree())
    .getAllByRole('treeitem')
    .find((item) => item.getAttribute('title') === title)
  if (!row) throw new Error(`no tree item titled ${title}`)
  return row
}

function filterTab(filter: 'differences'): HTMLElement {
  const group = screen.getByRole('tablist', { name: zh['directory.filter.group'] })
  return within(group).getByRole('tab', { name: zh[FILTER_LABEL_KEYS[filter]] })
}

/** Target-side entry names, sorted: proves both the restore and the no-temp-file rule. */
async function entryNames(
  port: ReturnType<typeof createWebPlatformPort>,
  root: string
): Promise<string[]> {
  return (await port.listDirectory(root)).map((entry) => entry.name).sort()
}

/** The zh apply action, looked up inside the open sync preview. */
function applyButton(dialog: HTMLElement): HTMLButtonElement {
  return within(dialog).getByRole('button', { name: zh['directory.sync.apply'] }) as HTMLButtonElement
}

const SYSTEM_CODE = /EACCES|EPERM|EISDIR|EROFS|EBUSY|ENOTDIR/

describe('directory sync cancel and failure recovery', () => {
  it('aborts through the dialog cancel, rolls back and keeps session, preview, filter and row', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/cancel-left/same.txt', 'same\n')
    await base.writeTextFile('/memory/cancel-right/same.txt', 'same\n')
    await base.writeTextFile('/memory/cancel-left/a.txt', 'a\n')
    await base.writeTextFile('/memory/cancel-left/b.txt', 'b\n')
    await base.writeTextFile('/memory/cancel-left/c.txt', 'c\n')

    // The second planned write hangs until the dialog cancel was clicked and the
    // test releases it; the loop then observes the abort and rolls back.
    let writes = 0
    let releaseSecondWrite = (): void => undefined
    const secondWriteHeld = new Promise<void>((resolve) => {
      releaseSecondWrite = resolve
    })
    let secondWriteStarted = (): void => undefined
    const started = new Promise<void>((resolve) => {
      secondWriteStarted = resolve
    })
    const attempted: string[] = []
    const port = {
      ...base,
      writeTextFile: async (path: string, content: string, modifiedMs?: number) => {
        writes += 1
        attempted.push(path)
        if (writes === 2) {
          secondWriteStarted()
          await secondWriteHeld
        }
        await base.writeTextFile(path, content, modifiedMs)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair('/memory/cancel-left', '/memory/cancel-right')

    const previewButton = await screen.findByRole(
      'button',
      { name: zh['directory.toolbar.previewSync'] },
      { timeout: 30_000 }
    )
    await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
    expect(legendNumbers()).toMatchObject({ same: 1, added: 0, removed: 3, modified: 0 })

    // A non-default filter and one selected row must both survive the cancel.
    fireEvent.click(filterTab('differences'))
    expect(filterTab('differences').getAttribute('aria-selected')).toBe('true')
    fireEvent.click(treeItem('a.txt'))
    expect(treeItem('a.txt').getAttribute('aria-selected')).toBe('true')
    const tabBefore = screen.getByRole('tab', { name: /cancel-left ↔ cancel-right/ }).textContent
    const countsBefore = legendNumbers()

    fireEvent.click(previewButton)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(applyButton(dialog).disabled).toBe(false))
    fireEvent.click(applyButton(dialog))

    // The run is in flight on the second write: cancel is still usable.
    await started
    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.cancel'] }))
    releaseSecondWrite()

    const notice = await screen.findByRole('alert', {}, { timeout: 30_000 })
    const text = notice.textContent ?? ''
    expect(text).toContain('同步已取消')
    expect(text).toContain('已回滚')
    expect(text).not.toContain('Error invoking remote method')
    expect(text).not.toMatch(SYSTEM_CODE)

    // The target side is back to its pre-run state: no partial tree, no temp file.
    expect(await entryNames(base, '/memory/cancel-right')).toEqual(['same.txt'])
    expect(attempted.length).toBe(2)
    for (const path of attempted) {
      await expect(base.exists(path)).resolves.toBe(false)
    }

    // Same session, same four-way counts, same filter, same selected row.
    expect(screen.getByRole('tab', { name: /cancel-left ↔ cancel-right/ }).textContent).toBe(
      tabBefore
    )
    expect(legendNumbers()).toEqual(countsBefore)
    expect(filterTab('differences').getAttribute('aria-selected')).toBe('true')
    expect(treeItem('a.txt').getAttribute('aria-selected')).toBe('true')

    // The preview never closed and the same plan is retryable.
    const keptDialog = screen.getByRole('dialog')
    expect(applyButton(keptDialog).disabled).toBe(false)
    expect(applyButton(keptDialog).textContent).toBe(zh['directory.sync.apply'])
    expect((previewButton as HTMLButtonElement).disabled).toBe(false)
  }, 60_000)

  it('shows a readable failure, keeps the rolled-back target and the session, and resets busy', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/fail-left/same.txt', 'same\n')
    await base.writeTextFile('/memory/fail-right/same.txt', 'same\n')
    await base.writeTextFile('/memory/fail-left/a.txt', 'a\n')
    await base.writeTextFile('/memory/fail-left/b.txt', 'b\n')
    await base.writeTextFile('/memory/fail-left/c.txt', 'c\n')

    let writes = 0
    let failingPath = ''
    const port = {
      ...base,
      writeTextFile: async (path: string, content: string, modifiedMs?: number) => {
        writes += 1
        if (writes === 2) {
          failingPath = path
          throw new Error(
            `Error invoking remote method 'platform:write-text-file': Error: ` +
              `无法写入文件 ${path}：没有访问权限（EACCES）。`
          )
        }
        await base.writeTextFile(path, content, modifiedMs)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair('/memory/fail-left', '/memory/fail-right')

    const previewButton = await screen.findByRole(
      'button',
      { name: zh['directory.toolbar.previewSync'] },
      { timeout: 30_000 }
    )
    await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
    const tabBefore = screen.getByRole('tab', { name: /fail-left ↔ fail-right/ }).textContent
    const countsBefore = legendNumbers()

    fireEvent.click(previewButton)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(applyButton(dialog).disabled).toBe(false))
    fireEvent.click(applyButton(dialog))

    const notice = await screen.findByRole('alert', {}, { timeout: 30_000 })
    const text = notice.textContent ?? ''
    expect(text).toContain(failingPath)
    expect(text).toContain('EACCES')
    expect(text).not.toContain('Error invoking remote method')
    expect(notice.className).toContain('text-danger')

    // The first write was undone: the target holds only its pre-run file.
    expect(await entryNames(base, '/memory/fail-right')).toEqual(['same.txt'])

    // The session was neither replaced nor cleared, and the preview stays retryable.
    expect(screen.getByRole('tab', { name: /fail-left ↔ fail-right/ }).textContent).toBe(tabBefore)
    expect(legendNumbers()).toEqual(countsBefore)
    const keptDialog = screen.getByRole('dialog')
    expect(applyButton(keptDialog).disabled).toBe(false)
    expect((previewButton as HTMLButtonElement).disabled).toBe(false)
  }, 60_000)

  it('retries the same preview after a failure and replaces the session on success', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/retry-left/same.txt', 'same\n')
    await base.writeTextFile('/memory/retry-right/same.txt', 'same\n')
    await base.writeTextFile('/memory/retry-left/a.txt', 'a\n')
    await base.writeTextFile('/memory/retry-left/b.txt', 'b\n')
    await base.writeTextFile('/memory/retry-left/c.txt', 'c\n')

    let writes = 0
    let failedOnce = false
    const port = {
      ...base,
      writeTextFile: async (path: string, content: string, modifiedMs?: number) => {
        writes += 1
        if (writes === 2 && !failedOnce) {
          failedOnce = true
          throw new Error(
            `Error invoking remote method 'platform:write-text-file': Error: ` +
              `无法写入文件 ${path}：没有访问权限（EACCES）。`
          )
        }
        await base.writeTextFile(path, content, modifiedMs)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair('/memory/retry-left', '/memory/retry-right')

    const previewButton = await screen.findByRole(
      'button',
      { name: zh['directory.toolbar.previewSync'] },
      { timeout: 30_000 }
    )
    await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
    expect(legendNumbers()).toMatchObject({ same: 1, added: 0, removed: 3, modified: 0 })

    fireEvent.click(previewButton)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(applyButton(dialog).disabled).toBe(false))
    fireEvent.click(applyButton(dialog))
    await screen.findByRole('alert', {}, { timeout: 30_000 })

    // Same preview, second attempt: every write succeeds this time.
    const keptDialog = screen.getByRole('dialog')
    await waitFor(() => expect(applyButton(keptDialog).disabled).toBe(false))
    fireEvent.click(applyButton(keptDialog))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 30_000 })
    const notice = screen.getByRole('alert')
    expect(notice.textContent ?? '').toContain('同步完成')

    // The refreshed comparison replaced the session: all four files are identical.
    expect(legendNumbers()).toMatchObject({ same: 4, added: 0, removed: 0, modified: 0 })
    expect(await entryNames(base, '/memory/retry-right')).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
      'same.txt'
    ])
  }, 60_000)

  it('reports a dry-run read failure without the IPC wrapper and without opening a preview', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/dry-left/only.txt', 'only\n')

    // A read-only target is previewed against a writable sandbox, so this dry-run
    // still has to reach the platform before it can hand the user a plan. That call
    // is refused here with the directory-read reason every sync channel produces,
    // IPC wrapper included: the preview catch must never show that wrapper.
    let broken = false
    const readFailure = (path: string): Error =>
      new Error(
        `Error invoking remote method 'platform:list-directory': Error: ` +
          `无法读取目录 ${path}：没有访问权限（EACCES）。`
      )
    const port = {
      ...base,
      temporaryDirectory: async () => {
        if (broken) throw readFailure(DIRECTORY_SAMPLE_PATHS.right)
        return base.temporaryDirectory()
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair('/memory/dry-left', DIRECTORY_SAMPLE_PATHS.right)

    const previewButton = await screen.findByRole(
      'button',
      { name: zh['directory.toolbar.previewSync'] },
      { timeout: 30_000 }
    )
    await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
    broken = true
    fireEvent.click(previewButton)

    const notice = await screen.findByRole('alert', {}, { timeout: 30_000 })
    const text = notice.textContent ?? ''
    expect(text).toContain('无法读取目录')
    expect(text).toContain('EACCES')
    expect(text).not.toContain('Error invoking remote method')
    expect(notice.className).toContain('text-danger')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((previewButton as HTMLButtonElement).disabled).toBe(false)
  }, 60_000)
})
