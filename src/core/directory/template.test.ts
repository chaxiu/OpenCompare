import { describe, expect, it } from 'vitest'
import { DIRECTORY_SCENE } from '@shared/fixtures'
import type { DirectoryNode } from '@shared/fixtures'
import type { ListDirectory } from './compare'
import { scanDirectory } from './compare'
import { sha256Hex } from './hash'
import { OperationCancelledError } from '../io'
import {
  createTemplatePlan,
  executeTemplatePlan,
  extractTemplateMatches,
  matchTemplate,
  matchTemplateSlots,
  resolveTemplatePlan,
  verifyTemplateExtraction
} from './template'
import { joinRelativePath } from './sync'

interface FakeFile {
  readonly text: string
  readonly modifiedMs?: number
}

type FakeTree = { readonly [name: string]: FakeFile | FakeTree }

function isFile(value: FakeFile | FakeTree): value is FakeFile {
  return typeof (value as FakeFile).text === 'string'
}

interface FakeFs {
  readonly list: ListDirectory
  readonly readTextFile: (path: string) => Promise<string>
  readonly writeTextFile: (path: string, content: string, modifiedMs?: number) => Promise<void>
  readonly ensureDirectory: (path: string) => Promise<void>
  readonly deleteFile: (path: string) => void
  readonly snapshot: () => FakeTree
}

/** Small mutable in-memory file system for the matcher and extractor. */
function createFakeFs(initial: FakeTree): FakeFs {
  const tree: { [name: string]: FakeFile | FakeTree } = JSON.parse(
    JSON.stringify(initial)
  ) as FakeTree

  function lookup(path: string): FakeFile | { [name: string]: FakeFile | FakeTree } | null {
    if (path === '/' || path === '') return tree
    let node: FakeFile | { [name: string]: FakeFile | FakeTree } = tree as {
      [name: string]: FakeFile | FakeTree
    }
    for (const part of path.replace(/^\/+/, '').split('/')) {
      if (isFile(node)) return null
      const child = node[part] as FakeFile | { [name: string]: FakeFile | FakeTree } | undefined
      if (child === undefined) return null
      node = child
    }
    return node
  }

  function nameOf(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1)
  }

  function ensureDir(path: string): void {
    if (path === '' || path === '/') return
    const separator = path.lastIndexOf('/')
    const parent = separator <= 0 ? '/' : path.slice(0, separator)
    ensureDir(parent)
    const container = lookup(parent)
    if (container === null || isFile(container)) throw new Error(`not a directory: ${parent}`)
    if (container[nameOf(path)] === undefined) container[nameOf(path)] = {}
  }

  function containerOf(path: string): { [name: string]: FakeFile | FakeTree } {
    const separator = path.lastIndexOf('/')
    const dirPath = separator <= 0 ? '/' : path.slice(0, separator)
    const node = lookup(dirPath)
    if (node === null || isFile(node)) throw new Error(`not a directory: ${dirPath}`)
    return node
  }

  return {
    snapshot: () => tree as FakeTree,
    list: async (path) => {
      const node = lookup(path)
      if (node === null || isFile(node)) throw new Error(`not a directory: ${path}`)
      return Object.entries(node).map(([name, child]) => ({
        name,
        path: path === '/' ? `/${name}` : `${path}/${name}`,
        isDirectory: !isFile(child),
        size: isFile(child) ? child.text.length : 0,
        modifiedMs: isFile(child) ? child.modifiedMs ?? 0 : 0
      }))
    },
    readTextFile: async (path) => {
      const node = lookup(path)
      if (node === null || !isFile(node)) throw new Error(`not a file: ${path}`)
      return node.text
    },
    writeTextFile: async (path, content, modifiedMs) => {
      containerOf(path)[nameOf(path)] =
        modifiedMs === undefined ? { text: content } : { text: content, modifiedMs }
    },
    ensureDirectory: async (path) => {
      ensureDir(path)
    },
    deleteFile: (path) => {
      delete containerOf(path)[nameOf(path)]
    }
  }
}

function toTree(node: DirectoryNode): FakeTree {
  const out: { [name: string]: FakeFile | FakeTree } = {}
  for (const child of node.children ?? []) {
    out[child.name] = child.kind === 'file' ? { text: child.text ?? '' } : toTree(child)
  }
  return out
}

