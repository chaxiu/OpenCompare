/**
 * Gate manifest pin: the default `.munk/code-gates.json` matrix stays pure
 * unit/build work (no long-running perf sampling), and `pnpm perf:gate` lives
 * only in the conditional `.munk/code-gates.perf.json` profile.
 *
 * Static manifest assertions only — no Electron, no temp dirs, no network.
 * Restoring or appending `perf-gate` to the default matrix turns this red.
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

const EXPECTED_GATES = [
  { id: 'install', command: 'pnpm install' },
  { id: 'lint', command: 'pnpm lint' },
  { id: 'typecheck', command: 'pnpm typecheck' },
  { id: 'build', command: 'pnpm build' },
  { id: 'build-web', command: 'pnpm build:web' },
  { id: 'test', command: 'pnpm test' },
  {
    id: 'syntax-core',
    command: 'pnpm test src/core/syntax src/core/theme/contrast.test.ts'
  },
  {
    id: 'code-pair-actions',
    command:
      'pnpm test src/core/text/diff.test.ts src/renderer/src/views/CodeView.switches.test.tsx src/renderer/src/workbench/comparisonSwitches.dom.test.tsx src/renderer/src/workbench/directoryCompare.test.ts'
  },
  { id: 'test-compare-request', command: 'pnpm test src/shared/compareRequest.test.ts' },
  { id: 'history-store', command: 'pnpm test src/history-store-gate.test.ts' },
  { id: 'cancel-gate', command: 'pnpm test:cancel' },
  { id: 'memory-gate', command: 'pnpm test:memory' },
  { id: 'structured-semantics', command: 'pnpm test:structured' },
  { id: 'sync-real-gate', command: 'pnpm test:sync-real' },
  {
    id: 'diff-normalize',
    command:
      'pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts'
  },
  {
    id: 'diff-normalize-real',
    command: 'pnpm test src/diff-normalize-real-gate.test.tsx'
  },
  {
    id: 'spike-launch-gate',
    command: 'pnpm test src/spike-launch-gate.test.ts'
  },
  {
    id: 'spike-process-tree-gate',
    command: 'pnpm test src/spike-process-tree-gate.test.ts'
  },
  {
    id: 'template-default-unchecked',
    command: 'pnpm test src/template-gate-default-unchecked.test.ts'
  },
  {
    id: 'template-single-source',
    command: 'pnpm test src/template-gate-single-source.test.ts'
  },
  { id: 'template-sha-mtime', command: 'pnpm test src/template-gate-sha-mtime.test.ts' },
  {
    id: 'template-cancel-zero-write',
    command: 'pnpm test src/template-gate-cancel-zero-write.test.ts'
  },
  { id: 'template-e2e-real', command: 'pnpm test src/template-e2e-real-directory.test.ts' },
  {
    id: 'template-case-collision',
    command: 'pnpm test src/template-gate-case-collision.test.ts'
  },
  {
    id: 'template-path-contained',
    command: 'pnpm test src/template-gate-path-contained.test.ts'
  },
  {
    id: 'template-move-actions',
    command: 'pnpm test src/template-gate-move-actions.test.ts'
  },
  {
    id: 'template-move-verify',
    command: 'pnpm test src/template-gate-move-verify.test.ts'
  },
  {
    id: 'history-safety',
    command:
      'pnpm test src/history-safety-gate.test.ts src/renderer/src/workbench/historySafety.dom.test.tsx src/renderer/src/workbench/historyHome.dom.test.tsx'
  },
  { id: 'verify-release-gate', command: 'pnpm test src/verify-release-gate.test.ts' },
  { id: 'test-debt-gate', command: 'node scripts/test-debt-gate.mjs' }
] as const

/** The nine template placement gate files, mapped by gate id. */
const TEMPLATE_GATES = [
  {
    id: 'template-default-unchecked',
    file: 'src/template-gate-default-unchecked.test.ts',
    marker: 'conflict and overwrite default-unchecked'
  },
  {
    id: 'template-single-source',
    file: 'src/template-gate-single-source.test.ts',
    marker: 'counts and apply read one resolved plan'
  },
  {
    id: 'template-sha-mtime',
    file: 'src/template-gate-sha-mtime.test.ts',
    marker: 'source sha256 and mtimeSec preserved'
  },
  {
    id: 'template-cancel-zero-write',
    file: 'src/template-gate-cancel-zero-write.test.ts',
    marker: 'cancel writes nothing'
  },
  {
    id: 'template-e2e-real',
    file: 'src/template-e2e-real-directory.test.ts',
    marker: 'real-directory end-to-end'
  },
  {
    id: 'template-case-collision',
    file: 'src/template-gate-case-collision.test.ts',
    marker: 'case-only collision and exact-name priority'
  },
  {
    id: 'template-path-contained',
    file: 'src/template-gate-path-contained.test.ts',
    marker: 'relative path containment and path-escape refusal'
  },
  {
    id: 'template-move-actions',
    file: 'src/template-gate-move-actions.test.ts',
    marker: 'per-row action column and explicit move'
  },
  {
    id: 'template-move-verify',
    file: 'src/template-gate-move-verify.test.ts',
    marker: 'real-disk move write verify delete keeps the source'
  }
] as const

