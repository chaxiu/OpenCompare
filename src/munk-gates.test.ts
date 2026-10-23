/**
 * Gate manifest pin: the default `.munk/code-gates.json` matrix stays pure
 * unit/build work (no long-running perf sampling), and `pnpm perf:gate` lives
 * only in the conditional `.munk/code-gates.perf.json` profile.
 *
 * Static manifest assertions only — no Electron, no temp dirs, no network.
 * Restoring or appending `perf-gate` to the default matrix turns this red.
 */
import { readFileSync } from 'node:fs'
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

const EXPECTED_GATES = [
  { id: 'install', command: 'pnpm install' },
  { id: 'lint', command: 'pnpm lint' },
  { id: 'typecheck', command: 'pnpm typecheck' },
  { id: 'build', command: 'pnpm build' },
  { id: 'build-web', command: 'pnpm build:web' },
  { id: 'test', command: 'pnpm test' },
  { id: 'test-compare-request', command: 'pnpm test src/shared/compareRequest.test.ts' },
  { id: 'cancel-gate', command: 'pnpm test:cancel' },
  { id: 'memory-gate', command: 'pnpm test:memory' }
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
  it('is version 1 with exactly nine pure gates in order and no perf-gate', () => {
    expect(defaultManifest.version).toBe(1)
    expect(defaultManifest.gates).toHaveLength(9)
    expect(defaultManifest.gates.map((gate) => gate.id)).toEqual(
      EXPECTED_GATES.map((gate) => gate.id)
    )
    expect(gateById(defaultManifest, 'perf-gate')).toBeUndefined()
  })

  it('keeps the nine commands verbatim with cwd "."', () => {
    expect(defaultManifest.gates.map((gate) => ({ id: gate.id, command: gate.command }))).toEqual(
      EXPECTED_GATES.map((gate) => ({ id: gate.id, command: gate.command }))
    )
    for (const gate of defaultManifest.gates) {
      expect(gate.cwd).toBe('.')
    }
  })

  it('keeps cancel-gate and memory-gate in the matrix', () => {
    expect(gateById(defaultManifest, 'cancel-gate')?.command).toBe('pnpm test:cancel')
    expect(gateById(defaultManifest, 'memory-gate')?.command).toBe('pnpm test:memory')
  })

  it('does not run the real perf:dir measurement from any default gate', () => {
    for (const gate of defaultManifest.gates) {
      expect(gate.command).not.toContain('perf:dir')
      expect(gate.command).not.toContain('perf:gate')
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