describe('template placement matcher', () => {
  const template: FakeTree = {
    a: { 'strings.ts': { text: 'S' } },
    b: { 'SplitPane.tsx': { text: 'P' } },
    c: { 'guide.md': { text: 'G' } },
    d: { 'missing.ts': { text: 'M' } },
    e: { 'twin.ts': { text: 'T' } },
    f: { 'mismatch.ts': { text: 'X' } }
  }
  const incoming: FakeTree = {
    x: { 'strings.ts': { text: 'S' } },
    y: { 'SplitPane.tsx': { text: 'P' } },
    'guide.md': { text: 'G' },
    twin1: { 'twin.ts': { text: 'T' } },
    twin2: { 'twin.ts': { text: 'T' } },
    'mismatch.ts': { text: 'OTHER' },
    junk: { 'unused.ts': { text: 'U' } }
  }

  async function match(fs: FakeFs) {
    const [templateTree, incomingTree] = await Promise.all([
      scanDirectory('/template', fs.list),
      scanDirectory('/incoming', fs.list)
    ])
    return matchTemplate(templateTree, incomingTree, { readTextFile: fs.readTextFile })
  }

  it('maps by name + content hash and reports missing, conflicts and unused', async () => {
    const fs = createFakeFs({ template, incoming })
    const result = await match(fs)

    expect(result.templateFileCount).toBe(6)
    expect(result.matched.map((item) => item.relativePath).sort()).toEqual([
      'a/strings.ts',
      'b/SplitPane.tsx',
      'c/guide.md'
    ])
    expect(result.matched.find((item) => item.relativePath === 'a/strings.ts')?.sourcePath).toBe(
      '/incoming/x/strings.ts'
    )
    expect(result.missing.map((item) => item.relativePath)).toEqual(['d/missing.ts'])

    const reasons = Object.fromEntries(
      result.conflicts.map((item) => [item.relativePath, item.reason])
    )
    expect(reasons).toEqual({ 'e/twin.ts': 'ambiguous', 'f/mismatch.ts': 'content-mismatch' })
    expect(
      result.conflicts.find((item) => item.relativePath === 'e/twin.ts')?.candidates.length
    ).toBe(2)

    expect(result.unused.map((item) => item.relativePath).sort()).toEqual([
      'junk/unused.ts',
      'mismatch.ts',
      'twin1/twin.ts',
      'twin2/twin.ts'
    ])
  })

  it('reads and hashes every file at most once, in linear time, on 1,200 files', async () => {
    const count = 1200
    const templateFiles: { [name: string]: FakeTree } = {}
    const incomingFiles: { [name: string]: FakeTree } = {}

    for (let index = 0; index < count; index += 1) {
      const name = `f${String(index).padStart(4, '0')}.txt`
      const folder = `t${String(index % 40).padStart(3, '0')}`
      templateFiles[folder] = { ...(templateFiles[folder] as FakeTree | undefined), [name]: { text: `body-${index}` } }

      const shuffled = `s${String(index % 37).padStart(3, '0')}`
      const deeper = `d${String(index % 11).padStart(2, '0')}`
      const bucket = (incomingFiles[shuffled] as FakeTree | undefined) ?? {}
      incomingFiles[shuffled] = {
        ...bucket,
        [deeper]: { ...(bucket[deeper] as FakeTree | undefined), [name]: { text: `body-${index}` } }
      }
    }

    const fs = createFakeFs({ template: templateFiles, incoming: incomingFiles })
    const reads: string[] = []
    let hashCalls = 0
    const readTextFile = async (path: string): Promise<string> => {
      reads.push(path)
      return fs.readTextFile(path)
    }

    const [templateTree, incomingTree] = await Promise.all([
      scanDirectory('/template', fs.list),
      scanDirectory('/incoming', fs.list)
    ])
    const result = await matchTemplate(templateTree, incomingTree, {
      readTextFile,
      hash: (text) => {
        hashCalls += 1
        return text
      }
    })

    expect(result.matched.length).toBe(count)
    expect(result.missing).toEqual([])
    expect(result.conflicts).toEqual([])
    // one read for the template slot, one for its single candidate — never more
    expect(reads.length).toBe(count * 2)
    expect(new Set(reads).size).toBe(reads.length)
    expect(hashCalls).toBe(reads.length)
  })

  it('extracts the matched files and verifies the written slots land', async () => {
    const fs = createFakeFs({ template, incoming })
    const templateTree = await scanDirectory('/template', fs.list)
    const incomingTree = await scanDirectory('/incoming', fs.list)
    const result = await matchTemplate(templateTree, incomingTree, {
      readTextFile: fs.readTextFile
    })

    const extraction = await extractTemplateMatches(result, '/out', {
      writeTextFile: fs.writeTextFile,
      ensureDirectory: fs.ensureDirectory
    })
    expect(extraction.written).toBe(3)

    const outputTree = await scanDirectory('/out', fs.list)
    // Full-template verification would replay the 3 slots B never provided;
    // scoping to the written slots reports a fully complete restore.
    const verification = await matchTemplateSlots(
      templateTree,
      outputTree,
      result.matched.map((item) => item.relativePath),
      { readTextFile: fs.readTextFile }
    )
    expect(verification.conflicts).toEqual([])
    expect(verification.missing).toEqual([])
    expect(verification.matched.map((item) => item.relativePath).sort()).toEqual([
      'a/strings.ts',
      'b/SplitPane.tsx',
      'c/guide.md'
    ])

    const out = fs.snapshot().out as FakeTree
    expect(out).toMatchObject({
      a: { 'strings.ts': { text: 'S' } },
      b: { 'SplitPane.tsx': { text: 'P' } },
      c: { 'guide.md': { text: 'G' } }
    })
  })

  it('reports a failed restore as a missing written slot', async () => {
    const fs = createFakeFs({ template, incoming })
    const templateTree = await scanDirectory('/template', fs.list)
    const incomingTree = await scanDirectory('/incoming', fs.list)
    const result = await matchTemplate(templateTree, incomingTree, {
      readTextFile: fs.readTextFile
    })

    // Extract two of the three matches, then verify all three were requested.
    const partial = { ...result, matched: result.matched.slice(0, 2) }
    await extractTemplateMatches(partial, '/partial', {
      writeTextFile: fs.writeTextFile,
      ensureDirectory: fs.ensureDirectory
    })
    const outputTree = await scanDirectory('/partial', fs.list)
    const verification = await matchTemplateSlots(
      templateTree,
      outputTree,
      result.matched.map((item) => item.relativePath),
      { readTextFile: fs.readTextFile }
    )

    expect(verification.missing.map((item) => item.relativePath)).toEqual(['c/guide.md'])
  })

  it('places the built-in shuffled sample tree onto the baseline template', async () => {
    const fs = createFakeFs({
      baseline: toTree(DIRECTORY_SCENE.left),
      incoming: toTree(DIRECTORY_SCENE.scattered)
    })
    const [templateTree, incomingTree] = await Promise.all([
      scanDirectory('/baseline', fs.list),
      scanDirectory('/incoming', fs.list)
    ])
    const result = await matchTemplate(templateTree, incomingTree, {
      readTextFile: fs.readTextFile
    })

    const mapping = Object.fromEntries(
      result.matched.map((item) => [item.relativePath, item.sourcePath])
    )
    expect(mapping['src/core/utils/strings.ts']).toBe('/incoming/misc/deep/deeper/strings.ts')
    expect(mapping['src/ui/workbench/SplitPane.tsx']).toBe('/incoming/misc/ui/SplitPane.tsx')
    expect(mapping['src/core/lexer.ts']).toBe('/incoming/misc/ui/lexer.ts')
    expect(mapping['src/core/engine.ts']).toBe('/incoming/misc/core/engine.ts')

    expect(result.conflicts).toEqual([])
    // Files present in the template but absent from the shuffled tree stay missing.
    expect(result.missing.map((item) => item.relativePath).sort()).toEqual([
      'README.md',
      'assets/logo.png',
      'config/deploy.yaml',
      'docs/changelog.md',
      'src/data/report.csv',
      'src/ui/workbench/Shell.tsx'
    ])
  })
})

