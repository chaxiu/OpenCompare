// @vitest-environment jsdom
/**
 * Dry-run sync dialog: the Apply button and the visible pending count must come
 * from the **same** executable predicate the real-disk gate asserts, so a preview
 * that only has link metadata left to align is never presented as "nothing to
 * sync" with a disabled Apply.
 */
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SyncMode, SyncPlan, SyncPlanGroup, SyncPlanItem } from '@core/directory/sync'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { canApplySyncPreview } from '@renderer/workbench/directoryOps'
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

function planOf(mode: SyncMode, deletePaths: readonly string[] = []): SyncPlan {
  return {
    direction: 'left-to-right',
    mode,
    sourceRoot: '/left',
    targetRoot: '/right',
    copy: group(),
    update: group(),
    delete: group(deletePaths.map(planItem)),
    totalCount: deletePaths.length,
    totalBytes: 0
  }
}

function previewOf(options: {
  readonly mode: SyncMode
  readonly deletePaths?: readonly string[]
  readonly links?: readonly string[]
}): SyncPreview {
  const links = options.links ?? []
  const linkAlignments: SyncLinkAlignment[] = links.map((relativePath) => ({
    relativePath,
    targetPath: `/right/${relativePath}`,
    sourceMs: 1_700_001_000_000
  }))
  return {
    plan: planOf(options.mode, options.deletePaths),
    materializeTarget: false,
    sourceRoot: '/left',
    originalTargetRoot: '/right',
    linkAlignments
  }
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
