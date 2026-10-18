/**
 * Renderer-side directory comparison orchestration: binds the pure engine in
 * `@core/directory` to `PlatformPort`, and turns results into workbench
 * sessions (the directory session itself, plus file drilldown sessions).
 */
import type { PlatformPort } from '@shared/platform/types'
import { compareDirectories } from '@core/directory/compare'
import type {
  ComparisonCache,
  DirectoryComparison,
  DirectoryDiffNode
} from '@core/directory/compare'
import type { DrilldownTarget } from './fileKinds'
import type { AdhocFilePair, WorkbenchSession } from './session'
import { countTextLines, parseCsvTable } from './session'

/** Stable id of the single directory-comparison session. */
export const DIRECTORY_SESSION_ID = 'session-directory'

/** Recursively scans both roots and compares them, reading bodies only when needed. */
export function compareDirectoryRoots(
  platform: PlatformPort,
  leftRoot: string,
  rightRoot: string,
  cache: ComparisonCache
): Promise<DirectoryComparison> {
  return compareDirectories(
    leftRoot,
    rightRoot,
    (path) => platform.listDirectory(path),
    (path) => platform.readTextFile(path),
    cache
  )
}

/** Builds the directory session whose stats come from the runtime comparison. */
export function createDirectorySession(comparison: DirectoryComparison): WorkbenchSession {
  const { same, added, removed, modified } = comparison.counts

  return {
    id: DIRECTORY_SESSION_ID,
    scene: 'directory',
    title: '目录对比',
    subtitle: `${comparison.leftName} ↔ ${comparison.rightName}`,
    columns: 2,
    composition: { ...comparison.counts, conflict: 0 },
    stats: [
      { label: '文件（源）', value: same + removed + modified },
      { label: '文件（目标）', value: same + added + modified },
      { label: '差异', value: added + removed + modified }
    ],
    directory: comparison
  }
}

/** Builds the file-level session a directory-tree double-click opens. */
export function createDrilldownSession(
  node: DirectoryDiffNode,
  target: DrilldownTarget,
  leftText: string,
  rightText: string
): WorkbenchSession {
  const pair = {
    left: { path: node.leftPath ?? `${node.relativePath}（左不存在）`, text: leftText },
    right: { path: node.rightPath ?? `${node.relativePath}（右不存在）`, text: rightText }
  }
  const delimiter = target.delimiter ?? ','
  const adhoc: AdhocFilePair = {
    scene: target.kind,
    pair,
    delimiter: target.delimiter,
    format: target.format,
    tables:
      target.kind === 'csv'
        ? {
            left: parseCsvTable({ ...pair.left, delimiter }),
            right: parseCsvTable({ ...pair.right, delimiter })
          }
        : undefined
  }

  return {
    id: `file:${node.relativePath}`,
    scene: target.kind,
    title: node.name,
    subtitle: `${node.relativePath} · ${target.label}`,
    columns: 2,
    stats: [
      { label: '行数（左）', value: countTextLines(leftText) },
      { label: '行数（右）', value: countTextLines(rightText) }
    ],
    adhoc
  }
}
