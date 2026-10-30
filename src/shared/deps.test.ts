import { useVirtualizer } from '@tanstack/react-virtual'
import { diffLines } from 'diff'
import { parse as parseJsonc } from 'jsonc-parser'
import { diff3MergeRegions } from 'node-diff3'
import Papa from 'papaparse'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES, ICON_PATHS, LUCIDE_VERSION } from '@renderer/assets/icons'

/**
 * Guards the frozen dependency set: every declared algorithm/UI library must be
 * importable and type-resolvable before feature work starts.
 */
describe('core dependencies', () => {
  it('imports every declared runtime library', () => {
    expect(typeof diffLines).toBe('function')
    expect(typeof diff3MergeRegions).toBe('function')
    expect(typeof Papa.parse).toBe('function')
    expect(typeof parseYaml).toBe('function')
    expect(typeof parseJsonc).toBe('function')
    expect(typeof useVirtualizer).toBe('function')
  })

  it('resolves the vendored icon table instead of an icon package', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0)
    for (const name of ICON_NAMES) expect(ICON_PATHS[name].length).toBeGreaterThan(0)
    expect(LUCIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
