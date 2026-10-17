import { useVirtualizer } from '@tanstack/react-virtual'
import { diffLines } from 'diff'
import { parse as parseJsonc } from 'jsonc-parser'
import { GitCompare } from 'lucide-react'
import { diff3MergeRegions } from 'node-diff3'
import Papa from 'papaparse'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

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
    expect(GitCompare).toBeDefined()
  })
})