describe('template placement plan', () => {
  const template: FakeTree = {
    a: { 'strings.ts': { text: 'S' } },
    b: { 'SplitPane.tsx': { text: 'P' } },
    c: { 'guide.md': { text: 'G' } },
    d: { 'missing.ts': { text: 'M' } },
    e: { 'twin.ts': { text: 'T' } },
    f: { 'mismatch.ts': { text: 'X' } }
  }
  const incoming: FakeTree = {
    x: { 'strings.ts': { text: 'S' } },
    y: { 'SplitPane.tsx': { text: 'P' } },
    'guide.md': { text: 'G' },
    twin1: { 'twin.ts': { text: 'T' } },
    twin2: { 'twin.ts': { text: 'T' } },
    'mismatch.ts': { text: 'OTHER' },
    junk: { 'unused.ts': { text: 'U' } }
  }

  async function planFor(
    files: FakeTree,
    options: {
      outputRoot?: string
      existingFiles?: readonly string[]
      existingDirectories?: readonly string[]
      existingFileHashes?: Readonly<Record<string, string>>
    } = {}
  ) {
    const fs = createFakeFs(files)
    const [templateTree, incomingTree] = await Promise.all([
      scanDirectory('/template', fs.list),
      scanDirectory('/incoming', fs.list)
    ])
    const result = await matchTemplate(templateTree, incomingTree, {
      readTextFile: fs.readTextFile
    })
    return {
      fs,
      result,
      plan: createTemplatePlan(result, { outputRoot: '/out', ...options })
    }
  }

  it('expands every template slot into exactly one partition and derives its target', async () => {
    const { result, plan } = await planFor({ template, incoming })

    expect(plan.counts).toEqual({ matched: 3, missing: 1, conflict: 2, placed: 0, unused: 4 })
    expect(plan.counts.matched).toBe(plan.matched.length)
    expect(plan.counts.missing).toBe(plan.missing.length)
    expect(plan.counts.conflict).toBe(plan.conflicts.length)
    expect(plan.counts.placed).toBe(plan.placed.length)
    expect(plan.counts.unused).toBe(plan.unused.length)

    const slots = [...plan.matched, ...plan.placed, ...plan.missing, ...plan.conflicts]
    expect(slots).toHaveLength(plan.templateFileCount)
    expect(plan.templateFileCount).toBe(result.templateFileCount)

    expect(slots.map((entry) => entry.relativePath).sort()).toEqual([
      'a/strings.ts',
      'b/SplitPane.tsx',
      'c/guide.md',
      'd/missing.ts',
      'e/twin.ts',
      'f/mismatch.ts'
    ])
    for (const entry of slots) {
      expect(entry.targetPath).toBe(joinRelativePath('/out', entry.relativePath))
    }

    expect(plan.matched.every((entry) => entry.outcome === 'matched')).toBe(true)
    expect(plan.missing.map((entry) => entry.outcome)).toEqual(['missing'])
    expect(plan.conflicts.map((entry) => entry.outcome)).toEqual(['conflict', 'conflict'])
    expect(plan.unused.map((entry) => entry.relativePath).sort()).toEqual([
      'junk/unused.ts',
      'mismatch.ts',
      'twin1/twin.ts',
      'twin2/twin.ts'
    ])

    const matched = plan.matched.find((entry) => entry.relativePath === 'a/strings.ts')
    expect(matched?.sourcePath).toBe('/incoming/x/strings.ts')
    expect(matched?.sourceHash).toBe(
      result.matched.find((item) => item.relativePath === 'a/strings.ts')?.hash
    )
  })

  it('only checks a matched slot whose target is absent, and never overwrites silently', async () => {
    const { plan } = await planFor(
      { template, incoming },
      { existingFiles: ['b/SplitPane.tsx'], existingDirectories: ['c/guide.md'] }
    )
    const byPath = new Map(
      [...plan.matched, ...plan.missing, ...plan.conflicts].map((entry) => [
        entry.relativePath,
        entry
      ])
    )

    const plain = byPath.get('a/strings.ts')
    expect(plain?.overwrite).toBe(false)
    expect(plain?.occupiedByDirectory).toBe(false)
    expect(plain?.defaultChecked).toBe(true)

    const overwrite = byPath.get('b/SplitPane.tsx')
    expect(overwrite?.overwrite).toBe(true)
    expect(overwrite?.occupiedByDirectory).toBe(false)
    expect(overwrite?.defaultChecked).toBe(false)

    const occupied = byPath.get('c/guide.md')
    expect(occupied?.overwrite).toBe(false)
    expect(occupied?.occupiedByDirectory).toBe(true)
    expect(occupied?.defaultChecked).toBe(false)

    for (const relativePath of ['d/missing.ts', 'e/twin.ts', 'f/mismatch.ts']) {
      expect(byPath.get(relativePath)?.defaultChecked).toBe(false)
    }

    const defaultChecked = [...plan.matched, ...plan.missing, ...plan.conflicts]
      .filter((entry) => entry.defaultChecked)
      .map((entry) => entry.relativePath)
    const resolved = resolveTemplatePlan(plan, { checkedPaths: defaultChecked })
    expect(resolved.executable.map((entry) => entry.relativePath)).toEqual(['a/strings.ts'])
  })

  it('marks a matched slot whose target already holds the source body as placed', async () => {
    const { plan } = await planFor(
      { template, incoming },
      {
        existingFiles: ['a/strings.ts'],
        existingFileHashes: { 'a/strings.ts': sha256Hex('S') }
      }
    )

    expect(plan.matched.map((entry) => entry.relativePath)).not.toContain('a/strings.ts')
    const placed = plan.placed.find((entry) => entry.relativePath === 'a/strings.ts')
    expect(placed?.outcome).toBe('placed')
    expect(placed?.overwrite).toBe(false)
    expect(placed?.defaultChecked).toBe(false)
    expect(placed?.sourcePath).toBe('/incoming/x/strings.ts')
    expect(placed?.sourceHash).toBe(sha256Hex('S'))
    expect(typeof placed?.sourceModifiedMs).toBe('number')
    expect(plan.counts.placed).toBe(1)

    // A placed slot is neither executable nor rejected, even when checked.
    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/strings.ts'] })
    expect(resolved.executableCount).toBe(0)
    expect(resolved.rejectedCount).toBe(0)
  })

  it('keeps an existing target with different content as an explicit overwrite', async () => {
    const { plan } = await planFor(
      { template, incoming },
      {
        existingFiles: ['a/strings.ts'],
        existingFileHashes: { 'a/strings.ts': sha256Hex('different') }
      }
    )

    const entry = plan.matched.find((item) => item.relativePath === 'a/strings.ts')
    expect(entry?.outcome).toBe('matched')
    expect(entry?.overwrite).toBe(true)
    expect(entry?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])

    // Only an explicit check makes it executable.
    expect(resolveTemplatePlan(plan, {}).executableCount).toBe(0)
    expect(
      resolveTemplatePlan(plan, { checkedPaths: ['a/strings.ts'] }).executable
        .map((item) => item.relativePath)
    ).toEqual(['a/strings.ts'])
  })

  it('marks a conflict slot as placed when its target matches one candidate body', async () => {
    const { plan } = await planFor(
      { template, incoming },
      {
        existingFiles: ['e/twin.ts', 'f/mismatch.ts'],
        existingFileHashes: {
          'e/twin.ts': sha256Hex('T'),
          'f/mismatch.ts': sha256Hex('OTHER')
        }
      }
    )

    expect(plan.conflicts).toEqual([])
    const ambiguous = plan.placed.find((entry) => entry.relativePath === 'e/twin.ts')
    expect(ambiguous?.outcome).toBe('placed')
    expect(ambiguous?.overwrite).toBe(false)
    expect(ambiguous?.defaultChecked).toBe(false)
    expect(ambiguous?.conflictReason).toBe('ambiguous')
    expect(ambiguous?.candidates).toHaveLength(2)

    const mismatch = plan.placed.find((entry) => entry.relativePath === 'f/mismatch.ts')
    expect(mismatch?.conflictReason).toBe('content-mismatch')
    expect(mismatch?.candidates).toHaveLength(1)

    const resolved = resolveTemplatePlan(plan, {
      checkedPaths: ['e/twin.ts', 'f/mismatch.ts']
    })
    expect(resolved.executableCount).toBe(0)
    expect(resolved.rejectedCount).toBe(0)
  })

  it('keeps a conflict when the target body matches no candidate', async () => {
    const { plan } = await planFor(
      { template, incoming },
      {
        existingFiles: ['e/twin.ts'],
        existingFileHashes: { 'e/twin.ts': sha256Hex('not a candidate') }
      }
    )

    const entry = plan.conflicts.find((item) => item.relativePath === 'e/twin.ts')
    expect(entry?.outcome).toBe('conflict')
    expect(entry?.overwrite).toBe(true)
    expect(entry?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
  })

  it('never places a missing slot or a directory-occupied target', async () => {
    const { plan } = await planFor(
      { template, incoming },
      {
        existingFiles: ['d/missing.ts'],
        existingFileHashes: { 'd/missing.ts': sha256Hex('M') },
        existingDirectories: ['c/guide.md']
      }
    )
    const missing = plan.missing.find((entry) => entry.relativePath === 'd/missing.ts')
    expect(missing?.outcome).toBe('missing')
    expect(missing?.defaultChecked).toBe(false)

    const occupied = plan.matched.find((entry) => entry.relativePath === 'c/guide.md')
    expect(occupied?.outcome).toBe('matched')
    expect(occupied?.occupiedByDirectory).toBe(true)
    expect(occupied?.overwrite).toBe(false)
    expect(plan.placed).toEqual([])
  })

  it('keeps the placed partition equal to its array and the slot total', async () => {
    const { plan } = await planFor(
      { template, incoming },
      {
        existingFiles: ['a/strings.ts', 'e/twin.ts'],
        existingFileHashes: {
          'a/strings.ts': sha256Hex('S'),
          'e/twin.ts': sha256Hex('T')
        },
        existingDirectories: ['c/guide.md']
      }
    )

    expect(plan.counts.placed).toBe(plan.placed.length)
    expect(plan.counts.placed).toBe(2)
    expect(plan.templateFileCount).toBe(
      plan.counts.matched + plan.counts.missing + plan.counts.conflict + plan.counts.placed
    )
    expect(plan.counts.matched).toBe(2)
    expect(plan.counts.missing).toBe(1)
    expect(plan.counts.conflict).toBe(1)
  })

  it('refuses a checked target that a directory occupies instead of throwing', async () => {
    const { plan } = await planFor(
      { template, incoming },
      { existingFiles: ['a/strings.ts'], existingDirectories: ['b/SplitPane.tsx'] }
    )

    const resolved = resolveTemplatePlan(plan, {
      checkedPaths: ['a/strings.ts', 'b/SplitPane.tsx']
    })

    expect(resolved.executable.map((entry) => entry.relativePath)).toEqual(['a/strings.ts'])
    expect(resolved.rejected).toEqual([
      { relativePath: 'b/SplitPane.tsx', reason: 'target-occupied-by-directory' }
    ])
    expect(resolved.rejectedCount).toBe(resolved.rejected.length)
  })

  it('resolves only checked rows with an in-set source into one manifest', async () => {
    const { plan } = await planFor({ template, incoming })

    const resolved = resolveTemplatePlan(plan, {
      checkedPaths: ['a/strings.ts', 'a/strings.ts', 'b/SplitPane.tsx', 'd/missing.ts', 'e/twin.ts', 'f/mismatch.ts'],
      conflictChoices: {
        'e/twin.ts': '/incoming/twin2/twin.ts',
        'f/mismatch.ts': '/incoming/not-a-candidate.ts'
      }
    })

    // A duplicate check collapses; the checked conflict with an in-set candidate runs.
    expect(resolved.executable.map((entry) => entry.relativePath)).toEqual([
      'a/strings.ts',
      'b/SplitPane.tsx',
      'e/twin.ts'
    ])
    expect(resolved.executableCount).toBe(resolved.executable.length)
    expect(resolved.executable.find((entry) => entry.relativePath === 'e/twin.ts')?.sourcePath).toBe(
      '/incoming/twin2/twin.ts'
    )
    expect(resolved.rejected).toEqual([
      { relativePath: 'd/missing.ts', reason: 'not-executable' },
      { relativePath: 'f/mismatch.ts', reason: 'conflict-candidate-outside-set' }
    ])

    // An unchecked conflict never runs, and a checked one without a choice is
    // reported as unresolved instead of silently picking a candidate.
    const unchecked = resolveTemplatePlan(plan, { checkedPaths: ['a/strings.ts'] })
    expect(unchecked.executable.map((entry) => entry.relativePath)).toEqual(['a/strings.ts'])
    const unresolved = resolveTemplatePlan(plan, { checkedPaths: ['e/twin.ts'] })
    expect(unresolved.executable).toEqual([])
    expect(unresolved.rejected).toEqual([{ relativePath: 'e/twin.ts', reason: 'conflict-unresolved' }])
  })

  it('keeps only the first slot when two slots resolve to the same source', async () => {
    const { plan } = await planFor({
      template: { a: { 'dup.ts': { text: 'D' } }, b: { 'dup.ts': { text: 'D' } } },
      incoming: { x: { 'dup.ts': { text: 'D' } } }
    })
    expect(plan.matched.map((entry) => entry.sourcePath)).toEqual([
      '/incoming/x/dup.ts',
      '/incoming/x/dup.ts'
    ])

    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/dup.ts', 'b/dup.ts'] })
    expect(resolved.executable.map((entry) => entry.relativePath)).toEqual(['a/dup.ts'])
    expect(resolved.rejected).toEqual([{ relativePath: 'b/dup.ts', reason: 'duplicate-source' }])
  })

  it('writes exactly the resolved manifest and shares counts with the plan', async () => {
    const { fs, plan } = await planFor({ template, incoming })
    const resolved = resolveTemplatePlan(plan, {
      checkedPaths: ['a/strings.ts', 'b/SplitPane.tsx']
    })

    expect(resolved.counts).toBe(plan.counts)
    expect(resolved.executableCount).toBe(resolved.executable.length)

    const writes: string[] = []
    const execution = await executeTemplatePlan(resolved, {
      readTextFile: fs.readTextFile,
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push(path)
        await fs.writeTextFile(path, content, modifiedMs)
      },
      ensureDirectory: fs.ensureDirectory
    })

    expect(execution.writtenCount).toBe(resolved.executableCount)
    expect(execution.written).toHaveLength(resolved.executableCount)
    expect(writes).toEqual(execution.written.map((entry) => entry.targetPath))
    expect(writes).not.toContain('/out/c/guide.md')
  })
})

