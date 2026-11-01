// @vitest-environment jsdom
import { useState } from 'react'
import type { JSX } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Language, PlatformPort } from '@shared/platform/types'
import { DIRECTORY_ROW_HEIGHT, createDirectoryScrollMap } from '@core/directory/rows'
import { createTemplatePlan, resolveTemplatePlan } from '@core/directory/template'
import type {
  TemplateMatchResult,
  TemplateVerificationEntry,
  TemplateWriteFailure,
  TemplateWrittenEntry
} from '@core/directory/template'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { TemplateApplyError } from '@renderer/workbench/directoryOps'
import type { TemplateApplyOutcome, TemplatePreview } from '@renderer/workbench/directoryOps'
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

function writtenEntry(relativePath: string): TemplateWrittenEntry {
  return {
    relativePath,
    sourcePath: `/ext/b/x/${relativePath}`,
    targetPath: `/ext/out/${relativePath}`,
    sourceHash: `h-${relativePath}`,
    modifiedMs: 1_700_000_000_000
  }
}

function verifiedEntry(
  relativePath: string,
  ok = true,
  reason?: TemplateVerificationEntry['reason']
): TemplateVerificationEntry {
  return {
    relativePath,
    targetPath: `/ext/out/${relativePath}`,
    expectedHash: `h-${relativePath}`,
    actualHash: ok ? `h-${relativePath}` : 'other',
    expectedMtimeSec: 1_700_000_000,
    actualMtimeSec: 1_700_000_000,
    ok,
    ...(reason === undefined ? {} : { reason })
  }
}

function outcomeOf(
  options: {
    readonly written?: readonly TemplateWrittenEntry[]
    readonly failed?: readonly TemplateWriteFailure[]
    readonly entries?: readonly TemplateVerificationEntry[]
  } = {}
): TemplateApplyOutcome {
  const written = options.written ?? [writtenEntry('src/ok.ts')]
  const failed = options.failed ?? []
  const entries =
    options.entries ??
    written.map((item) => verifiedEntry(item.relativePath))
  const verified = entries.filter((entry) => entry.ok).length
  return {
    execution: {
      written,
      writtenCount: written.length,
      failed,
      failedCount: failed.length,
      cancelled: false
    },
    verification: { entries, verified, failed: entries.length - verified }
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
      onConfirm={async () => outcomeOf()}
    />,
    language
  )
}

function renderDryRun(
  preview: TemplatePreview,
  options: {
    readonly busy?: boolean
    readonly onConfirm?: TemplateDialogProps['onConfirm']
    readonly onCancel?: TemplateDialogProps['onCancel']
    readonly onPreview?: TemplateDialogProps['onPreview']
    readonly platform?: PlatformPort
    readonly language?: Language
  } = {}
): ReturnType<typeof renderWithI18n> {
  return renderWithI18n(
    <TemplateDialog
      platform={options.platform ?? platformWith()}
      templateRoot="/ext/a"
      preview={preview}
      busy={options.busy ?? false}
      onPreview={options.onPreview ?? (async () => null)}
      onCancel={options.onCancel ?? (() => undefined)}
      onConfirm={options.onConfirm ?? (async () => outcomeOf())}
    />,
    options.language ?? 'en'
  )
}

function setupInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

function conflictSelect(): HTMLSelectElement {
  return screen.getByLabelText('Choose a source for src/conflict.ts') as HTMLSelectElement
}

