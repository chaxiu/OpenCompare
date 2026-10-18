import { describe, expect, it } from 'vitest'
import { DIRECTORY_SCENE } from '@shared/fixtures'
import type { DirectoryNode } from '@shared/fixtures'
import type { ListDirectory } from './compare'
import { scanDirectory } from './compare'
import { matchTemplate, extractTemplateMatches, matchTemplateSlots } from './template'

interface FakeFile {
  readonly text: string
}

type FakeTree = { readonly [name: string]: FakeFile | FakeTree }

function isFile(value: FakeFile | FakeTree): value is FakeFile {
  return typeof (value as FakeFile).text === 'string'
}

interface FakeFs {
  readonly list: ListDirectory
  readonly readTextFile: (path: string) => Promise<string>
  readonly writeTextFile: (path: string, content: string) => Promise<void>
  readonly ensureDirectory: (path: string) => Promise<void>
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
        modifiedMs: 0
      }))
    },
    readTextFile: async (path) => {
      const node = lookup(path)
      if (node === null || !isFile(node)) throw new Error(`not a file: ${path}`)
      return node.text
    },
    writeTextFile: async (path, content) => {
      containerOf(path)[nameOf(path)] = { text: content }
    },
    ensureDirectory: async (path) => {
      ensureDir(path)
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