describe('template plan execution and verification', () => {
  const SOURCE_MTIME = 1_600_000_000_123

  async function prepare(files: FakeTree) {
    const fs = createFakeFs(files)
    const [templateTree, incomingTree] = await Promise.all([
      scanDirectory('/template', fs.list),
      scanDirectory('/incoming', fs.list)
    ])
    const result = await matchTemplate(templateTree, incomingTree, {
      readTextFile: fs.readTextFile
    })
    const plan = createTemplatePlan(result, { outputRoot: '/out' })
    return { fs, plan }
  }

  function twoSlotFixture(): FakeTree {
    return {
      template: {
        a: { 'one.txt': { text: 'ONE', modifiedMs: SOURCE_MTIME } },
        b: { 'two.txt': { text: 'TWO', modifiedMs: SOURCE_MTIME + 1_000 } }
      },
      incoming: {
        x: { 'one.txt': { text: 'ONE', modifiedMs: SOURCE_MTIME } },
        y: { 'two.txt': { text: 'TWO', modifiedMs: SOURCE_MTIME + 1_000 } }
      }
    }
  }

  function executableIo(fs: FakeFs, onWrite?: (path: string) => void) {
    const writes: { path: string; content: string; modifiedMs?: number }[] = []
    let ensureCalls = 0
    return {
      writes,
      ensureCalls: () => ensureCalls,
      io: {
        readTextFile: fs.readTextFile,
        ensureDirectory: async (path: string) => {
          ensureCalls += 1
          await fs.ensureDirectory(path)
        },
        writeTextFile: async (path: string, content: string, modifiedMs?: number) => {
          writes.push({ path, content, modifiedMs })
          await fs.writeTextFile(path, content, modifiedMs)
          onWrite?.(path)
        }
      }
    }
  }

  it('hands the source mtime to every write and verifies at second granularity', async () => {
    const { fs, plan } = await prepare(twoSlotFixture())
    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/one.txt', 'b/two.txt'] })
    const harness = executableIo(fs)

    const execution = await executeTemplatePlan(resolved, harness.io)
    expect(harness.writes.map((write) => write.modifiedMs)).toEqual([SOURCE_MTIME, SOURCE_MTIME + 1_000])
    expect(execution.written.map((entry) => entry.modifiedMs)).toEqual([
      SOURCE_MTIME,
      SOURCE_MTIME + 1_000
    ])
    expect(execution.written.map((entry) => entry.sourceHash)).toEqual(
      resolved.executable.map((entry) => entry.sourceHash)
    )

    const verification = await verifyTemplateExtraction(execution.written, {
      readTextFile: fs.readTextFile,
      listDirectory: fs.list
    })
    expect(verification.verified).toBe(2)
    expect(verification.failed).toBe(0)
    expect(verification.entries.map((entry) => entry.expectedMtimeSec)).toEqual([
      1_600_000_000,
      1_600_000_001
    ])
    expect(verification.entries.map((entry) => entry.actualMtimeSec)).toEqual([
      1_600_000_000,
      1_600_000_001
    ])

    // A sub-second write precision difference stays on the same second and passes.
    await fs.writeTextFile('/out/a/one.txt', 'ONE', SOURCE_MTIME + 876)
    const sameSecond = await verifyTemplateExtraction(execution.written, {
      readTextFile: fs.readTextFile,
      listDirectory: fs.list
    })
    expect(sameSecond.verified).toBe(2)

    // A real second of drift is reported as an mtime mismatch.
    await fs.writeTextFile('/out/a/one.txt', 'ONE', SOURCE_MTIME + 1_800)
    const drifted = await verifyTemplateExtraction(execution.written, {
      readTextFile: fs.readTextFile,
      listDirectory: fs.list
    })
    expect(drifted.verified).toBe(1)
    expect(drifted.entries[0]).toMatchObject({
      relativePath: 'a/one.txt',
      ok: false,
      reason: 'mtime',
      expectedMtimeSec: 1_600_000_000,
      actualMtimeSec: 1_600_000_001
    })
  })

  it('re-verifies the source sha256 and reports hash, missing and directory targets', async () => {
    const { fs, plan } = await prepare(twoSlotFixture())
    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/one.txt', 'b/two.txt'] })
    const execution = await executeTemplatePlan(resolved, executableIo(fs).io)
    expect(execution.writtenCount).toBe(2)

    const io = { readTextFile: fs.readTextFile, listDirectory: fs.list }

    // Tampering with a written body is a hash failure, never a silent pass.
    await fs.writeTextFile('/out/a/one.txt', 'ONE-TAMPERED', SOURCE_MTIME)
    const tampered = await verifyTemplateExtraction(execution.written, io)
    expect(tampered.verified).toBe(1)
    expect(tampered.failed).toBe(1)
    expect(tampered.entries[0]).toMatchObject({ ok: false, reason: 'hash' })
    expect(tampered.entries[0].actualHash).not.toBe(tampered.entries[0].expectedHash)

    // A deleted target is reported as missing.
    fs.deleteFile('/out/a/one.txt')
    const deleted = await verifyTemplateExtraction(execution.written, io)
    expect(deleted.verified).toBe(1)
    expect(deleted.entries[0]).toMatchObject({ ok: false, reason: 'missing', actualHash: null })

    // A directory sitting on a written path is distinguishable too.
    await fs.ensureDirectory('/out/a/one.txt')
    const occupied = await verifyTemplateExtraction(execution.written, io)
    expect(occupied.entries[0]).toMatchObject({ ok: false, reason: 'directory' })
  })

  it('writes zero bytes for a slot whose source drifted after planning', async () => {
    const { fs, plan } = await prepare(twoSlotFixture())
    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/one.txt', 'b/two.txt'] })

    // The source changes between the plan and the run.
    await fs.writeTextFile('/incoming/x/one.txt', 'ONE-CHANGED', SOURCE_MTIME)

    const harness = executableIo(fs)
    const execution = await executeTemplatePlan(resolved, harness.io)

    expect(harness.writes.map((write) => write.path)).toEqual(['/out/b/two.txt'])
    expect(execution.written.map((entry) => entry.relativePath)).toEqual(['b/two.txt'])
    expect(execution.failed).toEqual([
      {
        relativePath: 'a/one.txt',
        sourcePath: '/incoming/x/one.txt',
        targetPath: '/out/a/one.txt',
        reason: 'source-drift'
      }
    ])
    expect(execution.failedCount).toBe(1)
  })

  it('cancels before the first write with zero directory and file calls', async () => {
    const { fs, plan } = await prepare(twoSlotFixture())
    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/one.txt', 'b/two.txt'] })
    const controller = new AbortController()
    controller.abort()
    const harness = executableIo(fs)

    const error = await executeTemplatePlan(resolved, harness.io, {
      signal: controller.signal
    }).then(
      () => undefined,
      (reason: unknown) => reason
    )

    expect(error).toBeInstanceOf(OperationCancelledError)
    expect(harness.writes).toEqual([])
    expect(harness.ensureCalls()).toBe(0)
    expect(fs.snapshot().out).toBeUndefined()
  })

  it('stops after the in-flight write on a mid-run abort, leaving no half-written file', async () => {
    const { fs, plan } = await prepare(twoSlotFixture())
    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['a/one.txt', 'b/two.txt'] })
    const controller = new AbortController()
    const harness = executableIo(fs, (path) => {
      if (path === '/out/a/one.txt') controller.abort()
    })

    const execution = await executeTemplatePlan(resolved, harness.io, {
      signal: controller.signal
    })

    expect(execution.cancelled).toBe(true)
    // Only the in-flight row landed; the second selected row was never started.
    expect(execution.written.map((entry) => entry.relativePath)).toEqual(['a/one.txt'])
    expect(harness.writes.map((write) => write.path)).toEqual(['/out/a/one.txt'])
    expect(harness.writes.some((write) => write.path.endsWith('.tmp'))).toBe(false)
    expect(fs.snapshot()).toEqual({
      template: {
        a: { 'one.txt': { text: 'ONE', modifiedMs: SOURCE_MTIME } },
        b: { 'two.txt': { text: 'TWO', modifiedMs: SOURCE_MTIME + 1_000 } }
      },
      incoming: {
        x: { 'one.txt': { text: 'ONE', modifiedMs: SOURCE_MTIME } },
        y: { 'two.txt': { text: 'TWO', modifiedMs: SOURCE_MTIME + 1_000 } }
      },
      out: { a: { 'one.txt': { text: 'ONE', modifiedMs: SOURCE_MTIME } } }
    })
  })
})

