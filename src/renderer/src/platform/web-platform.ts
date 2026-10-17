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
}

const ROOT = '/memory'

/**
 * In-memory fallback used when the renderer runs outside Electron (browser tab
 * or `electron-vite dev --rendererOnly`). The built-in sample library is served
 * from `/samples`, so fixtures are readable through the same `PlatformPort`
 * contract the Electron runtime uses; user writes stay under {@link ROOT}.
 */
export function createWebPlatformPort(): PlatformPort {
  const nodes = new Map<string, VirtualNode>([
    [ROOT, { path: ROOT, isDirectory: true, content: '' }]
  ])

  function ensureDirectory(path: string): void {
    if (path === '' || path === '/' || nodes.has(path)) return
    ensureDirectory(path.slice(0, path.lastIndexOf('/')))
    nodes.set(path, { path, isDirectory: true, content: '' })
  }

  for (const sample of SAMPLE_FIXTURE_FILES) {
    ensureDirectory(sample.path.slice(0, sample.path.lastIndexOf('/')))
    nodes.set(sample.path, { path: sample.path, isDirectory: false, content: sample.text })
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

  return {
    kind: 'web',
    selectDirectory: async () => ROOT,
    listDirectory: async (path) => {
      requireNode(path)
      return childrenOf(path).map<DirectoryEntry>((node) => ({
        name: node.path.slice(node.path.lastIndexOf('/') + 1),
        path: node.path,
        isDirectory: node.isDirectory,
        size: node.content.length,
        modifiedMs: 0
      }))
    },
    readTextFile: async (path) => {
      const node = requireNode(path)
      if (node.isDirectory) throw new Error(`Cannot read a directory as text: ${path}`)
      return node.content
    },
    writeTextFile: async (path, content) => {
      nodes.set(path, { path, isDirectory: false, content })
    },
    exists: async (path) => nodes.has(path)
  }
}
