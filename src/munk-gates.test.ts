/**
 * Gate manifest pin: the default `.munk/code-gates.json` matrix keeps exactly
 * seven non-overlapping gates (install / lint / typecheck / build / build-web /
 * test / test-debt-gate), with `pnpm test` as the single full-suite entry, and
 * `pnpm perf:gate` living only in the conditional `.munk/code-gates.perf.json`
 * profile.
 *
 * Static manifest assertions only — no Electron, no temp dirs, no network.
 * Re-adding a single-file duplicate gate or appending `perf-gate` to the
 * default matrix turns this red.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface GateEntry {
  id: string
  cwd: string
  command: string
}

interface GateManifest {
  version: number
  description: string
  gates: GateEntry[]
}

const CORE_GATES = [
  { id: 'install', command: 'pnpm install' },
  { id: 'lint', command: 'pnpm lint' },
  { id: 'typecheck', command: 'pnpm typecheck' },
  { id: 'build', command: 'pnpm build' },
  { id: 'build-web', command: 'pnpm build:web' },
  { id: 'test', command: 'pnpm test' },
  { id: 'test-debt-gate', command: 'node scripts/test-debt-gate.mjs' }
] as const

/**
 * The twenty-nine gate ids that used to duplicate `pnpm test` work file by file.
 * They must stay retired: the suites below are still collected by the single
 * `test` entry.
 */
const RETIRED_GATES = [
  'xlsx-parse-semantics',
  'xlsx-dep-integrity',
  'xlsx-limit-gate',
  'xlsx-workbench-gate',
  'syntax-core',
  'syntax-view',
  'syntax-perf',
  'code-pair-actions',
  'test-compare-request',
  'history-store',
  'cancel-gate',
  'memory-gate',
  'structured-semantics',
  'sync-real-gate',
  'diff-normalize',
  'diff-normalize-real',
  'spike-launch-gate',
  'spike-process-tree-gate',
  'template-default-unchecked',
  'template-single-source',
  'template-sha-mtime',
  'template-cancel-zero-write',
  'template-e2e-real',
  'template-case-collision',
  'template-path-contained',
  'template-move-actions',
  'template-move-verify',
  'history-safety',
  'verify-release-gate'
] as const

/** Former per-file gate suites whose files must survive the matrix slimming. */
const RETAINED_SUITES = [
  'src/core/xlsx/parse.test.ts',
  'src/syntax-perf-gate.test.tsx',
  'src/renderer/src/views/CodeView.switches.test.tsx',
  'src/sync-real-gate.test.ts',
  'src/diff-normalize-real-gate.test.tsx',
  'src/spike-launch-gate.test.ts',
  'src/spike-process-tree-gate.test.ts',
  'src/template-e2e-real-directory.test.ts',
  'src/history-safety-gate.test.ts',
  'src/verify-release-gate.test.ts'
] as const

const SINGLE_ARGV_FORBIDDEN = ['&&', '||', '|', ';'] as const

function readManifest(name: string): GateManifest {
  const raw = readFileSync(resolve(process.cwd(), name), 'utf8')
  return JSON.parse(raw) as GateManifest
}

const defaultManifest = readManifest('.munk/code-gates.json')
const perfProfile = readManifest('.munk/code-gates.perf.json')

function gateById(manifest: GateManifest, id: string): GateEntry | undefined {
  return manifest.gates.find((gate) => gate.id === id)
}

