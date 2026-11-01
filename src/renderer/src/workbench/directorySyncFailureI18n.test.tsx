// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { en } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

const HAN = /\p{Script=Han}/u
const IPC_WRAPPER = 'Error invoking remote method'

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

/** A real Node-style refusal on the target so the core wraps it with its code. */
function refusal(code: string): Error {
  return Object.assign(new Error(`${code}: permission denied`), { code })
}

/** Opens a directory pair through the typed-path dialog (no native picker). */
async function openDirectoryPair(left: string, right: string): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: en['shell.toolbar.newCompare'] })[0])
  const panel = await screen.findByRole('dialog')
  fireEvent.change(within(panel).getByLabelText(en['shell.compare.leftPath']), {
    target: { value: left }
  })
  fireEvent.change(within(panel).getByLabelText(en['shell.compare.rightPath']), {
    target: { value: right }
  })
  fireEvent.click(within(panel).getByRole('button', { name: en['shell.compare.submit'] }))
}

/** Clicks preview, then the apply action inside the dry-run dialog. */
async function applySync(): Promise<HTMLElement> {
  const previewButton = await screen.findByRole(
    'button',
    { name: en['directory.toolbar.previewSync'] },
    { timeout: 30_000 }
  )
  await waitFor(() => expect((previewButton as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(previewButton)

  const dialog = await screen.findByRole('dialog')
  const apply = within(dialog).getByRole('button', { name: en['directory.sync.apply'] })
  await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(apply)
  return screen.findByRole('alert', {}, { timeout: 30_000 })
}

describe('sync failure localization', () => {
  it('renders an EACCES write refusal in English without Chinese file-system detail', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/i18n-left/same.txt', 'same\n')
    await base.writeTextFile('/memory/i18n-right/same.txt', 'same\n')
    await base.writeTextFile('/memory/i18n-left/a.txt', 'a\n')

    const port = {
      ...base,
      checkWritable: async () => {
        throw refusal('EACCES')
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'en')
    await openDirectoryPair('/memory/i18n-left', '/memory/i18n-right')

    const notice = await applySync()
    const text = notice.textContent ?? ''
    expect(text).toContain('Could not sync to the target')
    expect(text).toContain('/memory/i18n-right')
    expect(text).toContain('EACCES')
    expect(text).toContain('permission denied')
    expect(text).not.toMatch(HAN)
    expect(text).not.toContain(IPC_WRAPPER)
    expect(notice.className).toContain('text-danger')

    // Nothing was written and the same preview is retryable.
    expect(screen.getByRole('dialog')).toBeDefined()
    const apply = within(screen.getByRole('dialog')).getByRole('button', {
      name: en['directory.sync.apply']
    })
    expect((apply as HTMLButtonElement).disabled).toBe(false)
    await expect(base.exists('/memory/i18n-right/a.txt')).resolves.toBe(false)
  }, 60_000)

  it('renders a failed refresh after a landed write in English without Chinese detail', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/refresh-i18n-left/same.txt', 'same\n')
    await base.writeTextFile('/memory/refresh-i18n-right/same.txt', 'same\n')
    await base.writeTextFile('/memory/refresh-i18n-left/new.txt', 'left only\n')

    let written = false
    const platformDetail = (path: string): Error =>
      new Error(`${IPC_WRAPPER} 'platform:list-directory': Error: 无法读取目录 ${path}：没有访问权限（EACCES）。`)
    const port = {
      ...base,
      writeFileBytes: async (path: string, content: Uint8Array, modifiedMs?: number) => {
        await base.writeFileBytes(path, content, modifiedMs)
        written = true
      },
      listDirectory: async (path: string) => {
        if (written) throw platformDetail(path)
        return base.listDirectory(path)
      },
      listDirectories: async (paths: readonly string[]) => {
        if (written) throw platformDetail(paths[0] ?? '')
        return base.listDirectories(paths)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'en')
    await openDirectoryPair('/memory/refresh-i18n-left', '/memory/refresh-i18n-right')

    const notice = await applySync()
    const text = notice.textContent ?? ''
    expect(text).toContain('Sync writes completed')
    expect(text).toContain('EACCES')
    expect(text).toContain('permission denied')
    expect(text).not.toMatch(HAN)
    expect(text).not.toContain(IPC_WRAPPER)
    expect(notice.className).toContain('text-danger')

    // The applied preview is closed; the written file really landed.
    expect(screen.queryByRole('dialog')).toBeNull()
    await expect(base.exists('/memory/refresh-i18n-right/new.txt')).resolves.toBe(true)
  }, 60_000)
})
