/**
 * Public entry of the built-in sample library.
 *
 * `buildSampleSessions()` is the "load samples → sessions" seam; the workbench
 * calls it after the user hits *Load Sample Fixtures*. `SAMPLE_FIXTURE_FILES`
 * is the flat file view of the same library, which the web runtime seeds into
 * its in-memory `PlatformPort`.
 */
import {
  CODE_SCENE,
  CSV_SCENE,
  DIRECTORY_SCENE,
  STRUCTURED_SCENE,
  countFiles
} from './scenes'
import type {
  DirectoryNode,
  FixtureSession,
  SampleFile,
  SessionStat,
  TextSample
} from './types'

export { CODE_SCENE, CSV_SCENE, DIRECTORY_SCENE, STRUCTURED_SCENE } from './scenes'

export type {
  CodeSceneFixture,
  CsvSample,
  CsvSceneFixture,
  DiffStatus,
  DirectoryNode,
  DirectorySceneFixture,
  FixtureSession,
  SampleComposition,
  SampleFile,
  SceneId,
  SessionStat,
  StructuredSceneFixture,
  TextSample
} from './types'

const SAMPLE_ROOT = '/samples'

function collectTreeFiles(node: DirectoryNode, prefix: string, out: SampleFile[]): void {
  const path = `${prefix}/${node.name}`
  if (node.kind === 'file') {
    out.push({ path, text: node.text ?? '' })
    return
  }
  for (const child of node.children ?? []) collectTreeFiles(child, path, out)
}

function buildSampleFiles(): SampleFile[] {
  const files: SampleFile[] = []
  const pushSample = (sample: TextSample): void => {
    files.push({ path: sample.path, text: sample.text })
  }

  collectTreeFiles(DIRECTORY_SCENE.left, `${SAMPLE_ROOT}/directory`, files)
  collectTreeFiles(DIRECTORY_SCENE.right, `${SAMPLE_ROOT}/directory`, files)
  collectTreeFiles(DIRECTORY_SCENE.scattered, `${SAMPLE_ROOT}/directory`, files)

  pushSample(CODE_SCENE.diff.left)
  pushSample(CODE_SCENE.diff.right)
  pushSample(CODE_SCENE.merge.base)
  pushSample(CODE_SCENE.merge.ours)
  pushSample(CODE_SCENE.merge.theirs)

  pushSample(CSV_SCENE.left)
  pushSample(CSV_SCENE.right)

  pushSample(STRUCTURED_SCENE.json.left)
  pushSample(STRUCTURED_SCENE.json.right)
  pushSample(STRUCTURED_SCENE.yaml.left)
  pushSample(STRUCTURED_SCENE.yaml.right)

  return files
}

/** Every sample file of the library, addressed by its virtual path. */
export const SAMPLE_FIXTURE_FILES: readonly SampleFile[] = buildSampleFiles()

/**
 * Virtual roots of the built-in directory sample. Both sides are readable
 * through `PlatformPort`, so "load the sample directory" needs no real files.
 */
export const DIRECTORY_SAMPLE_PATHS = {
  root: `${SAMPLE_ROOT}/directory`,
  left: `${SAMPLE_ROOT}/directory/${DIRECTORY_SCENE.left.name}`,
  right: `${SAMPLE_ROOT}/directory/${DIRECTORY_SCENE.right.name}`
} as const

function countTextLines(text: string): number {
  return text.trimEnd().split('\n').length
}

function countJsonNodes(value: unknown): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce<number>((total, item) => total + countJsonNodes(item), 0)
  }
  if (value !== null && typeof value === 'object') {
    return 1 + Object.values(value).reduce<number>((total, item) => total + countJsonNodes(item), 0)
  }
  return 1
}

const formatCount = (value: number): string => value.toLocaleString('en-US')

const CSV_LEFT_ROWS =
  CSV_SCENE.composition.same + CSV_SCENE.composition.removed + CSV_SCENE.composition.modified
const CSV_RIGHT_ROWS =
  CSV_SCENE.composition.same + CSV_SCENE.composition.added + CSV_SCENE.composition.modified

const DIRECTORY_STATS: readonly SessionStat[] = [
  { label: '文件（源）', value: countFiles(DIRECTORY_SCENE.left) },
  { label: '文件（目标）', value: countFiles(DIRECTORY_SCENE.right) },
  { label: '散乱树 B', value: countFiles(DIRECTORY_SCENE.scattered) }
]

const CODE_STATS: readonly SessionStat[] = [
  { label: '行数（左）', value: countTextLines(CODE_SCENE.diff.left.text) },
  { label: '行数（右）', value: countTextLines(CODE_SCENE.diff.right.text) },
  { label: '冲突块', value: CODE_SCENE.composition.conflict, tone: 'conflict' }
]

const CSV_STATS: readonly SessionStat[] = [
  { label: '行数（左）', value: CSV_LEFT_ROWS },
  { label: '行数（右）', value: CSV_RIGHT_ROWS },
  { label: '主键列', value: CSV_SCENE.keyColumns.join(', ') }
]

const STRUCTURED_STATS: readonly SessionStat[] = [
  { label: 'JSON 节点（左）', value: countJsonNodes(JSON.parse(STRUCTURED_SCENE.json.left.text)) },
  { label: 'JSON 节点（右）', value: countJsonNodes(JSON.parse(STRUCTURED_SCENE.json.right.text)) },
  { label: '样本文件', value: 4 }
]

/**
 * Turns the built-in sample library into one session per scene. Sessions are
 * plain descriptors: the workbench decides how to present each scene.
 */
export function buildSampleSessions(): readonly FixtureSession[] {
  return [
    {
      id: 'session-directory',
      scene: 'directory',
      title: '目录对比',
      subtitle: '多层嵌套双目录树 + 跨层级散乱目录树 B',
      columns: 2,
      stats: DIRECTORY_STATS
    },
    {
      id: 'session-code',
      scene: 'code',
      title: '代码 Diff & 3-Way Merge',
      subtitle: '双栏 Diff 文本对 + base · ours · theirs 多冲突块',
      columns: 3,
      stats: CODE_STATS
    },
    {
      id: 'session-csv',
      scene: 'csv',
      title: 'CSV 主键对比',
      subtitle: `${formatCount(CSV_LEFT_ROWS)} 行乱序主键 + 列偏移 CSV / TSV`,
      columns: 2,
      stats: CSV_STATS
    },
    {
      id: 'session-structured',
      scene: 'structured',
      title: 'JSON / YAML 语义对比',
      subtitle: '键序打乱 + 深层键值增删改与类型变化',
      columns: 2,
      stats: STRUCTURED_STATS
    }
  ]
}
