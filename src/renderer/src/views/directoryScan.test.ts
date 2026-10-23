import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanHardcodedChinese } from '@shared/i18n/scanHardcodedChinese'

/**
 * Every directory-surface source file this work item localizes. A new file in
 * this surface must be added here, otherwise its copy counts as uncovered.
 */
const DIRECTORY_COPY_FILES = [
  'src/renderer/src/views/DirectoryView.tsx',
  'src/renderer/src/components/TreeView.tsx',
  'src/renderer/src/views/DirectorySyncDialog.tsx',
  'src/renderer/src/views/TemplateDialog.tsx',
  'src/renderer/src/views/directoryCopy.ts'
] as const

/** Existing tests that must read the localized copy through dictionary keys. */
const EXISTING_TESTS = [
  'src/renderer/src/views/DirectoryView.test.tsx',
  'src/renderer/src/components/TreeView.test.tsx'
] as const

const FILTER_LITERALS = ['全部', '仅差异', '左独有', '右独有', '相同'] as const

const ROOT = process.cwd()

describe('directory copy scan', () => {
  it('keeps the explicit directory copy list free of hardcoded Chinese', () => {
    expect(scanHardcodedChinese(DIRECTORY_COPY_FILES)).toEqual([])
  })

  it('reads the localized test copy through dictionary keys', () => {
    for (const file of EXISTING_TESTS) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      for (const literal of FILTER_LITERALS) {
        expect(source, `${file} still contains ${literal}`).not.toContain(literal)
      }
      expect(source, `${file} still contains a toggle label`).not.toMatch(/(展开|折叠) /)
    }
  })
})
