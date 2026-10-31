// @vitest-environment jsdom
/**
 * Renderer-level proof of the "only the link mtime differs" path: the preview the
 * user actually opens must offer an enabled Apply, say how many links are pending,
 * and report the aligned count in the completion notice instead of pretending the
 * run did nothing.
 *
 * The in-memory web platform has no symbolic links, so this port adds one link pair
 * per side to the directory listing and records every link-time write. Everything
 * else — comparison, plan, dialog and notice — is the production code path.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { DirectoryEntry, DirectoryListing, PlatformPort } from '@shared/platform/types'
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

const LEFT = '/memory/link-left'
const RIGHT = '/memory/link-right'
const LINK_NAME = 'same-target-link'
const SOURCE_STAMP = 1_700_001_000_000
const TARGET_STAMP = 1_800_001_000_000
const SHARED_STAMP = 1_700_000_700_000

function linkEntry(root: string, modifiedMs: number): DirectoryEntry {
  return {
    name: LINK_NAME,
    path: `${root}/${LINK_NAME}`,
    isDirectory: false,
    size: 0,
    modifiedMs,
    isSymbolicLink: true,
    linkTarget: 'shared.txt',
    linkTargetKind: 'file'
  }
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

describe('directory sync link alignment', () => {
  it('offers Apply for a link-only preview and reports the aligned count', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile(`${LEFT}/shared.txt`, 'shared\n', SHARED_STAMP)
    await base.writeTextFile(`${RIGHT}/shared.txt`, 'shared\n', SHARED_STAMP)

    const links = new Map<string, DirectoryEntry[]>([
      [LEFT, [linkEntry(LEFT, SOURCE_STAMP)]],
      [RIGHT, [linkEntry(RIGHT, TARGET_STAMP)]]
    ])
    const linkWrites: string[] = []
    const port: PlatformPort = {
      ...base,
      listDirectory: async (path) => [...(await base.listDirectory(path)), ...(links.get(path) ?? [])],
      listDirectories: async (paths, options) => {
        const listings = await base.listDirectories(paths, options)
        return listings.map<DirectoryListing>((listing) =>
          listing.ok
            ? { ...listing, entries: [...listing.entries, ...(links.get(listing.path) ?? [])] }
            : listing
        )
      },
      setSymbolicLinkModifiedMs: async (path, modifiedMs) => {
        linkWrites.push(`${path}:${modifiedMs}`)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair(LEFT, RIGHT)

    const previewButton = await screen.findByRole(
      'button',
      { name: zh['directory.toolbar.previewSync'] },
      { timeout: 30_000 }
    )
    await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(previewButton)

    const dialog = await screen.findByRole('dialog')
    const apply = within(dialog).getByRole('button', { name: zh['directory.sync.apply'] })
    // Only the link mtime differs: the dialog must still be executable, list the
    // pending link and never claim the direction is already in sync.
    await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false))
    expect(within(dialog).getByText(zh['directory.sync.group.align'])).toBeDefined()
    expect(within(dialog).getByText(LINK_NAME)).toBeDefined()
    expect(within(dialog).queryByText(zh['directory.sync.empty'])).toBeNull()

    fireEvent.click(apply)

    const notice = await screen.findByRole('alert', {}, { timeout: 30_000 })
    const text = notice.textContent ?? ''
    expect(text).toContain('同步完成')
    expect(text).toContain('对齐链接时间 1')
    // The completion notice reflects the real write: one link time, nothing else.
    expect(text).toContain('新增拷贝 0')
    expect(text).toContain('覆盖 0')
    expect(text).toContain('删除 0')
    expect(linkWrites).toEqual([`${RIGHT}/${LINK_NAME}:${SOURCE_STAMP}`])
  }, 60_000)
})
