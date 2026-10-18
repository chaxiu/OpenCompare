import { SAMPLE_FIXTURE_FILES } from '@shared/fixtures'
import type { DirectoryEntry, PlatformPort } from '@shared/platform/types'

declare global {
  interface Window {
    /** Injected by the preload bridge when running inside Electron. */
    openComparePlatform?: PlatformPort
  }
}

interface VirtualNode {
  readonly path: string
  readonly isDirectory: boolean
  content: string
  modifiedMs: number
}

const ROOT = '/memory'
const SAMPLE_ROOT = '/samples'

function isSamplePath(path: string): boolean {
  return path === SAMPLE_ROOT || path.startsWith(`${SAMPLE_ROOT}/`)
}

/**
 * In-memory fallback used when the renderer runs outside Electron (browser tab
 * or `electron-vite dev --rendererOnly`). The built-in sample library is served
 * from `/samples`, so fixtures are readable through the same `PlatformPort`
 * contract the Electron runtime uses; user writes stay under {@link ROOT} and
 * the sample mount stays read-only.
 */
export function createWebPlatformPort(): PlatformPort {
  const nodes = new Map<string, VirtualNode>([
    [ROOT, { path: ROOT, isDirectory: true, content: '', modifiedMs: 0 }]
  ])

  function ensureDirectoryNode(path: string): void {
    if (path === '' || path === '/') return
    const parent = path.slice(0, path.lastIndexOf('/'))
    if (parent !== '' && !nodes.has(parent)) ensureDirectoryNode(parent)
    if (!nodes.has(path)) nodes.set(path, { path, isDirectory: true, content: '', modifiedMs: 0 })
  }

  for (const sample of SAMPLE_FIXTURE_FILES) {
    const parent = sample.path.slice(0, sample.path.lastIndexOf('/'))
    if (!nodes.has(parent)) ensureDirectoryNode(parent)
    nodes.set(sample.path, {
      path: sample.path,
      isDirectory: false,
      content: sample.text,
      modifiedMs: 0
    })
  }
  // `/samples` itself carries no explicit node, so make it listable like the
  // Electron virtual mount does.
  if (!nodes.has(SAMPLE_ROOT)) {
    nodes.set(SAMPLE_ROOT, { path: SAMPLE_ROOT, isDirectory: true, content: '', modifiedMs: 0 })
  }

  function requireNode(path: string): VirtualNode {
    const node = nodes.get(path)
    if (!node) throw new Error(`No such virtual path: ${path}`)
    return node
  }

  function childrenOf(path: string): VirtualNode[] {
    const prefix = path === ROOT ? `${ROOT}/` : `${path}/`
    return [...nodes.values()].filter(
      (node) =>
        node.path.startsWith(prefix) && !node.path.slice(prefix.length).includes('/')
    )
  }

  function assertWritable(path: string): string {
    if (isSamplePath(path)) {
      throw new Error(`内置样本库 ${SAMPLE_ROOT} 为只读挂载，不能写入：${path}`)
    }
    return path
  }

  return {
    kind: 'web',
    selectDirectory: async () => ROOT,
    listDirectory: async (path) => {
      const node = requireNode(path)
      if (!node.isDirectory) throw new Error(`Not a directory: ${path}`)
      return childrenOf(path).map<DirectoryEntry>((child) => ({
        name: child.path.slice(child.path.lastIndexOf('/') + 1),
        path: child.path,
        isDirectory: child.isDirectory,
        // Writes replace `content`; the size follows it, and `modifiedMs` can be
        // carried over from a source so a copy stays metadata-faithful.
        size: child.content.length,
        modifiedMs: child.modifiedMs
      }))
    },
    readTextFile: async (path) => {
      const node = requireNode(path)
      if (node.isDirectory) throw new Error(`Cannot read a directory as text: ${path}`)
      return node.content
    },
    writeTextFile: async (path, content, modifiedMs) => {
      assertWritable(path)
      const parent = path.slice(0, path.lastIndexOf('/'))
      if (parent !== '' && !nodes.has(parent)) ensureDirectoryNode(parent)
      nodes.set(path, {
        path,
        isDirectory: false,
        content,
        modifiedMs: typeof modifiedMs === 'number' && Number.isFinite(modifiedMs) ? modifiedMs : 0
      })
    },
    exists: async (path) => nodes.has(path),
    ensureDirectory: async (path) => {
      if (isSamplePath(path)) return
      ensureDirectoryNode(path)
    },
    deleteFile: async (path) => {
      assertWritable(path)
      const node = requireNode(path)
      if (node.isDirectory) throw new Error(`Cannot delete a directory: ${path}`)
      nodes.delete(path)
    },
    temporaryDirectory: async () => ROOT
  }
}
