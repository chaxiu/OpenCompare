import { describe, expect, it } from 'vitest'
import { scanHardcodedChinese } from '@shared/i18n/scanHardcodedChinese'

/**
 * Every file-level view and pane this work item localizes. A new file-level
 * source file must be added here, otherwise its copy counts as uncovered.
 */
const FILES_COPY_FILES = [
  'src/renderer/src/views/CodeView.tsx',
  'src/renderer/src/views/CsvView.tsx',
  'src/renderer/src/views/StructuredView.tsx',
  'src/renderer/src/components/DiffPane.tsx',
  'src/renderer/src/components/MergePane.tsx',
  'src/renderer/src/components/CodeBlock.tsx'
] as const

describe('file-level copy scan', () => {
  it('keeps the explicit file-view copy list free of hardcoded Chinese', () => {
    expect(scanHardcodedChinese(FILES_COPY_FILES)).toEqual([])
  })
})