describe('default code-gates matrix', () => {
  it('is version 1 with exactly the seven core gates in fixed order', () => {
    expect(defaultManifest.version).toBe(1)
    expect(defaultManifest.gates).toHaveLength(7)
    expect(defaultManifest.gates.map((gate) => gate.id)).toEqual(
      CORE_GATES.map((gate) => gate.id)
    )
  })

  it('keeps the seven commands verbatim with cwd "."', () => {
    expect(defaultManifest.gates.map((gate) => ({ id: gate.id, command: gate.command }))).toEqual(
      CORE_GATES.map((gate) => ({ id: gate.id, command: gate.command }))
    )
    for (const gate of defaultManifest.gates) {
      expect(gate.cwd, `cwd of ${gate.id}`).toBe('.')
    }
  })

  it('keeps every command a single argv with no shell chaining or redirection', () => {
    for (const gate of defaultManifest.gates) {
      for (const forbidden of SINGLE_ARGV_FORBIDDEN) {
        expect(gate.command, `${gate.id} must not contain ${forbidden}`).not.toContain(forbidden)
      }
      expect(gate.command, `${gate.id} must not redirect`).not.toContain('>')
    }
  })

  it('keeps pnpm test the single full-suite entry and the only test command', () => {
    const testGates = defaultManifest.gates.filter((gate) => gate.command.includes('pnpm test'))
    expect(testGates.map((gate) => gate.id)).toEqual(['test'])
    expect(gateById(defaultManifest, 'test')?.command).toBe('pnpm test')
    for (const gate of defaultManifest.gates) {
      expect(gate.command, `${gate.id} must not carry per-file test arguments`).not.toMatch(
        /pnpm test\s+\S/
      )
    }
  })

  it('keeps the seven gate ids unique and the read-only debt ratchet last', () => {
    const ids = defaultManifest.gates.map((gate) => gate.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.at(-1)).toBe('test-debt-gate')
    expect(existsSync(resolve(process.cwd(), 'scripts/test-debt-gate.mjs'))).toBe(true)
  })

  it('retires every single-file duplicate gate and keeps its suite file', () => {
    for (const id of RETIRED_GATES) {
      expect(gateById(defaultManifest, id), `retired gate ${id}`).toBeUndefined()
    }
    for (const relativePath of RETAINED_SUITES) {
      expect(
        existsSync(resolve(process.cwd(), relativePath)),
        `${relativePath} still collected by pnpm test`
      ).toBe(true)
    }
  })

  it('documents each retained gate in the manifest description', () => {
    const description = defaultManifest.description
    expect(description.trim().length).toBeGreaterThan(0)
    for (const gate of CORE_GATES) {
      expect(description, `manifest: gate id ${gate.id}`).toContain(`\`${gate.id}\``)
    }
    expect(defaultManifest.description).toContain('pnpm test')
  })

  it('does not run the real perf:dir measurement from any default gate', () => {
    for (const gate of defaultManifest.gates) {
      expect(gate.command).not.toContain('perf:dir')
      expect(gate.command).not.toContain('perf:gate')
      expect(gate.id).not.toBe('perf-gate')
    }
  })
})

describe('conditional perf profile', () => {
  it('is version 1 with exactly one perf-gate entry', () => {
    expect(perfProfile.version).toBe(1)
    expect(perfProfile.gates).toHaveLength(1)
    expect(perfProfile.gates[0]).toEqual({
      id: 'perf-gate',
      cwd: '.',
      command: 'pnpm perf:gate'
    })
  })

  it('uses a single argv and never the real perf:dir measurement', () => {
    const command = perfProfile.gates[0]?.command ?? ''
    expect(command).toBe('pnpm perf:gate')
    expect(command).not.toContain('perf:dir')
    for (const forbidden of SINGLE_ARGV_FORBIDDEN) {
      expect(command).not.toContain(forbidden)
    }
  })

  it('documents the conditional trigger and the three sampling disciplines', () => {
    expect(typeof perfProfile.description).toBe('string')
    const description = perfProfile.description.toLowerCase()
    expect(description.trim().length).toBeGreaterThan(0)
    expect(description).toContain('not part of the default')
    expect(description).toContain('code_gates')
    for (const triggerPath of [
      'scan',
      'hash',
      'cache',
      'ipc',
      'tree rendering',
      'cancel'
    ]) {
      expect(description).toContain(triggerPath)
    }
    expect(description).toContain('x.y.0')
    expect(description).toContain('same commit')
    expect(description).toContain('only once')
    expect(description).toContain('digest')
    expect(description).toContain('invalidated')
    expect(description).toContain('difference between the two runs')
  })
})
