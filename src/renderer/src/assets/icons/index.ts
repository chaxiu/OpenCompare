import arrowLeft from './arrow-left.svg?raw'
import arrowRight from './arrow-right.svg?raw'
import braces from './braces.svg?raw'
import check from './check.svg?raw'
import chevronDown from './chevron-down.svg?raw'
import chevronRight from './chevron-right.svg?raw'
import chevronUp from './chevron-up.svg?raw'
import clipboardCopy from './clipboard-copy.svg?raw'
import cloud from './cloud.svg?raw'
import download from './download.svg?raw'
import fileCodeCorner from './file-code-corner.svg?raw'
import fileDown from './file-down.svg?raw'
import fileText from './file-text.svg?raw'
import folder from './folder.svg?raw'
import folderOpen from './folder-open.svg?raw'
import folderSearch from './folder-search.svg?raw'
import folderTree from './folder-tree.svg?raw'
import gitCompare from './git-compare.svg?raw'
import listFilter from './list-filter.svg?raw'
import loaderCircle from './loader-circle.svg?raw'
import refreshCw from './refresh-cw.svg?raw'
import rotateCcw from './rotate-ccw.svg?raw'
import save from './save.svg?raw'
import settings from './settings.svg?raw'
import shuffle from './shuffle.svg?raw'
import squareSplitHorizontal from './square-split-horizontal.svg?raw'
import table2 from './table-2.svg?raw'
import triangleAlert from './triangle-alert.svg?raw'
import upload from './upload.svg?raw'
import x from './x.svg?raw'
import type { ShellEntryId } from '@renderer/workbench/shellLayout'

/**
 * The single icon source of the renderer: one vendored Lucide SVG per icon in
 * `assets/icons/`, no runtime fetch and no icon package at runtime.
 *
 * Zero DOM / zero Electron imports — the tables below are plain data, so the
 * node-side tests can read them without jsdom.
 */

/** Lucide release the vendored files were copied from (`lucide-react` 1.59.0). */
export const LUCIDE_VERSION = '1.59.0'

/**
 * Inner geometry of one `<svg>` — everything between the root tags. The file
 * keeps the root element (so it stays a parseable SVG), the component owns
 * every presentation attribute.
 */
function geometry(raw: string): string {
  const open = raw.indexOf('>', raw.indexOf('<svg'))
  const close = raw.lastIndexOf('</svg>')
  if (open === -1 || close === -1 || close <= open) {
    throw new Error('vendored icon is not a complete <svg> document')
  }
  // Collapse the indentation between tags: an SVG child may not carry stray
  // whitespace text nodes (they would leak into `textContent` of a button).
  return raw
    .slice(open + 1, close)
    .replace(/>\s+</g, '><')
    .trim()
}

/**
 * Icon name → inner geometry. The key is the upstream Lucide name (kebab-case,
 * identical to the file name); `fill` / `stroke` / stroke width are decided by
 * `Icon`, never baked into the file.
 */
export const ICON_PATHS = {
  'arrow-left': geometry(arrowLeft),
  'arrow-right': geometry(arrowRight),
  braces: geometry(braces),
  check: geometry(check),
  'chevron-down': geometry(chevronDown),
  'chevron-right': geometry(chevronRight),
  'chevron-up': geometry(chevronUp),
  'clipboard-copy': geometry(clipboardCopy),
  cloud: geometry(cloud),
  download: geometry(download),
  'file-code-corner': geometry(fileCodeCorner),
  'file-down': geometry(fileDown),
  'file-text': geometry(fileText),
  folder: geometry(folder),
  'folder-open': geometry(folderOpen),
  'folder-search': geometry(folderSearch),
  'folder-tree': geometry(folderTree),
  'git-compare': geometry(gitCompare),
  'list-filter': geometry(listFilter),
  'loader-circle': geometry(loaderCircle),
  'refresh-cw': geometry(refreshCw),
  'rotate-ccw': geometry(rotateCcw),
  save: geometry(save),
  settings: geometry(settings),
  shuffle: geometry(shuffle),
  'square-split-horizontal': geometry(squareSplitHorizontal),
  'table-2': geometry(table2),
  'triangle-alert': geometry(triangleAlert),
  upload: geometry(upload),
  x: geometry(x)
} as const

export type IconName = keyof typeof ICON_PATHS

export const ICON_NAMES: readonly IconName[] = Object.keys(ICON_PATHS) as IconName[]

/** Every size the UI may use; there is no in-between step. */
export type IconSize = 16 | 20 | 24

export const ICON_SIZES: readonly IconSize[] = [16, 20, 24]

/**
 * Optical stroke width per size: the 24px design stroke (2) is too heavy when
 * scaled down, so smaller renditions get a thinner stroke.
 */
const STROKE_WIDTHS: Record<IconSize, number> = { 16: 1.25, 20: 1.5, 24: 2 }

export function strokeWidthFor(size: IconSize): number {
  return STROKE_WIDTHS[size]
}

/** Icon of each shell entry (keys must equal `SHELL_ENTRY_IDS`). */
export const SHELL_ENTRY_ICONS = {
  'open-file': 'file-code-corner',
  'open-folder': 'folder-open',
  'new-compare': 'git-compare',
  settings: 'settings',
  filter: 'list-filter',
  sync: 'square-split-horizontal',
  template: 'shuffle',
  'snapshot-import': 'upload',
  'snapshot-export': 'download',
  'report-export': 'file-down',
  'drilldown-back': 'arrow-left',
  'prev-diff': 'chevron-up',
  'next-diff': 'chevron-down',
  override: 'arrow-right',
  save: 'save',
  'merge-accept': 'check',
  export: 'download',
  'tab-select': 'git-compare'
} as const satisfies Record<ShellEntryId, IconName>

/** Icons of interface actions that are not shell entries. */
export const UI_ICON_ACTIONS = {
  brand: 'git-compare',
  close: 'x',
  menu: 'chevron-down',
  treeToggle: 'chevron-right',
  file: 'file-text',
  folder: 'folder',
  folderOpen: 'folder-open',
  codeFile: 'file-code-corner',
  pickFolder: 'folder-search',
  loading: 'loader-circle',
  warning: 'triangle-alert',
  check: 'check',
  copy: 'clipboard-copy',
  changeArrow: 'arrow-right',
  refresh: 'refresh-cw',
  reset: 'rotate-ccw',
  remoteSample: 'cloud',
  overwriteLeft: 'arrow-left',
  overwriteRight: 'arrow-right',
  viewDirectory: 'folder-tree',
  viewCode: 'file-code-corner',
  viewCsv: 'table-2',
  viewStructured: 'braces'
} as const satisfies Record<string, IconName>
