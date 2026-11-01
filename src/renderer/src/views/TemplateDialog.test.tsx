// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Language, PlatformPort } from '@shared/platform/types'
import { DIRECTORY_ROW_HEIGHT, createDirectoryScrollMap } from '@core/directory/rows'
import { createTemplatePlan } from '@core/directory/template'
import type { TemplateMatchResult } from '@core/directory/template'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { TemplatePreview } from '@renderer/workbench/directoryOps'
import { TemplateDialog } from './TemplateDialog'
import type { TemplateDialogProps } from './TemplateDialog'

const HAN = /\p{Script=Han}/u
const VIEWPORT = 640
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(cleanup)

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function platformWith(overrides: Partial<PlatformPort> = {}): PlatformPort {
  return { ...createWebPlatformPort(), ...overrides }
}

const OUTCOMES: TemplateMatchResult = {
  templateRoot: '/ext/a',
  incomingRoot: '/ext/b',
  matched: [
    {
      relativePath: 'src/ok.ts',
      templatePath: '/ext/a/src/ok.ts',
      sourcePath: '/ext/b/x/ok.ts',
      size: 1,
      hash: 'h1',
      modifiedMs: 1_700_000_000_001,
      text: 'A'
    },
    {
      relativePath: 'src/over.ts',
      templatePath: '/ext/a/src/over.ts',
      sourcePath: '/ext/b/x/over.ts',
      size: 2,
      hash: 'h2',
      modifiedMs: 1_700_000_000_002,
      text: 'B'
    },
    {
      relativePath: 'src/taken.ts',
      templatePath: '/ext/a/src/taken.ts',
      sourcePath: '/ext/b/x/taken.ts',
      size: 3,
      hash: 'h3',
      modifiedMs: 1_700_000_000_003,
      text: 'C'
    }
  ],
  missing: [{ relativePath: 'src/missing.ts', templatePath: '/ext/a/src/missing.ts', size: 4 }],
  conflicts: [
    {
      relativePath: 'src/conflict.ts',
      templatePath: '/ext/a/src/conflict.ts',
      reason: 'ambiguous',
      candidates: [
        { path: '/ext/b/one/conflict.ts', size: 5, hash: 'c1', modifiedMs: 1_700_000_000_005 },
        { path: '/ext/b/two/conflict.ts', size: 6, hash: 'c2', modifiedMs: 1_700_000_000_006 }
      ]
    }
  ],
  unused: [{ relativePath: 'extras/unused.ts', path: '/ext/b/extras/unused.ts', size: 7 }],
  templateFileCount: 5
}

function previewOf(
  result: TemplateMatchResult = OUTCOMES,
  options: {
    readonly existingFiles?: readonly string[]
    readonly existingDirectories?: readonly string[]
    readonly outputRoot?: string
    readonly outputRootExists?: boolean
  } = {}
): TemplatePreview {
  const outputRoot = options.outputRoot ?? '/ext/out'
  return {
    plan: createTemplatePlan(result, {
      outputRoot,
      existingFiles: options.existingFiles ?? [],
      existingDirectories: options.existingDirectories ?? []
    }),
    templateRoot: result.templateRoot,
    incomingRoot: result.incomingRoot,
    outputRoot,
    outputRootExists: options.outputRootExists ?? true
  }
}

function renderSetup(
  platform: PlatformPort,
  onPreview: TemplateDialogProps['onPreview'] = async () => null,
  language: Language = 'en'
): ReturnType<typeof renderWithI18n> {
  return renderWithI18n(
    <TemplateDialog
      platform={platform}
      templateRoot="/ext/a"
      preview={null}
      busy={false}
      onPreview={onPreview}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />,
    language
  )
}

function renderDryRun(
  preview: TemplatePreview,
  options: {
    readonly busy?: boolean
    readonly onConfirm?: TemplateDialogProps['onConfirm']
    readonly language?: Language
  } = {}
): ReturnType<typeof renderWithI18n> {
  return renderWithI18n(
    <TemplateDialog
      platform={platformWith()}
      templateRoot="/ext/a"
      preview={preview}
      busy={options.busy ?? false}
      onPreview={async () => null}
      onCancel={() => undefined}
      onConfirm={options.onConfirm ?? (() => undefined)}
    />,
    options.language ?? 'en'
  )
}

function setupInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

/* ------------------------------------------------------------------ */
/* Setup step: real roots                                              */
/* ------------------------------------------------------------------ */

describe('template setup step', () => {
  it('shows template A read-only and fills each root from its own picker', async () => {
    const answers = ['/ext/picked-b', '/ext/picked-out']
    const selectDirectory = vi.fn(async () => answers.shift() ?? null)
    renderSetup(platformWith({ selectDirectory }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Template placement · Choose roots')
    expect(within(dialog).getByText('/ext/a')).toBeDefined()
    // Template A has no editable input at all.
    expect(screen.queryByDisplayValue('/ext/a')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Choose tree B' }))
    await waitFor(() => expect(setupInput('Scattered tree B root').value).toBe('/ext/picked-b'))
    fireEvent.click(screen.getByRole('button', { name: 'Choose output root' }))
    await waitFor(() => expect(setupInput('Output root').value).toBe('/ext/picked-out'))

    // The two pickers fill their own root and never overwrite each other.
    expect(selectDirectory).toHaveBeenCalledTimes(2)
    expect(setupInput('Scattered tree B root').value).toBe('/ext/picked-b')
    expect(setupInput('Output root').value).toBe('/ext/picked-out')
  })

  it('expands ~ through the shared path logic before scanning', async () => {
    const onPreview = vi.fn(async () => null)
    renderSetup(platformWith({ homeDirectory: async () => '/Users/ana' }), onPreview)

    fireEvent.change(setupInput('Scattered tree B root'), { target: { value: '~/scatter' } })
    fireEvent.change(setupInput('Output root'), { target: { value: '~/restored' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build dry run' }))

    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith({
        templateRoot: '/ext/a',
        incomingRoot: '/Users/ana/scatter',
        outputRoot: '/Users/ana/restored'
      })
    )
  })

  it('localizes an empty typed root and never starts a scan', async () => {
    const onPreview = vi.fn(async () => null)
    renderSetup(platformWith(), onPreview)

    fireEvent.change(setupInput('Output root'), { target: { value: '/ext/out' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build dry run' }))

    expect(screen.getByRole('alert').textContent).toBe(en['directory.template.error.incomingEmpty'])
    expect(onPreview).not.toHaveBeenCalled()

    fireEvent.change(setupInput('Scattered tree B root'), { target: { value: '/ext/b' } })
    fireEvent.change(setupInput('Output root'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build dry run' }))

    expect(screen.getByRole('alert').textContent).toBe(en['directory.template.error.outputEmpty'])
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('shows the localized refusal an invalid root comes back with', async () => {
    const onPreview = vi.fn(async () => 'incoming-missing' as const)
    renderSetup(platformWith(), onPreview)

    fireEvent.change(setupInput('Scattered tree B root'), { target: { value: '/ext/gone' } })
    fireEvent.change(setupInput('Output root'), { target: { value: '/ext/out' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build dry run' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        en['directory.template.error.incomingMissing'].replace('{path}', '/ext/gone')
      )
    )
    expect(onPreview).toHaveBeenCalledTimes(1)
  })

  it('fills a root from a dropped directory without reaching the window drop handler', async () => {
    const outerDrop = vi.fn()
    const resolveDroppedPath = vi.fn(async () => '/ext/dropped')
    const { container } = renderWithI18n(
      <div onDrop={outerDrop}>
        <TemplateDialog
          platform={platformWith({ resolveDroppedPath })}
          templateRoot="/ext/a"
          preview={null}
          busy={false}
          onPreview={async () => null}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      </div>,
      'en'
    )

    const zone = container.querySelector('[data-template-drop="incoming"]') as HTMLElement
    const notNavigating = fireEvent.drop(zone, {
      dataTransfer: { files: [new File([''], 'scatter')], types: ['Files'] }
    })

    // `preventDefault` stopped the browser default and `stopPropagation` kept the
    // workbench window handler out of it, so no session was opened.
    expect(notNavigating).toBe(false)
    await waitFor(() => expect(setupInput('Scattered tree B root').value).toBe('/ext/dropped'))
    expect(resolveDroppedPath).toHaveBeenCalledTimes(1)
    expect(outerDrop).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* Dry-run step                                                        */
/* ------------------------------------------------------------------ */

describe('template dry-run step', () => {
  it('renders the four outcomes with the plan counts and the same source paths', () => {
    renderDryRun(previewOf(OUTCOMES, { existingFiles: ['src/over.ts'], existingDirectories: ['src/taken.ts'] }))

    expect(screen.getByText(en['directory.template.section.matched'])).toBeDefined()
    expect(screen.getByText(en['directory.template.section.missing'])).toBeDefined()
    expect(screen.getByText(en['directory.template.section.conflicts'])).toBeDefined()
    expect(screen.getByText(en['directory.template.section.unused'])).toBeDefined()

    // matched / conflict rows carry both the slot and its B source.
    expect(screen.getByText('src/ok.ts')).toBeDefined()
    expect(screen.getByText('/ext/b/x/ok.ts')).toBeDefined()
    expect(screen.getByText('/ext/b/one/conflict.ts · /ext/b/two/conflict.ts')).toBeDefined()
    // missing shows no source path, unused shows the B relative path.
    expect(screen.getByText('src/missing.ts')).toBeDefined()
    expect(screen.getByText('extras/unused.ts')).toBeDefined()
    expect(screen.getByText(/3 items/)).toBeDefined()
    expect(screen.getAllByText(/^1 item$/)).toHaveLength(3)
  })

  it('starts only the plan defaults checked and keeps conflict / missing / occupied rows non-executable', () => {
    renderDryRun(previewOf(OUTCOMES, { existingFiles: ['src/over.ts'], existingDirectories: ['src/taken.ts'] }))

    const ok = screen.getByLabelText('Check src/ok.ts') as HTMLInputElement
    const over = screen.getByLabelText('Check src/over.ts') as HTMLInputElement
    const taken = screen.getByLabelText('Check src/taken.ts') as HTMLInputElement
    expect(ok.checked).toBe(true)
    expect(over.checked).toBe(false)
    expect(taken.checked).toBe(false)

    // Conflict, missing and unused rows have no checkbox at all.
    expect(screen.queryByLabelText('Check src/conflict.ts')).toBeNull()
    expect(screen.queryByLabelText('Check src/missing.ts')).toBeNull()
    expect(screen.queryByLabelText('Check extras/unused.ts')).toBeNull()

    expect(screen.getByText(/1 executable/)).toBeDefined()
    expect(screen.getByText(/0 rejected/)).toBeDefined()

    // An overwrite is explicit: checking it becomes executable.
    fireEvent.click(over)
    expect(screen.getByText(/2 executable/)).toBeDefined()

    // A directory-occupied target is refused even when checked.
    fireEvent.click(taken)
    expect(screen.getByText(/2 executable/)).toBeDefined()
    expect(screen.getByText(/1 rejected/)).toBeDefined()

    fireEvent.click(ok)
    fireEvent.click(over)
    expect(screen.getByText(/0 executable/)).toBeDefined()
    const confirm = screen.getByRole('button', { name: en['directory.template.place'] })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
  })

  it('hands the resolved manifest to the shell on confirm', () => {
    const onConfirm = vi.fn()
    renderDryRun(
      previewOf(OUTCOMES, {
        existingFiles: ['src/over.ts'],
        existingDirectories: ['src/taken.ts']
      }),
      { onConfirm }
    )

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const resolved = onConfirm.mock.calls[0][0] as {
      executable: readonly { readonly relativePath: string; readonly targetPath: string }[]
      executableCount: number
    }
    expect(resolved.executableCount).toBe(1)
    expect(resolved.executable[0]).toMatchObject({
      relativePath: 'src/ok.ts',
      targetPath: '/ext/out/src/ok.ts'
    })
  })

  it('marks a missing output root as "will create"', () => {
    renderDryRun(previewOf(OUTCOMES, { outputRoot: '/ext/new-out', outputRootExists: false }))
    expect(screen.getByText(/Will be created/)).toBeDefined()
  })

  it('windows a 1,200-row plan and keeps the tail checkable', async () => {
    const matched = Array.from({ length: 1200 }, (_, index) => ({
      relativePath: `src/f${index}.ts`,
      templatePath: `/ext/a/src/f${index}.ts`,
      sourcePath: `/ext/b/x/f${index}.ts`,
      size: index,
      hash: `h${index}`,
      modifiedMs: 1_700_000_000_000 + index,
      text: `body-${index}`
    }))
    renderDryRun(
      previewOf({ ...OUTCOMES, matched, missing: [], conflicts: [], unused: [], templateFileCount: 1200 })
    )

    expect(screen.getByText(/1200 items/)).toBeDefined()
    expect(document.querySelectorAll('[data-template-row]').length).toBeLessThan(100)

    const scroller = screen.getByTestId('template-rows')
    // Four section headers plus the 1,200 entry rows (the other partitions are empty).
    const rowCount = 4 + 1200 + 3
    const map = createDirectoryScrollMap(rowCount, VIEWPORT)

    // Row 1,000 of the plan is reachable and still checkable.
    scroller.scrollTop = map.offsetForIndex(1000)
    fireEvent.scroll(scroller)
    const thousandth = await screen.findByLabelText('Check src/f999.ts')
    expect((thousandth as HTMLInputElement).checked).toBe(true)
    fireEvent.click(thousandth)
    expect(screen.getByText(/1199 executable/)).toBeDefined()

    // The tail renders too: the last row is visible at the maximum offset.
    scroller.scrollTop = map.maxScrollOffset
    fireEvent.scroll(scroller)
    const last = await screen.findByLabelText('Check src/f1199.ts')
    expect(last).toBeDefined()
    expect(document.querySelectorAll('[data-template-row]').length).toBeLessThan(100)
  })
})

/* ------------------------------------------------------------------ */
/* Sample-path and language red lines                                  */
/* ------------------------------------------------------------------ */

describe('template entry red lines', () => {
  it('never shows a /samples path in either step', () => {
    const setup = renderSetup(platformWith())
    expect(setup.container.innerHTML).not.toContain('/samples')
    setup.unmount()

    const dryRun = renderDryRun(previewOf(OUTCOMES))
    expect(dryRun.container.innerHTML).not.toContain('/samples')
  })

  it('never reads the built-in scattered tree for template B', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/workbench/Workbench.tsx'),
      'utf8'
    )
    expect(source).not.toContain('DIRECTORY_SAMPLE_PATHS.incoming')
  })

  it('renders both steps without Han characters under English', () => {
    const setup = renderSetup(platformWith())
    expect(setup.container.textContent ?? '').not.toMatch(HAN)
    setup.unmount()

    const dryRun = renderDryRun(
      previewOf(OUTCOMES, { existingFiles: ['src/over.ts'], existingDirectories: ['src/taken.ts'] })
    )
    expect(dryRun.container.textContent ?? '').not.toMatch(HAN)
  })

  it('keeps the zh setup and dry-run wording paired', () => {
    renderWithI18n(
      <TemplateDialog
        platform={platformWith()}
        templateRoot="/ext/a"
        preview={null}
        busy={false}
        onPreview={async () => null}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
      'zh'
    )
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(
      zh['directory.template.setupTitle']
    )
    expect(screen.getByRole('button', { name: zh['directory.template.preview'] })).toBeDefined()
    expect(screen.getByText(zh['directory.template.readonly'])).toBeDefined()
    cleanup()

    renderDryRun(previewOf(OUTCOMES), { language: 'zh' })
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(
      zh['directory.template.title']
    )
    expect(
      screen.getByText(
        new RegExp(zh['directory.template.executableCount'].replace('{count}', '3'))
      )
    ).toBeDefined()
  })

  it('uses the exact fixed row height of the directory tree', () => {
    renderDryRun(previewOf(OUTCOMES))
    const row = document.querySelector('[data-template-row]') as HTMLElement
    const wrapper = row.parentElement as HTMLElement
    expect(Number.parseFloat(wrapper.style.height)).toBe(DIRECTORY_ROW_HEIGHT)
  })
})
