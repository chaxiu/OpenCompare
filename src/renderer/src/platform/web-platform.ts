import { SAMPLE_FIXTURE_FILES } from '@shared/fixtures'
import type {
  DirectoryEntry,
  DirectoryListing,
  FileDigest,
  FileDialogFilter,
  PlatformPort,
  SaveFileOptions,
  SelectFileOptions
} from '@shared/platform/types'
import { sha256Bytes } from '@core/directory/hash'

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

/** `accept` attribute value for a hidden file input; extensions get their dot. */
function acceptAttribute(filters: readonly FileDialogFilter[] | undefined): string | undefined {
  if (!filters || filters.length === 0) return undefined
  const extensions = filters.flatMap((filter) =>
    filter.extensions.map((extension) => (extension.startsWith('.') ? extension : `.${extension}`))
  )
  return extensions.length === 0 ? undefined : extensions.join(',')
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取所选文件失败。'))
    reader.readAsText(blob)
  })
}

/**
 * Best-effort download of a saved body, so the browser preview produces a real
 * artifact. jsdom (and any runtime without the Blob URL API) silently skips it.
 */
function triggerDownload(path: string, text: string): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = path.slice(path.lastIndexOf('/') + 1) || 'download.txt'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
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

  function entriesOf(path: string): DirectoryEntry[] {
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
  }

  /** One batch slot: the memory tree lists a directory or fails just that slot. */
  function listingOf(path: string): DirectoryListing {
    const node = nodes.get(path)
    if (node === undefined) {
      return { path, ok: false, reason: `无法读取目录 ${path}：路径不存在。` }
    }
    if (!node.isDirectory) {
      return { path, ok: false, reason: `无法读取目录 ${path}：路径不是目录。` }
    }
    return { path, ok: true, entries: entriesOf(path) }
  }

  function assertWritable(path: string): string {
    if (isSamplePath(path)) {
      throw new Error(`内置样本库 ${SAMPLE_ROOT} 为只读挂载，不能写入：${path}`)
    }
    return path
  }

  /**
   * Web cancellation has no real streams to destroy, so it records the id and
   * lets a digest request carrying it settle as the same structured marker the
   * desktop runtime returns. Ids are never reused, so the marker stays harmless.
   */
  const cancelledOperations = new Set<string>()

  function writeNode(path: string, content: string, modifiedMs?: number): void {
    assertWritable(path)
    const parent = path.slice(0, path.lastIndexOf('/'))
    if (parent !== '' && !nodes.has(parent)) ensureDirectoryNode(parent)
    nodes.set(path, {
      path,
      isDirectory: false,
      content,
      modifiedMs: typeof modifiedMs === 'number' && Number.isFinite(modifiedMs) ? modifiedMs : 0
    })
  }

  /**
   * Browser file picker. A native `showOpenDialog` has no web equivalent, so a
   * hidden `<input type="file">` stands in: the picked body is materialised into
   * the memory file system and its virtual path is returned, keeping the
   * `selectFile` → `readTextFile` sequence identical to the Electron runtime.
   * Dismissing the picker resolves `null`.
   */
  function selectFile(options?: SelectFileOptions): Promise<string | null> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(null)
        return
      }

      const input = document.createElement('input')
      input.type = 'file'
      input.dataset.opencomparePicker = 'file'
      if (options?.title !== undefined) input.title = options.title
      const accept = acceptAttribute(options?.filters)
      if (accept !== undefined) input.accept = accept
      input.style.display = 'none'
      document.body.appendChild(input)

      let settled = false
      const finish = (value: string | null): void => {
        if (settled) return
        settled = true
        input.remove()
        resolve(value)
      }

      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (!file) {
          finish(null)
          return
        }
        void readBlobText(file)
          .then((text) => {
            const path = `${ROOT}/${file.name}`
            writeNode(path, text, Date.now())
            finish(path)
          })
          .catch(() => finish(null))
      })
      input.addEventListener('cancel', () => finish(null))
      input.click()
    })
  }

  /**
   * A browser drag & drop exposes the dropped body but no real path, so the body
   * is materialised into the memory file system exactly like {@link selectFile}
   * does; an unreadable handle resolves to `''` and the workbench reports it.
   */
  async function resolveDroppedPath(file: File): Promise<string> {
    try {
      const text = await readBlobText(file)
      const path = `${ROOT}/${file.name}`
      writeNode(path, text, Date.now())
      return path
    } catch {
      return ''
    }
  }

  async function saveFile(options: SaveFileOptions): Promise<string | null> {
    const extension = (options.filters?.[0]?.extensions[0] ?? 'txt').replace(/^\./, '')
    const suggested =
      options.defaultPath && options.defaultPath.length > 0
        ? options.defaultPath
        : `export.${extension}`
    const target = suggested.startsWith('/') ? suggested : `${ROOT}/${suggested}`
    writeNode(target, options.content, Date.now())
    triggerDownload(target, options.content)
    return target
  }

  return {
    kind: 'web',
    // The browser runtime has no process cwd or home directory; both are rooted
    // at the writable memory sandbox so `~` and relative inputs stay predictable.
    homeDirectory: async () => ROOT,
    workingDirectory: async () => ROOT,
    selectDirectory: async () => ROOT,
    selectFile,
    resolveDroppedPath,
    saveFile,
    listDirectory: async (path) => entriesOf(path),
    // Same batch contract as the Electron runtime: one slot per path, in input
    // order, with the sample mount served through the same channel.
    listDirectories: async (paths) => paths.map((path) => listingOf(path)),
    readTextFile: async (path) => {
      const node = requireNode(path)
      if (node.isDirectory) throw new Error(`Cannot read a directory as text: ${path}`)
      return node.content
    },
    // Same raw-byte SHA-256 as the main process (`node:crypto`), computed with
    // the pure JS core so the web runtime stays free of Node and WebCrypto.
    digestFiles: async (paths, options) => {
      const operationId = options?.operationId
      if (operationId !== undefined && cancelledOperations.has(operationId)) {
        return { cancelled: true }
      }
      const encoder = new TextEncoder()
      return paths.map<FileDigest>((path) => {
        const node = nodes.get(path)
        if (node === undefined) {
          return { path, ok: false, reason: `无法读取文件 ${path}：路径不存在或已被移动（ENOENT）。` }
        }
        if (node.isDirectory) {
          return { path, ok: false, reason: `无法读取文件 ${path}：路径不是文件（EISDIR）。` }
        }
        const bytes = encoder.encode(node.content)
        return { path, ok: true, sha256: sha256Bytes(bytes), bytes: bytes.length }
      })
    },
    cancelOperation: async (operationId) => {
      cancelledOperations.add(operationId)
    },
    writeTextFile: async (path, content, modifiedMs) => {
      writeNode(path, content, modifiedMs)
    },
    exists: async (path) => nodes.has(path),
    statPath: async (path) => {
      const node = nodes.get(path)
      if (!node) return 'missing'
      return node.isDirectory ? 'directory' : 'file'
    },
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
    temporaryDirectory: async () => ROOT,
    // The memory file system has no symbolic links, so every path is its own
    // real form. The contract is identical to the desktop runtime's.
    realpath: async (paths) => paths.map((path) => path),
    // The browser runtime has no launch source (`argv` / URL scheme), so the
    // stream is an inert stub with the very same signature as the desktop one.
    onCompareRequest: () => () => undefined,
    compareRequestsReady: async () => undefined
  }
}