describe('template case-only collision', () => {
  const CASE_MTIME = 1_600_000_000_100

  async function scanTrees(fs: FakeFs) {
    const [templateTree, incomingTree] = await Promise.all([
      scanDirectory('/template', fs.list),
      scanDirectory('/incoming', fs.list)
    ])
    return { templateTree, incomingTree }
  }

  async function matchTrees(fs: FakeFs) {
    const { templateTree, incomingTree } = await scanTrees(fs)
    return matchTemplate(templateTree, incomingTree, { readTextFile: fs.readTextFile })
  }

  const caseTemplate: FakeTree = { 'Logo.png': { text: 'NEW' } }

  it('matches a case-only source with the same body and consumes it', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'NEW' } } }
    })
    const result = await matchTrees(fs)

    expect(result.matched.map((item) => item.relativePath)).toEqual(['Logo.png'])
    expect(result.matched[0]?.sourcePath).toBe('/incoming/bucket/logo.png')
    expect(result.conflicts).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unused).toEqual([])
  })

  it('reports a case-only source with a different body as content-mismatch', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'OTHER' } } }
    })
    const result = await matchTrees(fs)

    expect(result.matched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unused).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      relativePath: 'Logo.png',
      reason: 'content-mismatch'
    })
    expect(result.conflicts[0]?.candidates).toHaveLength(1)
  })

  it('prefers the exact spelling over a case-only variant', async () => {
    const mismatch = createFakeFs({
      template: caseTemplate,
      incoming: {
        'Logo.png': { text: 'OTHER' },
        bucket: { 'logo.png': { text: 'NEW' } }
      }
    })
    const mismatchResult = await matchTrees(mismatch)
    expect(mismatchResult.matched).toEqual([])
    expect(mismatchResult.conflicts[0]).toMatchObject({
      relativePath: 'Logo.png',
      reason: 'content-mismatch'
    })
    expect(mismatchResult.conflicts[0]?.candidates.map((candidate) => candidate.path)).toEqual([
      '/incoming/Logo.png'
    ])
    expect(mismatchResult.unused.map((item) => item.relativePath).sort()).toEqual([
      'Logo.png',
      'bucket/logo.png'
    ])

    const exact = createFakeFs({
      template: caseTemplate,
      incoming: {
        'Logo.png': { text: 'NEW' },
        bucket: { 'logo.png': { text: 'OTHER' } }
      }
    })
    const exactResult = await matchTrees(exact)
    expect(exactResult.matched.map((item) => item.sourcePath)).toEqual(['/incoming/Logo.png'])
    expect(exactResult.conflicts).toEqual([])
    expect(exactResult.unused.map((item) => item.relativePath)).toEqual(['bucket/logo.png'])
  })

  it('reports two case-only variants as an ambiguous conflict', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: {
        a: { 'logo.png': { text: 'NEW' } },
        b: { 'LOGO.PNG': { text: 'NEW' } }
      }
    })
    const result = await matchTrees(fs)

    expect(result.matched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unused).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({ relativePath: 'Logo.png', reason: 'ambiguous' })
    expect(result.conflicts[0]?.candidates).toHaveLength(2)
  })

  it('makes a case-only target with different content an unchecked overwrite', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'NEW' } } }
    })
    const result = await matchTrees(fs)
    const plan = createTemplatePlan(result, {
      outputRoot: '/out',
      existingFiles: ['logo.png'],
      existingFileHashes: { 'logo.png': sha256Hex('OLD') }
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('matched')
    expect(row?.overwrite).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
    expect(resolveTemplatePlan(plan, {}).executableCount).toBe(0)
    expect(
      resolveTemplatePlan(plan, { checkedPaths: ['Logo.png'] }).executable.map(
        (entry) => entry.relativePath
      )
    ).toEqual(['Logo.png'])
  })

  it('places a case-only target that already holds the source body', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'NEW' } } }
    })
    const result = await matchTrees(fs)
    const plan = createTemplatePlan(result, {
      outputRoot: '/out',
      existingFiles: ['logo.png'],
      existingFileHashes: { 'logo.png': sha256Hex('NEW') }
    })

    const row = plan.placed.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('placed')
    expect(row?.overwrite).toBe(false)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.matched).toEqual([])

    const resolved = resolveTemplatePlan(plan, { checkedPaths: ['Logo.png'] })
    expect(resolved.executableCount).toBe(0)
    expect(resolved.rejectedCount).toBe(0)
  })

  it('keeps the exact spelling ahead of a matching case variant', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'NEW' } } }
    })
    const result = await matchTrees(fs)
    const plan = createTemplatePlan(result, {
      outputRoot: '/out',
      existingFiles: ['Logo.png', 'logo.png'],
      existingFileHashes: {
        'Logo.png': sha256Hex('OLD'),
        'logo.png': sha256Hex('NEW')
      }
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('matched')
    expect(row?.overwrite).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
  })

  it('never places when several case variants hold the target', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'NEW' } } }
    })
    const result = await matchTrees(fs)
    const plan = createTemplatePlan(result, {
      outputRoot: '/out',
      existingFiles: ['logo.png', 'LOGO.PNG'],
      existingFileHashes: {
        'logo.png': sha256Hex('NEW'),
        'LOGO.PNG': sha256Hex('NEW')
      }
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('matched')
    expect(row?.overwrite).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
  })

  it('treats a case-only directory as an occupied target', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      incoming: { bucket: { 'logo.png': { text: 'NEW' } } }
    })
    const result = await matchTrees(fs)
    const plan = createTemplatePlan(result, {
      outputRoot: '/out',
      existingDirectories: ['logo.png']
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.occupiedByDirectory).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(resolveTemplatePlan(plan, { checkedPaths: ['Logo.png'] }).rejected).toEqual([
      { relativePath: 'Logo.png', reason: 'target-occupied-by-directory' }
    ])
  })

  it('verifies a case-only output entry instead of reporting it missing', async () => {
    const fs = createFakeFs({
      out: { 'logo.png': { text: 'NEW', modifiedMs: CASE_MTIME + 800 } }
    })
    const written = [
      {
        relativePath: 'Logo.png',
        sourcePath: '/incoming/bucket/logo.png',
        targetPath: '/out/Logo.png',
        sourceHash: sha256Hex('NEW'),
        modifiedMs: CASE_MTIME
      }
    ]
    const io = { readTextFile: fs.readTextFile, listDirectory: fs.list }

    const verification = await verifyTemplateExtraction(written, io)
    expect(verification.verified).toBe(1)
    expect(verification.failed).toBe(0)
    expect(verification.entries[0]).toMatchObject({ ok: true, reason: undefined })

    await fs.writeTextFile('/out/logo.png', 'DIFFERENT', CASE_MTIME)
    const hashMismatch = await verifyTemplateExtraction(written, io)
    expect(hashMismatch.entries[0]).toMatchObject({ ok: false, reason: 'hash' })

    await fs.writeTextFile('/out/logo.png', 'NEW', CASE_MTIME + 1_000)
    const mtimeMismatch = await verifyTemplateExtraction(written, io)
    expect(mtimeMismatch.entries[0]).toMatchObject({ ok: false, reason: 'mtime' })
  })

  it('matches case-only output slots after extraction', async () => {
    const fs = createFakeFs({
      template: caseTemplate,
      out: { 'logo.png': { text: 'NEW' } }
    })
    const templateTree = await scanDirectory('/template', fs.list)
    const outputTree = await scanDirectory('/out', fs.list)

    const result = await matchTemplateSlots(templateTree, outputTree, ['Logo.png'], {
      readTextFile: fs.readTextFile
    })
    expect(result.matched.map((item) => item.relativePath)).toEqual(['Logo.png'])
    expect(result.matched[0]?.sourcePath).toBe('/out/logo.png')
    expect(result.missing).toEqual([])
    expect(result.conflicts).toEqual([])
  })
})