/**
 * The one history-safety gate: the pure model / preflight evidence plus the two
 * existing jsdom suites, mapped by the stable behaviour markers in the manifest.
 */
const HISTORY_GATE = {
  id: 'history-safety',
  command:
    'pnpm test src/history-safety-gate.test.ts src/renderer/src/workbench/historySafety.dom.test.tsx src/renderer/src/workbench/historyHome.dom.test.tsx',
  files: [
    'src/history-safety-gate.test.ts',
    'src/renderer/src/workbench/historySafety.dom.test.tsx',
    'src/renderer/src/workbench/historyHome.dom.test.tsx'
  ],
  markers: [
    'history entry add, dedupe, single removal and trim',
    'the explicit clear',
    'mixed-kind 20-record cap trimmed newest-first',
    'bad path detection with the leftmost failing side',
    'switch serialization roundtrip',
    'reopen argument parsing',
    'the empty history list',
    'reopening a directory, file pair or merge',
    'error row marker with single removal',
    'empty envelope after a remount or restart',
    'path privacy in console output'
  ]
} as const

/** Sample-mount / built-in fixture references the template gates may never carry. */
const SAMPLE_MARKERS = ['@shared/fixtures', 'DIRECTORY_SAMPLE_PATHS', ['', 'samples'].join('/')]

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
  it('is version 1 with exactly thirty pure gates in order and no perf-gate', () => {
    expect(defaultManifest.version).toBe(1)
    expect(defaultManifest.gates).toHaveLength(30)
    expect(defaultManifest.gates.map((gate) => gate.id)).toEqual(
      EXPECTED_GATES.map((gate) => gate.id)
    )
    expect(gateById(defaultManifest, 'perf-gate')).toBeUndefined()
  })

  it('keeps the thirty commands verbatim with cwd "."', () => {
    expect(defaultManifest.gates.map((gate) => ({ id: gate.id, command: gate.command }))).toEqual(
      EXPECTED_GATES.map((gate) => ({ id: gate.id, command: gate.command }))
    )
    for (const gate of defaultManifest.gates) {
      expect(gate.cwd).toBe('.')
    }
  })

  it('keeps cancel-gate, memory-gate and the real-disk sync gate in the matrix', () => {
    expect(gateById(defaultManifest, 'cancel-gate')?.command).toBe('pnpm test:cancel')
    expect(gateById(defaultManifest, 'memory-gate')?.command).toBe('pnpm test:memory')
    expect(gateById(defaultManifest, 'sync-real-gate')?.command).toBe('pnpm test:sync-real')
  })

  it('adds one real-disk normalization evidence gate after diff-normalize', () => {
    const ids = defaultManifest.gates.map((gate) => gate.id)
    const index = ids.indexOf('diff-normalize-real')
    expect(index).toBe(ids.indexOf('diff-normalize') + 1)
    expect(defaultManifest.gates[index]?.command).toBe('pnpm test src/diff-normalize-real-gate.test.tsx')
    expect(existsSync(resolve(process.cwd(), 'src/diff-normalize-real-gate.test.tsx'))).toBe(true)
    const description = defaultManifest.description.toLowerCase()
    for (const marker of ['default-on zero differences', 'strict-off newline and encoding differences', 're-enabled zero differences', 'status raw values that ignore the switches']) {
      expect(description, `manifest: normalization marker "${marker}"`).toContain(marker)
    }
    expect(defaultManifest.description).toContain('src/diff-normalize-real-gate.test.tsx')
  })

  it('maps the four single-direction mirror sync behaviours onto real gate files', () => {
    const description = defaultManifest.description

    // The stable behaviour markers the real-disk / dialog suites are pinned to.
    for (const marker of [
      'mirror delete opt-in',
      'idempotent dry-run',
      'mtime and relative structure preserved',
      'link mtime alignment'
    ]) {
      expect(description.toLowerCase(), `manifest: behaviour marker "${marker}"`).toContain(marker)
    }

    // Both gates that carry the behaviour assertions are named in the map.
    for (const gateId of ['sync-real-gate', 'test']) {
      expect(gateById(defaultManifest, gateId), `manifest: gate ${gateId}`).toBeDefined()
      expect(description, `manifest: mapped gate id ${gateId}`).toContain(`\`${gateId}\``)
    }

    // ... and both test files exist under the repo root the gate runs in.
    for (const relativePath of [
      'src/sync-real-gate.test.ts',
      'src/renderer/src/views/directorySyncDialog.test.tsx'
    ]) {
      expect(description, `manifest: mapped test file ${relativePath}`).toContain(relativePath)
      expect(
        existsSync(resolve(process.cwd(), relativePath)),
        `manifest: ${relativePath} exists`
      ).toBe(true)
    }
  })

  it('registers the nine template placement gates before the release driver gate', () => {
    const ids = defaultManifest.gates.map((gate) => gate.id)
    const start = ids.indexOf(TEMPLATE_GATES[0].id)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(ids.slice(start, start + TEMPLATE_GATES.length)).toEqual(
      TEMPLATE_GATES.map((gate) => gate.id)
    )
    expect(ids.slice(start + TEMPLATE_GATES.length)).toEqual([
      'history-safety',
      'verify-release-gate',
      'test-debt-gate'
    ])
    expect(defaultManifest.gates.slice(-2).map((gate) => gate.id)).toEqual(['verify-release-gate', 'test-debt-gate'])
    for (const expected of TEMPLATE_GATES) {
      const gate = gateById(defaultManifest, expected.id)
      expect(gate, `manifest: gate ${expected.id}`).toBeDefined()
      expect(gate?.cwd, `manifest: cwd of ${expected.id}`).toBe('.')
      expect(gate?.command, `manifest: command of ${expected.id}`).toBe(
        `pnpm test ${expected.file}`
      )
      expect(existsSync(resolve(process.cwd(), expected.file)), `manifest: ${expected.file} exists`).toBe(
        true
      )
      for (const forbidden of SINGLE_ARGV_FORBIDDEN) {
        expect(gate?.command, `manifest: ${expected.id} is single argv`).not.toContain(forbidden)
      }
    }
  })

  it('registers the history-safety gate with its three files and behaviour map', () => {
    const ids = defaultManifest.gates.map((gate) => gate.id)
    const gate = gateById(defaultManifest, HISTORY_GATE.id)
    expect(gate, `manifest: gate ${HISTORY_GATE.id}`).toBeDefined()
    expect(ids.indexOf(HISTORY_GATE.id)).toBe(ids.indexOf('template-move-verify') + 1)
    expect(ids.indexOf(HISTORY_GATE.id)).toBe(ids.indexOf('verify-release-gate') - 1)
    expect(gate?.cwd).toBe('.')
    expect(gate?.command).toBe(HISTORY_GATE.command)
    for (const forbidden of SINGLE_ARGV_FORBIDDEN) {
      expect(gate?.command, `manifest: ${HISTORY_GATE.id} is single argv`).not.toContain(forbidden)
    }
    for (const file of HISTORY_GATE.files) {
      expect(gate?.command, `manifest: command names ${file}`).toContain(file)
      expect(existsSync(resolve(process.cwd(), file)), `manifest: ${file} exists`).toBe(true)
    }
    const description = defaultManifest.description
    expect(description, 'manifest: mapped gate id').toContain(`\`${HISTORY_GATE.id}\``)
    for (const file of HISTORY_GATE.files) {
      expect(description, `manifest: mapped test file ${file}`).toContain(file)
    }
    for (const marker of HISTORY_GATE.markers) {
      expect(description.toLowerCase(), `manifest: history marker "${marker}"`).toContain(marker)
    }
  })

  it('maps every template placement behaviour onto the template gates', () => {
    const description = defaultManifest.description
    for (const expected of TEMPLATE_GATES) {
      expect(description.toLowerCase(), `manifest: marker "${expected.marker}"`).toContain(
        expected.marker.toLowerCase()
      )
      expect(description, `manifest: mapped gate id ${expected.id}`).toContain(
        `\`${expected.id}\``
      )
      expect(description, `manifest: mapped file ${expected.file}`).toContain(expected.file)
    }
    // The earlier sync behaviour map stays intact.
    for (const marker of [
      'mirror delete opt-in',
      'idempotent dry-run',
      'mtime and relative structure preserved',
      'link mtime alignment'
    ]) {
      expect(description.toLowerCase(), `manifest: sync marker "${marker}"`).toContain(marker)
    }
  })

  it('keeps every template gate free of sample fixtures and sample mount paths', () => {
    for (const expected of TEMPLATE_GATES) {
      const source = readFileSync(resolve(process.cwd(), expected.file), 'utf8')
      for (const marker of SAMPLE_MARKERS) {
        expect(source, `${expected.file}: must not reference ${marker}`).not.toContain(marker)
      }
    }
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
