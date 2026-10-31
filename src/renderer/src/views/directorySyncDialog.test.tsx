// @vitest-environment jsdom
/**
 * Dry-run sync dialog: the Apply button and the visible pending count must come
 * from the **same** executable predicate the real-disk gate asserts, so a preview
 * that only has link metadata left to align is never presented as "nothing to
 * sync" with a disabled Apply.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SyncMode, SyncPlan, SyncPlanGroup, SyncPlanItem } from '@core/directory/sync'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { canApplySyncPreview, syncPreviewAction } from '@renderer/workbench/directoryOps'
import type { SyncLinkAlignment, SyncPreview } from '@renderer/workbench/directoryOps'
import { DirectorySyncDialog } from './DirectorySyncDialog'

afterEach(() => {
  cleanup()
})

function planItem(relativePath: string): SyncPlanItem {
  return {
    relativePath,
    sourcePath: null,
    targetPath: `/right/${relativePath}`,
    size: 0,
    modifiedMs: 0
  }
}

function group(items: readonly SyncPlanItem[] = []): SyncPlanGroup {
  return { items, count: items.length, bytes: 0 }
}

function planOf(
  mode: SyncMode,
  deletePaths: readonly string[] = [],
  copyPaths: readonly string[] = [],
  updatePaths: readonly string[] = []
): SyncPlan {
  return {
    direction: 'left-to-right',
    mode,
    sourceRoot: '/left',
    targetRoot: '/right',
    copy: group(copyPaths.map(planItem)),
    update: group(updatePaths.map(planItem)),
    delete: group(deletePaths.map(planItem)),
    totalCount: copyPaths.length + updatePaths.length + deletePaths.length,
    totalBytes: 0
  }
}

function previewOf(options: {
  readonly mode: SyncMode
  readonly deletePaths?: readonly string[]
  readonly copyPaths?: readonly string[]
  readonly updatePaths?: readonly string[]
  readonly links?: readonly string[]
}): SyncPreview {
  const links = options.links ?? []
  const linkAlignments: SyncLinkAlignment[] = links.map((relativePath) => ({
    relativePath,
    targetPath: `/right/${relativePath}`,
    sourceMs: 1_700_001_000_000
  }))
  return {
    plan: planOf(options.mode, options.deletePaths, options.copyPaths, options.updatePaths),
    materializeTarget: false,
    sourceRoot: '/left',
    originalTargetRoot: '/right',
    linkAlignments
  }
}

function summaryText(counts: {
  readonly copy: number
  readonly update: number
  readonly delete: number
  readonly align: number
}): string {
  return zh['directory.sync.summary']
    .replace('{copy}', String(counts.copy))
    .replace('{update}', String(counts.update))
    .replace('{delete}', String(counts.delete))
    .replace('{align}', String(counts.align))
}

function deleteGroupText(planned: number, selected: number): string {
  return (
    zh['directory.sync.groupCount.one'].replace('{count}', String(planned)).replace('{size}', '0 B') +
    zh['directory.sync.groupCountSelected'].replace('{selected}', String(selected))
  )
}

function renderDialog(preview: SyncPreview): {
  readonly apply: HTMLButtonElement
} {
  renderWithI18n(
    <DirectorySyncDialog
      preview={preview}
      busy={false}
      onCancel={() => undefined}
      onAbort={() => undefined}
      onConfirm={() => undefined}
    />,
    'zh'
  )
  return {
    apply: screen.getByRole('button', {
      name: zh['directory.sync.apply']
    }) as HTMLButtonElement
  }
}

describe('directory sync dialog executability', () => {
  it('keeps Apply enabled and shows the pending link count when only link times differ', () => {
    const preview = previewOf({ mode: 'incremental', links: ['same-target-link', 'dangling-link'] })
    expect(canApplySyncPreview(preview), 'dialog: shared predicate').toBe(true)

    const { apply } = renderDialog(preview)

    expect(apply.disabled).toBe(false)
    expect(screen.queryByText(zh['directory.sync.empty'])).toBeNull()
    expect(screen.getByText(zh['directory.sync.group.align'])).toBeDefined()
    // The summary exposes exactly the pending link count of the preview.
    expect(
      screen.getByText(
        zh['directory.sync.summary']
          .replace('{copy}', '0')
          .replace('{update}', '0')
          .replace('{delete}', '0')
          .replace('{align}', '2')
      )
    ).toBeDefined()
    expect(screen.getByText('same-target-link')).toBeDefined()
    expect(screen.getByText('dangling-link')).toBeDefined()
  })

  it('keeps Apply enabled in mirror mode while deletions stay unchecked', () => {
    const preview = previewOf({ mode: 'mirror', deletePaths: ['stale.txt'], links: ['a-link'] })
    expect(canApplySyncPreview(preview), 'dialog: unchecked delete does not block').toBe(true)

    const { apply } = renderDialog(preview)

    expect(apply.disabled).toBe(false)
    expect(screen.queryByText(zh['directory.sync.empty'])).toBeNull()
    expect(screen.queryByText(zh['directory.sync.noExecutable'])).toBeNull()
  })

  it('keeps the delete opt-in: an unchecked mirror deletion alone is not executable', () => {
    const preview = previewOf({ mode: 'mirror', deletePaths: ['stale.txt'] })
    expect(canApplySyncPreview(preview), 'dialog: delete opt-in unchanged').toBe(false)

    const { apply } = renderDialog(preview)

    expect(apply.disabled).toBe(true)
    expect(screen.getByText(zh['directory.sync.noExecutable'])).toBeDefined()
    expect(screen.queryByText(zh['directory.sync.empty'])).toBeNull()
  })

  it('still reports an empty direction when there is nothing to do at all', () => {
    const preview = previewOf({ mode: 'incremental' })
    expect(canApplySyncPreview(preview), 'dialog: empty preview is not executable').toBe(false)

    const { apply } = renderDialog(preview)

    expect(apply.disabled).toBe(true)
    expect(screen.getByText(zh['directory.sync.empty'])).toBeDefined()
  })
})

describe('directory sync dialog summary follows the checked deletions', () => {
  it('keeps summary, Apply and guidance in sync through 0 → 1 → 0', () => {
    const preview = previewOf({ mode: 'mirror', deletePaths: ['stale.txt'] })
    renderDialog(preview)
    const apply = (): HTMLButtonElement =>
      screen.getByRole('button', {
        name: zh['directory.sync.apply']
      }) as HTMLButtonElement
    const checkbox = screen.getByRole('checkbox', {
      name: zh['directory.sync.deleteItem'].replace('{path}', 'stale.txt')
    }) as HTMLInputElement

    // Default: nothing checked, so the summary claims no deletion and Apply is off.
    expect(apply().disabled, 'sync dialog: default apply disabled').toBe(true)
    expect(
      screen.getByText(summaryText({ copy: 0, update: 0, delete: 0, align: 0 }), {
        selector: 'p'
      }),
      'sync dialog: default summary claims no deletion'
    ).toBeDefined()
    expect(screen.getByText(zh['directory.sync.noExecutable'])).toBeDefined()
    expect(
      screen.getByText(deleteGroupText(1, 0)),
      'sync dialog: unchecked group header shows the planned total and 0 selected'
    ).toBeDefined()

    // One checked: the same view now counts the deletion and lets Apply run.
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(apply().disabled, 'sync dialog: one checked delete enables apply').toBe(false)
    expect(
      screen.getByText(summaryText({ copy: 0, update: 0, delete: 1, align: 0 }), {
        selector: 'p'
      }),
      'sync dialog: checked summary counts the selected deletion'
    ).toBeDefined()
    expect(screen.queryByText(zh['directory.sync.noExecutable'])).toBeNull()
    expect(screen.getByText(deleteGroupText(1, 1))).toBeDefined()

    // Cleared again: the count falls back and Apply is off again, in step.
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
    expect(apply().disabled, 'sync dialog: cleared selection disables apply').toBe(true)
    expect(
      screen.getByText(summaryText({ copy: 0, update: 0, delete: 0, align: 0 }), {
        selector: 'p'
      }),
      'sync dialog: cleared summary falls back to no deletion'
    ).toBeDefined()
    expect(screen.getByText(zh['directory.sync.noExecutable'])).toBeDefined()
    expect(screen.getByText(deleteGroupText(1, 0))).toBeDefined()
  })

  it('keeps copy / update counts while the deletion stays unchecked', () => {
    const preview = previewOf({
      mode: 'mirror',
      copyPaths: ['new.txt'],
      updatePaths: ['changed.txt'],
      deletePaths: ['stale.txt']
    })
    renderDialog(preview)
    const checkbox = screen.getByRole('checkbox', {
      name: zh['directory.sync.deleteItem'].replace('{path}', 'stale.txt')
    }) as HTMLInputElement
    const apply = (): HTMLButtonElement =>
      screen.getByRole('button', {
        name: zh['directory.sync.apply']
      }) as HTMLButtonElement

    expect(
      screen.getByText(summaryText({ copy: 1, update: 1, delete: 0, align: 0 }), {
        selector: 'p'
      }),
      'sync dialog: copy / update counts ignore the unchecked deletion'
    ).toBeDefined()
    expect(apply().disabled, 'sync dialog: copy work keeps apply enabled').toBe(false)

    fireEvent.click(checkbox)
    expect(
      screen.getByText(summaryText({ copy: 1, update: 1, delete: 1, align: 0 }), {
        selector: 'p'
      }),
      'sync dialog: checking the deletion only moves the delete counter'
    ).toBeDefined()
    expect(apply().disabled, 'sync dialog: apply stays enabled').toBe(false)

    const links = previewOf({ mode: 'mirror', links: ['same-target-link'] })
    const withLink = syncPreviewAction(links)
    expect(withLink.align, 'sync dialog: pending alignment is counted').toBe(1)
    expect(withLink.executable, 'sync dialog: alignment alone is executable').toBe(true)
    expect(withLink.guidance, 'sync dialog: alignment alone points at changes').toBe('changes')
  })
})

describe('sync preview action is the single executable predicate', () => {
  it('matches canApplySyncPreview case by case', () => {
    const cases: readonly (readonly [string, SyncPreview, readonly string[]])[] = [
      ['empty incremental', previewOf({ mode: 'incremental' }), []],
      ['incremental with pending links', previewOf({ mode: 'incremental', links: ['a-link'] }), []],
      ['mirror deletion unchecked', previewOf({ mode: 'mirror', deletePaths: ['stale.txt'] }), []],
      [
        'mirror deletion checked',
        previewOf({ mode: 'mirror', deletePaths: ['stale.txt'] }),
        ['stale.txt']
      ],
      [
        'mirror deletion checked but not planned',
        previewOf({ mode: 'mirror', deletePaths: ['stale.txt'] }),
        ['other.txt']
      ],
      [
        'incremental mode ignores checked deletions',
        previewOf({ mode: 'incremental', deletePaths: ['stale.txt'] }),
        ['stale.txt']
      ]
    ]

    for (const [label, preview, checked] of cases) {
      const action = syncPreviewAction(preview, checked)
      expect(canApplySyncPreview(preview, checked), `sync summary: canApply (${label})`).toBe(
        action.executable
      )
    }
  })
})