function conflictCheckbox(): HTMLInputElement {
  return screen.getByLabelText('Check src/conflict.ts') as HTMLInputElement
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
          onConfirm={async () => outcomeOf()}
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
    // A conflict row offers its candidates as a picker, none selected yet.
    expect(conflictSelect().value).toBe('')
    expect(
      Array.from(conflictSelect().options).map((option) => option.value)
    ).toEqual(['', '/ext/b/one/conflict.ts', '/ext/b/two/conflict.ts'])
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

    // A conflict row has a checkbox, but it stays unusable until a candidate is
    // chosen; missing and unused rows have no checkbox at all.
    expect(conflictCheckbox().checked).toBe(false)
    expect(conflictCheckbox().disabled).toBe(true)
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
    expect(
      screen.getByText(en['directory.template.reject.targetOccupiedByDirectory'])
    ).toBeDefined()

    fireEvent.click(ok)
    fireEvent.click(over)
    expect(screen.getByText(/0 executable/)).toBeDefined()
    const confirm = screen.getByRole('button', { name: en['directory.template.place'] })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires choosing a conflict candidate before its row can be checked', () => {
    const onConfirm = vi.fn<TemplateDialogProps['onConfirm']>(async () => outcomeOf())
    renderDryRun(
      previewOf(OUTCOMES, {
        existingFiles: ['src/over.ts'],
        existingDirectories: ['src/taken.ts']
      }),
      { onConfirm }
    )

    expect(screen.getByText(/1 executable/)).toBeDefined()
    expect(conflictCheckbox().checked).toBe(false)
    expect(conflictCheckbox().disabled).toBe(true)

    // Choosing a candidate alone never checks the row and never changes counts.
    fireEvent.change(conflictSelect(), { target: { value: '/ext/b/one/conflict.ts' } })
    expect(conflictCheckbox().checked).toBe(false)
    expect(conflictCheckbox().disabled).toBe(false)
    expect(screen.getByText(/1 executable/)).toBeDefined()

    // Only the explicit check adds it to the manifest.
    fireEvent.click(conflictCheckbox())
    expect(screen.getByText(/2 executable/)).toBeDefined()

    // Switching the candidate keeps the row executable and rebinds the source.
    fireEvent.change(conflictSelect(), { target: { value: '/ext/b/two/conflict.ts' } })
    expect(conflictCheckbox().checked).toBe(true)
    expect(screen.getByText(/2 executable/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const resolved = onConfirm.mock.calls[0][0] as {
      readonly executable: readonly {
        readonly relativePath: string
        readonly sourcePath: string
        readonly sourceHash: string
        readonly modifiedMs: number
      }[]
      readonly executableCount: number
    }
    const conflict = resolved.executable.find((entry) => entry.relativePath === 'src/conflict.ts')
    expect(conflict).toMatchObject({
      sourcePath: '/ext/b/two/conflict.ts',
      sourceHash: 'c2',
      modifiedMs: 1_700_000_000_006
    })
  })

  it('switches the conflict source without changing the executable count and clears the check when emptied', () => {
    renderDryRun(
      previewOf(OUTCOMES, {
        existingFiles: ['src/over.ts'],
        existingDirectories: ['src/taken.ts']
      })
    )

    fireEvent.change(conflictSelect(), { target: { value: '/ext/b/one/conflict.ts' } })
    fireEvent.click(conflictCheckbox())
    expect(screen.getByText(/2 executable/)).toBeDefined()
    expect(screen.getAllByText('/ext/b/one/conflict.ts').length).toBeGreaterThan(0)

    fireEvent.change(conflictSelect(), { target: { value: '/ext/b/two/conflict.ts' } })
    expect(conflictCheckbox().checked).toBe(true)
    expect(screen.getByText(/2 executable/)).toBeDefined()
    expect(screen.getAllByText('/ext/b/two/conflict.ts').length).toBeGreaterThan(0)

    // Emptying the candidate also clears the check and counts a refusal.
    fireEvent.change(conflictSelect(), { target: { value: '' } })
    expect(conflictCheckbox().checked).toBe(false)
    expect(conflictCheckbox().disabled).toBe(true)
    expect(screen.getByText(/1 executable/)).toBeDefined()
    expect(screen.getByText(/1 rejected/)).toBeDefined()
    expect(screen.getByText(en['directory.template.reject.conflictUnresolved'])).toBeDefined()
  })

  it('renders the duplicate-source refusal for the later slot', () => {
    const duplicate: TemplateMatchResult = {
      ...OUTCOMES,
      matched: [
        {
          relativePath: 'a/dup.ts',
          templatePath: '/ext/a/a/dup.ts',
          sourcePath: '/ext/b/x/dup.ts',
          size: 1,
          hash: 'd1',
          modifiedMs: 1_700_000_000_010,
          text: 'D'
        },
        {
          relativePath: 'b/dup.ts',
          templatePath: '/ext/a/b/dup.ts',
          sourcePath: '/ext/b/x/dup.ts',
          size: 1,
          hash: 'd1',
          modifiedMs: 1_700_000_000_010,
          text: 'D'
        }
      ],
      missing: [],
      conflicts: [],
      unused: [],
      templateFileCount: 2
    }
    renderDryRun(previewOf(duplicate))

    expect(screen.getByText(/1 executable/)).toBeDefined()
    expect(screen.getByText(/1 rejected/)).toBeDefined()
    expect(screen.getByText(en['directory.template.reject.duplicateSource'])).toBeDefined()
  })

  it('hands the resolved manifest to the shell on confirm and opens the result step', async () => {
    const onConfirm = vi.fn<TemplateDialogProps['onConfirm']>(async () => outcomeOf())
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

    // The dialog stays open on the result step instead of closing with a notice.
    const result = await screen.findByRole('dialog', { name: en['directory.template.result.title'] })
    expect(result).toBeDefined()
    expect(screen.getByText(en['directory.template.result.written'].replace('{count}', '1'))).toBeDefined()
    expect(screen.getByText(en['directory.template.result.verified'].replace('{count}', '1'))).toBeDefined()
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
/* Result step                                                         */
/* ------------------------------------------------------------------ */

describe('template result step', () => {
  it('renders one verification row per written entry with localized ok / reason copy', async () => {
    const entries = [
      verifiedEntry('src/ok.ts'),
      verifiedEntry('src/hash.ts', false, 'hash'),
      verifiedEntry('src/gone.ts', false, 'missing')
    ]
    const onConfirm = vi.fn(async () =>
      outcomeOf({
        written: [writtenEntry('src/ok.ts'), writtenEntry('src/hash.ts'), writtenEntry('src/gone.ts')],
        entries
      })
    )
    const { container } = renderDryRun(previewOf(OUTCOMES), { onConfirm })

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))
    await screen.findByRole('dialog', { name: en['directory.template.result.title'] })

    expect(document.querySelectorAll('[data-template-result-row]')).toHaveLength(3)
    expect(screen.getByText(en['directory.template.result.ok'])).toBeDefined()
    expect(screen.getByText(en['directory.template.verify.hash'])).toBeDefined()
    expect(screen.getByText(en['directory.template.verify.missing'])).toBeDefined()
    // A failed row never turns the block into an "all succeeded" claim.
    expect(container.textContent ?? '').not.toMatch(/all (rows|items) (were )?(placed|verified)/i)
    expect(container.textContent ?? '').not.toMatch(HAN)
  })

  it('renders a write failure row with its localized reason and OS code', async () => {
    const onConfirm = vi.fn(async () =>
      outcomeOf({
        written: [],
        entries: [],
        failed: [
          {
            relativePath: 'src/ok.ts',
            sourcePath: '/ext/b/x/ok.ts',
            targetPath: '/ext/out/src/ok.ts',
            reason: 'write-failed',
            code: 'EACCES'
          }
        ]
      })
    )
    const { container } = renderDryRun(previewOf(OUTCOMES), { onConfirm })

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))
    await screen.findByRole('dialog', { name: en['directory.template.result.title'] })

    const failureRow = document.querySelector('[data-template-failure-row]') as HTMLElement
    expect(failureRow).not.toBeNull()
    expect(failureRow.textContent).toContain('EACCES')
    expect(failureRow.textContent).toContain('the write failed')
    expect(container.textContent ?? '').not.toMatch(HAN)
  })

  it('windows a 1,000-row verification list and reaches the last row', async () => {
    const written = Array.from({ length: 1000 }, (_, index) => writtenEntry(`src/f${index}.ts`))
    const entries = written.map((item) => verifiedEntry(item.relativePath))
    const onConfirm = vi.fn(async () => outcomeOf({ written, entries }))
    renderDryRun(previewOf(OUTCOMES), { onConfirm })

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))
    await screen.findByRole('dialog', { name: en['directory.template.result.title'] })

    expect(document.querySelectorAll('[data-template-result-row]').length).toBeLessThan(100)
    const scroller = screen.getByTestId('template-result-rows')
    const map = createDirectoryScrollMap(1000, VIEWPORT)

    scroller.scrollTop = map.maxScrollOffset
    fireEvent.scroll(scroller)
    await waitFor(() =>
      expect(document.querySelectorAll('[data-template-result-row]').length).toBeLessThan(100)
    )
    expect(screen.getByText('src/f999.ts')).toBeDefined()
    expect(
      screen.getByText(en['directory.template.result.verified'].replace('{count}', '1000'))
    ).toBeDefined()
  })

  it('rescans the same roots back to the dry-run and leaves written slots unchecked', async () => {
    const writeTextFile = vi.fn(async () => undefined)
    const ensureDirectory = vi.fn(async () => undefined)
    const onPreview = vi.fn<TemplateDialogProps['onPreview']>(async () => null)
    let preview: TemplatePreview | null = previewOf(OUTCOMES)

    function Harness(): JSX.Element {
      const [current, setCurrent] = useState<TemplatePreview | null>(preview)
      return (
        <TemplateDialog
          platform={platformWith({ writeTextFile, ensureDirectory })}
          templateRoot="/ext/a"
          preview={current}
          busy={false}
          onPreview={async (roots) => {
            const failure = await onPreview(roots)
            if (failure === null) {
              preview = previewOf(OUTCOMES, { existingFiles: ['src/ok.ts'] })
              setCurrent(preview)
            }
            return failure
          }}
          onCancel={() => undefined}
          onConfirm={async () => outcomeOf()}
        />
      )
    }

    renderWithI18n(<Harness />, 'en')
    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))
    await screen.findByRole('dialog', { name: en['directory.template.result.title'] })

    writeTextFile.mockClear()
    ensureDirectory.mockClear()
    fireEvent.click(screen.getByRole('button', { name: en['directory.template.result.rescan'] }))

    await screen.findByRole('dialog', { name: en['directory.template.title'] })
    expect(onPreview).toHaveBeenCalledWith({
      templateRoot: '/ext/a',
      incomingRoot: '/ext/b',
      outputRoot: '/ext/out'
    })
    // A rescan never writes or creates anything.
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(ensureDirectory).not.toHaveBeenCalled()
    // The re-scanned plan marks the written slot as an overwrite and leaves it
    // unchecked, so a second run cannot silently overwrite.
    const ok = screen.getByLabelText('Check src/ok.ts') as HTMLInputElement
    expect(ok.checked).toBe(false)
    expect(screen.getByText(en['directory.template.overwrite'])).toBeDefined()
  })

  it('localizes a preflight refusal, keeps the dialog open and retries the same plan', async () => {
    const onConfirm = vi
      .fn<TemplateDialogProps['onConfirm']>()
      .mockRejectedValueOnce(new TemplateApplyError('/ext/out', 'EACCES', 'EACCES: permission denied'))
      .mockResolvedValueOnce(outcomeOf())
    renderDryRun(previewOf(OUTCOMES), { onConfirm })

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.place'] }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('/ext/out')
    expect(alert.textContent).toContain('EACCES')
    expect(alert.textContent).toContain('permission denied')
    expect(alert.textContent ?? '').not.toMatch(HAN)
    // The dry-run stays on screen with the same resolved manifest.
    expect(screen.getByRole('dialog', { name: en['directory.template.title'] })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: en['directory.template.result.retry'] }))

    await screen.findByRole('dialog', { name: en['directory.template.result.title'] })
    expect(onConfirm).toHaveBeenCalledTimes(2)
    // Retry reuses the exact same resolved manifest: no re-parse, no re-match.
    expect(onConfirm.mock.calls[1][0]).toBe(onConfirm.mock.calls[0][0])
    const first = onConfirm.mock.calls[0][0] as { readonly executableCount: number }
    const second = onConfirm.mock.calls[1][0] as { readonly executableCount: number }
    expect(second.executableCount).toBe(first.executableCount)
  })

  it('closes without writing when cancelled from the dry-run', () => {
    const writeTextFile = vi.fn(async () => undefined)
    const ensureDirectory = vi.fn(async () => undefined)
    const onCancel = vi.fn()
    renderDryRun(previewOf(OUTCOMES), {
      platform: platformWith({ writeTextFile, ensureDirectory }),
      onCancel
    })

    fireEvent.click(screen.getByRole('button', { name: en['common.cancel'] }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(ensureDirectory).not.toHaveBeenCalled()
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

  it('renders the setup and dry-run steps without Han characters under English', () => {
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
        onConfirm={async () => outcomeOf()}
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
    expect(screen.getByText(zh['directory.template.conflict.choose'])).toBeDefined()
  })

  it('uses the exact fixed row height of the directory tree', () => {
    renderDryRun(previewOf(OUTCOMES))
    const row = document.querySelector('[data-template-row]') as HTMLElement
    const wrapper = row.parentElement as HTMLElement
    expect(Number.parseFloat(wrapper.style.height)).toBe(DIRECTORY_ROW_HEIGHT)
  })

  it('keeps the resolved counts identical to resolveTemplatePlan for every selection', () => {
    const preview = previewOf(OUTCOMES, {
      existingFiles: ['src/over.ts'],
      existingDirectories: ['src/taken.ts']
    })
    renderDryRun(preview)

    const expectCounts = (checkedPaths: readonly string[], conflictChoices: Record<string, string>) => {
      const resolved = resolveTemplatePlan(preview.plan, { checkedPaths, conflictChoices })
      expect(screen.getByText(new RegExp(`${resolved.executableCount} executable`))).toBeDefined()
      expect(screen.getByText(new RegExp(`${resolved.rejectedCount} rejected`))).toBeDefined()
      const confirm = screen.getByRole('button', { name: en['directory.template.place'] })
      expect((confirm as HTMLButtonElement).disabled).toBe(resolved.executableCount === 0)
    }

    // Defaults: only the non-overwrite matched slot is checked.
    expectCounts(['src/ok.ts'], {})

    fireEvent.click(screen.getByLabelText('Check src/over.ts'))
    expectCounts(['src/ok.ts', 'src/over.ts'], {})

    fireEvent.change(conflictSelect(), { target: { value: '/ext/b/two/conflict.ts' } })
    fireEvent.click(conflictCheckbox())
    expectCounts(['src/ok.ts', 'src/over.ts', 'src/conflict.ts'], {
      'src/conflict.ts': '/ext/b/two/conflict.ts'
    })

    fireEvent.click(conflictCheckbox())
    expectCounts(['src/ok.ts', 'src/over.ts'], {})
  })
})
