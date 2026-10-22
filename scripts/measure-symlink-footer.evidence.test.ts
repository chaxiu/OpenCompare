/**
 * Manual evidence harness for `cp-symlink-semantics`: runs one full real
 * directory comparison through the same core + platform entry points the app
 * uses, and prints the footer numbers as JSON.
 *
 * It intentionally contains no assertions and never runs under `pnpm test`;
 * run it with `pnpm measure:symlink`. The `OPENCOMPARE_SYMLINK_EVIDENCE` marker
 * line goes to stdout, while an `OPENCOMPARE_EVIDENCE_OUT` file receives plain
 * JSON (see `symlink-evidence-format.ts`). The same file also runs against the
 * pre-change commit (it only touches APIs that already existed), which is how
 * the old footer numbers were produced.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined })
  },
  ipcMain: { handle: () => {} }
}))

import { compareDirectories, createComparisonCache } from '../src/core/directory/compare'
import { digestFiles, listDirectories } from '../src/main/platform/electron-platform'
import { formatSymlinkEvidence } from './symlink-evidence-format'

const LEFT = process.env.OPENCOMPARE_EVIDENCE_LEFT ?? '/Users/zhutao/Cursor/DawnChat'
const RIGHT = process.env.OPENCOMPARE_EVIDENCE_RIGHT ?? '/Users/zhutao/Cursor/ZenMind'

interface LinkCensus {
  links: number
  directoryLinks: number
  fileLinks: number
  danglingLinks: number
}

/** Counts symbolic links without ever descending into a link target. */
async function censusLinks(root: string): Promise<LinkCensus> {
  const census: LinkCensus = { links: 0, directoryLinks: 0, fileLinks: 0, danglingLinks: 0 }
  const queue = [root]
  while (queue.length > 0) {
    const directory = queue.pop() as string
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        census.links += 1
        try {
          const target = await stat(path)
          if (target.isDirectory()) census.directoryLinks += 1
          else census.fileLinks += 1
        } catch {
          census.danglingLinks += 1
        }
        continue
      }
      if (entry.isDirectory()) queue.push(path)
    }
  }
  return census
}

describe('real DawnChat ↔ ZenMind symlink footer evidence', () => {
  it('prints the comparison footer numbers', async () => {
    const startedAt = Date.now()
    const comparison = await compareDirectories(
      LEFT,
      RIGHT,
      async (path) => {
        const [listing] = await listDirectories([path])
        if (!listing.ok) throw new Error(listing.reason)
        return [...listing.entries]
      },
      (path) => readFile(path, 'utf8'),
      createComparisonCache(),
      undefined,
      { digestFiles: (paths) => digestFiles(paths) }
    )
    const [leftCensus, rightCensus] = await Promise.all([censusLinks(LEFT), censusLinks(RIGHT)])
    const report = {
      left: LEFT,
      right: RIGHT,
      elapsedMs: Date.now() - startedAt,
      fileCount: comparison.fileCount,
      counts: comparison.counts,
      skipped: comparison.skipped,
      leftSkipped: (comparison as { leftSkipped?: number }).leftSkipped,
      rightSkipped: (comparison as { rightSkipped?: number }).rightSkipped,
      linkCensus: { left: leftCensus, right: rightCensus }
    }
    const { json, handoff } = formatSymlinkEvidence(report)
    const out = process.env.OPENCOMPARE_EVIDENCE_OUT
    // The marker line always goes to stdout; the OUT file is plain JSON so it
    // stays machine-readable (`JSON.parse`) instead of a marker-prefixed blob.
    if (out !== undefined) await writeFile(out, json, 'utf8')
    process.stdout.write(handoff)
  })
})
