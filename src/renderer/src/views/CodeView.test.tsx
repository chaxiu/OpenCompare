// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JSX } from 'react'
import type { CodeSceneFixture } from '@shared/fixtures'
import type { Language, PlatformPort } from '@shared/platform/types'
import { I18nProvider } from '@renderer/i18n/I18nProvider'
import { useI18n } from '@renderer/i18n/context'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { textFileFilter } from '@renderer/workbench/fileIO'
import { CodeView } from './CodeView'
import type { CodeMergeState } from './CodeView'

/** Test-only probe: switches the provider language from inside the tree. */
function LanguageSwitch({ to }: { readonly to: Language }): JSX.Element {
  const { setLanguage } = useI18n()
  return (
    <button type="button" onClick={() => setLanguage(to)}>
      switch-language
    </button>
  )
}

// Saving also triggers a browser download; jsdom must not try to navigate.
beforeEach(() => {
  URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn<(url: string) => void>(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const platform = createWebPlatformPort()

/** Drives the web runtime's hidden file picker with a chosen local file. */
function chooseFile(name: string, text: string): void {
  const input = document.querySelector<HTMLInputElement>('input[data-opencompare-picker="file"]')
  if (!input) throw new Error('no open-file input was created')
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/plain' })] } })
}

const FIXTURE: CodeSceneFixture = {
  scene: 'code',
  composition: { same: 0, added: 0, removed: 0, modified: 0, conflict: 2 },
  diff: {
    left: { path: '/samples/left.ts', text: 'alpha\n  color: red\nbeta\n' },
    right: { path: '/samples/right.ts', text: 'alpha\n  color: RED\nbeta\ngamma\n' }
  },
  merge: {
    base: { path: '/samples/base.ts', text: 'head\nbase-1\nmid\nbase-2\ntail\n' },
    ours: { path: '/samples/ours.ts', text: 'head\nours-1\nmid\nours-2\ntail\n' },
    theirs: { path: '/samples/theirs.ts', text: 'head\ntheirs-1\nmid\ntheirs-2\ntail\n' }
  }
}

describe('two-column diff', () => {
  it('highlights inline characters, navigates blocks and overwrites one side', () => {
    render(<CodeView fixture={FIXTURE} defaultMode="diff" platform={platform} />)

    expect(screen.getByText('1/2')).toBeDefined()
    // only the changed fragment is coloured, not the whole line
    expect(screen.getByText('red')).toBeDefined()
    expect(screen.getByText('RED')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(screen.getByText('2/2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(screen.getByText('1/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.queryByText('red')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('red')).toBeDefined()
  })
})

describe('three-way merge', () => {
  it('counts conflicts, resolves block by block and unlocks export', () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />)

    expect(screen.getByText('2/2')).toBeDefined()
    expect(screen.getAllByText('<<<<<<< ours')).toHaveLength(2)
    expect((screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement).disabled).toBe(
      true
    )

    // Accept Both on the first conflict
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('已采纳 ours + theirs')).toBeDefined()

    // Navigate to the second conflict and resolve it to ours
    fireEvent.click(screen.getByRole('button', { name: '下一个冲突块' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(screen.getByText('0/2')).toBeDefined()
    expect(screen.getByText('已采纳 ours')).toBeDefined()
    expect(screen.queryAllByText('<<<<<<< ours')).toHaveLength(0)
    expect(
      (screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('reports the runtime conflict count to the workbench', () => {
    const states: CodeMergeState[] = []
    render(
      <CodeView
        fixture={FIXTURE}
        defaultMode="merge"
        platform={platform}
        onMergeStateChange={(state) => states.push(state)}
      />
    )

    expect(states.at(-1)).toEqual({ unresolved: 2, total: 2 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(states.at(-1)).toEqual({ unresolved: 1, total: 2 })
  })
})

describe('local file entry points', () => {
  it('opens a local file on one diff side and re-runs the comparison', async () => {
    render(<CodeView fixture={FIXTURE} defaultMode="diff" platform={platform} />)
    expect(screen.getByText('1/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))
    chooseFile('left.ts', FIXTURE.diff.right.text)

    // Identical bodies: the difference blocks collapse and the panel follows the path.
    await waitFor(() => expect(screen.getByText('0/0')).toBeDefined())
    expect(screen.getByText('/memory/left.ts')).toBeDefined()
    expect(await screen.findByText(/已打开 \/memory\/left\.ts/)).toBeDefined()
  })

  it('opens a local file into a merge side and rebuilds the conflict list', async () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />)
    expect(screen.getByText('2/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开 ours' }))
    chooseFile('ours.ts', FIXTURE.merge.base.text)

    // ours now matches base, so only theirs changes and nothing stays in conflict.
    await waitFor(() => expect(screen.getByText('0/0')).toBeDefined())
    expect(screen.getByText('/memory/ours.ts')).toBeDefined()
    expect(await screen.findByText('无冲突块。')).toBeDefined()
  })

  it('saves the resolved merge result through the platform file dialog', async () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    fireEvent.click(screen.getByRole('button', { name: '下一个冲突块' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])

    const exportButton = screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement
    expect(exportButton.disabled).toBe(false)
    fireEvent.click(exportButton)

    expect(await screen.findByText(/已保存到 \/memory\/merged\.txt/)).toBeDefined()
    expect(await platform.readTextFile('/memory/merged.txt')).toContain('ours-1')
  })
})

describe('in-place save and dirty marker', () => {
  const PAIR = {
    left: { path: '/memory/left.ts', text: 'alpha\nbeta\n' },
    right: { path: '/memory/right.ts', text: 'alpha\ngamma\n' }
  }

  it('marks the overwritten side dirty and clears it on reset', () => {
    render(<CodeView pair={PAIR} platform={createWebPlatformPort()} />)

    expect(screen.queryByText('已修改（未保存）')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))

    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(screen.getAllByText('已修改（未保存）')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '保存右文件' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: '保存左文件' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.queryByText('未保存：右')).toBeNull()
    expect(screen.queryByText('已修改（未保存）')).toBeNull()
  })

  it('writes a modified side back in place without opening a save dialog', async () => {
    const base = createWebPlatformPort()
    const writes: { path: string; content: string }[] = []
    const saveFile = vi.fn(async () => '/should/not/be/used.txt')
    const port: PlatformPort = {
      ...base,
      saveFile,
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push({ path, content })
        await base.writeTextFile(path, content, modifiedMs)
      }
    }
    render(<CodeView pair={PAIR} platform={port} />)

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    fireEvent.click(screen.getByRole('button', { name: '保存右文件' }))

    expect(await screen.findByText(/已写回 \/memory\/right\.ts/)).toBeDefined()
    expect(writes).toEqual([{ path: '/memory/right.ts', content: 'alpha\nbeta\n' }])
    expect(saveFile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('已修改（未保存）')).toBeNull())
    // Disk now holds exactly the modified working text at the loaded path.
    expect(await base.readTextFile('/memory/right.ts')).toBe('alpha\nbeta\n')
    expect(screen.getAllByText('/memory/right.ts').length).toBeGreaterThan(0)
  })

  it('writes the left side back to its loaded path', async () => {
    const base = createWebPlatformPort()
    const writes: { path: string; content: string }[] = []
    const saveFile = vi.fn(async () => '/should/not/be/used.txt')
    const port: PlatformPort = {
      ...base,
      saveFile,
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push({ path, content })
        await base.writeTextFile(path, content, modifiedMs)
      }
    }
    render(<CodeView pair={PAIR} platform={port} />)

    fireEvent.click(screen.getByRole('button', { name: '覆写到左' }))
    fireEvent.click(screen.getByRole('button', { name: '保存左文件' }))

    expect(await screen.findByText(/已写回 \/memory\/left\.ts/)).toBeDefined()
    expect(writes).toEqual([{ path: '/memory/left.ts', content: 'alpha\ngamma\n' }])
    expect(saveFile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('已修改（未保存）')).toBeNull())
    expect(await base.readTextFile('/memory/left.ts')).toBe('alpha\ngamma\n')
    expect(screen.getAllByText('/memory/left.ts').length).toBeGreaterThan(0)
  })

  it('reports a rejected write to a read-only sample path and keeps the dirty flag', async () => {
    const saveFile = vi.fn(async () => '/should/not/be/used.txt')
    render(
      <CodeView
        fixture={FIXTURE}
        defaultMode="diff"
        platform={{ ...createWebPlatformPort(), saveFile }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    fireEvent.click(screen.getByRole('button', { name: '保存右文件' }))

    expect(await screen.findByText(/不能写入/)).toBeDefined()
    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(saveFile).not.toHaveBeenCalled()
  })
})


const TWO_BLOCK_PAIR = {
  left: { path: '/memory/left.ts', text: 'alpha\nbeta\nleft-only\n' },
  right: { path: '/memory/right.ts', text: 'right-only\nbeta\ngamma\n' }
}

describe('unsaved side labels', () => {
  it('names exactly the dirty sides in Chinese', () => {
    render(<CodeView pair={TWO_BLOCK_PAIR} platform={createWebPlatformPort()} />)

    fireEvent.click(screen.getByRole('button', { name: '覆写到左' }))
    expect(screen.getByText('未保存：左')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(screen.getByText('未保存：右')).toBeDefined()

    // The remaining block is copied back to the left, so both sides diverge now.
    fireEvent.click(screen.getByRole('button', { name: '覆写到左' }))
    expect(screen.getByText('未保存：左、右')).toBeDefined()
  })

  it('names exactly the dirty sides in English', () => {
    renderWithI18n(
      <CodeView pair={TWO_BLOCK_PAIR} platform={createWebPlatformPort()} />,
      'en'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to left' }))
    expect(screen.getByText('Unsaved: left')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to right' }))
    expect(screen.getByText('Unsaved: right')).toBeDefined()
    expect(screen.getByText('Modified (unsaved)')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to left' }))
    expect(screen.getByText('Unsaved: both')).toBeDefined()
  })
})

describe('English diff copy', () => {
  it('renders the toolbar, panel subtitles and picker titles in English', () => {
    const selectFile = vi.fn(async () => null)
    const port: PlatformPort = { ...createWebPlatformPort(), selectFile }
    const { container } = renderWithI18n(
      <CodeView fixture={FIXTURE} defaultMode="diff" platform={port} />,
      'en'
    )

    expect(screen.getByRole('button', { name: 'Previous difference' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Next difference' })).toBeDefined()
    expect(screen.getByText('Difference blocks')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Overwrite to right' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Overwrite to left' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDefined()
    expect(screen.getByText('left')).toBeDefined()
    expect(screen.getByText('right')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open left file' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open right file' })).toBeDefined()

    const saveLeft = screen.getByRole('button', { name: 'Save left file' })
    expect(saveLeft.getAttribute('title')).toBe(
      'Write the left edits back to their disk path in place (no save dialog)'
    )
    expect(screen.getByRole('button', { name: 'Save right file' }).getAttribute('title')).toBe(
      'Write the right edits back to their disk path in place (no save dialog)'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open left file' }))
    expect(selectFile).toHaveBeenCalledWith({ title: 'Open left local file', filters: [textFileFilter('Code / text')] })
    expect(screen.getByText('1/2')).toBeDefined()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })

  it('keeps the Chinese picker title for the left side', () => {
    const selectFile = vi.fn(async () => null)
    render(
      <CodeView
        fixture={FIXTURE}
        defaultMode="diff"
        platform={{ ...createWebPlatformPort(), selectFile }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))
    expect(selectFile).toHaveBeenCalledWith({
      title: '打开左侧本地文件',
      filters: [textFileFilter('代码 / 文本')]
    })
  })

  it('reports the write-back notice in English and keeps raw failures', async () => {
    const base = createWebPlatformPort()
    const writes: { path: string; content: string }[] = []
    const port: PlatformPort = {
      ...base,
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push({ path, content })
        await base.writeTextFile(path, content, modifiedMs)
      }
    }
    renderWithI18n(<CodeView pair={TWO_BLOCK_PAIR} platform={port} />, 'en')

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save right file' }))

    expect(await screen.findByText('Wrote back /memory/right.ts')).toBeDefined()
    expect(writes).toHaveLength(1)

    // A rejected write keeps the platform message verbatim in English too, so
    // both dictionaries show the exact same raw detail.
    cleanup()
    renderWithI18n(
      <CodeView fixture={FIXTURE} defaultMode="diff" platform={createWebPlatformPort()} />,
      'en'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save right file' }))
    expect(await screen.findByText(/不能写入/)).toBeDefined()
  })
})

describe('English merge copy', () => {
  it('renders the conflict navigation and resolution copy in English', () => {
    const { container } = renderWithI18n(
      <CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />,
      'en'
    )

    expect(screen.getByRole('button', { name: 'Previous conflict' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Next conflict' })).toBeDefined()
    expect(screen.getByText('Pending conflicts')).toBeDefined()
    expect(screen.getByText('2/2')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open base' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open ours' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open theirs' })).toBeDefined()
    expect(screen.getByText('Merge result preview')).toBeDefined()
    expect(screen.getByText('Conflict 1')).toBeDefined()
    expect(screen.getAllByText('Unresolved')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Accept Ours' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Accept Theirs' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Accept Both' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Accept Base' }).length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: 'Copy' }) as HTMLButtonElement).disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Export merged text' }) as HTMLButtonElement).disabled
    ).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('Accepted ours + theirs')).toBeDefined()
    // The per-block buttons follow the recorded resolution.
    const conflictRow = screen.getByText('Conflict 1').closest('div') as HTMLElement
    expect(
      within(conflictRow).getByRole('button', { name: 'Accept Both' }).className
    ).toContain('bg-accent')
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })

  it('shows the English empty conflict list once the merge is clean', async () => {
    renderWithI18n(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />, 'en')

    fireEvent.click(screen.getByRole('button', { name: 'Open ours' }))
    chooseFile('ours.ts', FIXTURE.merge.base.text)

    expect(await screen.findByText('No conflict blocks.')).toBeDefined()
    expect(screen.getByText('All conflicts resolved')).toBeDefined()
  })

  it('localizes copy, export and side-picker actions', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const saveFile = vi.fn(async () => '/tmp/out.txt')
    const selectFile = vi.fn(async () => null)
    const port: PlatformPort = { ...createWebPlatformPort(), saveFile, selectFile }
    renderWithI18n(<CodeView fixture={FIXTURE} defaultMode="merge" platform={port} />, 'en')

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Next conflict' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(screen.getByText('0/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText('Copied to clipboard')).toBeDefined()
    expect(writeText).toHaveBeenCalledTimes(1)

    // A rejected clipboard write falls back to the English failure hint.
    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText('Copy failed, select the preview text manually')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Export merged text' }))
    expect(await screen.findByText('Saved to /tmp/out.txt')).toBeDefined()
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Save merged result',
        filters: [textFileFilter('Code / text')]
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open ours' }))
    expect(selectFile).toHaveBeenCalledWith({
      title: 'Open ours local file',
      filters: [textFileFilter('Code / text')]
    })
    Reflect.deleteProperty(navigator, 'clipboard')
  })
})

describe('language switch keeps code state', () => {
  it('keeps diff edits, block count and dirty markers', () => {
    const base = createWebPlatformPort()
    const writeTextFile = vi.fn(base.writeTextFile)
    const readTextFile = vi.fn(base.readTextFile)
    render(
      <I18nProvider initialLanguage="zh">
        <CodeView pair={TWO_BLOCK_PAIR} platform={{ ...base, writeTextFile, readTextFile }} />
        <LanguageSwitch to="en" />
      </I18nProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(screen.getByText('1/1')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'switch-language' }))

    expect(screen.getByText('Unsaved: right')).toBeDefined()
    expect(screen.getByText('Modified (unsaved)')).toBeDefined()
    expect(screen.getByText('1/1')).toBeDefined()
    expect(
      (screen.getByRole('button', { name: 'Save right file' }) as HTMLButtonElement).disabled
    ).toBe(false)
    expect(
      (screen.getByRole('button', { name: 'Save left file' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('keeps merge acceptances and the pending conflict count', () => {
    render(
      <I18nProvider initialLanguage="zh">
        <CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />
        <LanguageSwitch to="en" />
      </I18nProvider>
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    expect(screen.getByText('待决冲突')).toBeDefined()
    expect(screen.getByText('1/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'switch-language' }))

    expect(screen.getByText('Pending conflicts')).toBeDefined()
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('Accepted ours + theirs')).toBeDefined()
  })
})
