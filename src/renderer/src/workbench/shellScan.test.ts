import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanHardcodedChinese } from '@shared/i18n/scanHardcodedChinese'

/**
 * Every shell source file this work item localizes. A new shell file must be
 * added here, otherwise its copy counts as uncovered.
 */
const SHELL_COPY_FILES = [
  'src/renderer/src/App.tsx',
  'src/renderer/src/workbench/Workbench.tsx',
  'src/renderer/src/workbench/NewCompareDialog.tsx',
  'src/renderer/src/workbench/sessionDisplay.ts',
  'src/renderer/src/workbench/fileKinds.ts',
  'src/renderer/src/components/Dialog.tsx',
  'src/renderer/src/components/SessionTabs.tsx',
  'src/renderer/src/components/StatusBar.tsx',
  'src/renderer/src/components/DiffBadge.tsx',
  'src/renderer/src/components/diffSemantics.ts'
] as const

const ROOT = process.cwd()

describe('shell copy scan', () => {
  it('keeps the explicit shell copy list free of hardcoded Chinese', () => {
    expect(scanHardcodedChinese(SHELL_COPY_FILES)).toEqual([])
  })

  it('no longer decides behaviour from a stat label', () => {
    const workbench = readFileSync(
      join(ROOT, 'src/renderer/src/workbench/Workbench.tsx'),
      'utf8'
    )
    const display = readFileSync(
      join(ROOT, 'src/renderer/src/workbench/sessionDisplay.ts'),
      'utf8'
    )

    for (const source of [workbench, display]) {
      expect(source).not.toMatch(/stat\.label\s*===/)
      expect(source).not.toContain("=== '冲突块'")
    }
  })
})
