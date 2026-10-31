import type { MessageKey } from '@renderer/i18n/messages'

/**
 * Single source of truth for the workbench shell layout.
 *
 * Zero DOM / zero Electron imports: the shell levels, their metrics, the entry
 * manifest and the width budgets are plain data, so both the components and the
 * tests read the very same numbers. Nothing here may drift per window width —
 * only the presentation of an entry label does (compact / regular / wide).
 */

/** Fixed top-to-bottom shell levels; each renders at most once. */
export type ShellLevel = 'app' | 'sessions' | 'events' | 'view-toolbar' | 'panels' | 'status'

export const SHELL_LEVEL_ORDER: readonly ShellLevel[] = [
  'app',
  'sessions',
  'events',
  'view-toolbar',
  'panels',
  'status'
]

/** Levels that own a horizontal toolbar row (and therefore a width budget). */
export type ToolbarLevel = Extract<ShellLevel, 'app' | 'view-toolbar'>

/** The three window widths the shell is designed for. */
export type WidthTier = 'compact' | 'regular' | 'wide'

export const TIER_WIDTHS: Record<WidthTier, number> = {
  compact: 1024,
  regular: 1440,
  wide: 1920
}

/**
 * Window width → size tier. The breakpoints sit between the three reference
 * widths, so 1024 / 1440 / 1920 resolve to compact / regular / wide.
 */
export function resolveWidthTier(width: number): WidthTier {
  if (width < 1280) return 'compact'
  if (width < 1680) return 'regular'
  return 'wide'
}

/** Height utility → rendered height in px (the only Tailwind steps in use). */
export const HEIGHT_PX: Readonly<Record<string, number>> = {
  'h-6': 24,
  'h-7': 28,
  'h-8': 32,
  'h-9': 36,
  'h-11': 44
}

/** Vertical padding / stacking gap utility → px. */
export const SPACING_PX: Readonly<Record<string, number>> = {
  'py-0': 0,
  'py-0.5': 2,
  'py-1': 4,
  'py-2': 8,
  'gap-0': 0,
  'gap-1.5': 6,
  'gap-2': 8,
  'gap-3': 12
}

/** Horizontal padding utility → px, used by the width budget. */
export const PADDING_X_PX: Readonly<Record<string, number>> = {
  'px-2': 8,
  'px-3': 12
}

export interface ShellLevelMetrics {
  /** Row height of the level (the panel level measures its panel header row). */
  readonly height: string
  /** Horizontal inset of the level band. */
  readonly paddingX: string
  /** Vertical inset of the level band. */
  readonly paddingY: string
  /** Gap between controls inside one row. */
  readonly gap: string
  /** Gap between stacked rows of the same level; `gap-0` for single-row levels. */
  readonly stackGap: string
  /** Height every control inside that level must share. */
  readonly controlHeight: string
}

export const SHELL_LEVELS: Record<ShellLevel, ShellLevelMetrics> = {
  app: {
    height: 'h-11',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-2',
    stackGap: 'gap-0',
    controlHeight: 'h-6'
  },
  sessions: {
    height: 'h-9',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-2',
    stackGap: 'gap-0',
    controlHeight: 'h-7'
  },
  events: {
    height: 'h-7',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-3',
    stackGap: 'gap-0',
    controlHeight: 'h-6'
  },
  'view-toolbar': {
    height: 'h-7',
    paddingX: 'px-2',
    paddingY: 'py-0.5',
    gap: 'gap-2',
    stackGap: 'gap-1.5',
    controlHeight: 'h-6'
  },
  panels: {
    height: 'h-8',
    paddingX: 'px-2',
    paddingY: 'py-2',
    gap: 'gap-2',
    stackGap: 'gap-2',
    controlHeight: 'h-6'
  },
  status: {
    height: 'h-8',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-3',
    stackGap: 'gap-0',
    controlHeight: 'h-6'
  }
}

/** Height of one level row, in px. */
export function levelHeightPx(level: ShellLevel): number {
  return HEIGHT_PX[SHELL_LEVELS[level].height]
}

/** Utilities of the level's own band (insets plus the row stack gap). */
export function levelBandClasses(level: ShellLevel): string {
  const metrics = SHELL_LEVELS[level]
  const stackGap = metrics.stackGap === 'gap-0' ? '' : metrics.stackGap
  return [metrics.paddingX, metrics.paddingY, stackGap].filter((part) => part.length > 0).join(' ')
}

/** Utilities of one row inside a level (height plus the control gap). */
export function levelRowClasses(level: ShellLevel): string {
  const metrics = SHELL_LEVELS[level]
  return `${metrics.height} ${metrics.gap}`
}

/** Utilities of a header row that carries the level's inset itself. */
export function levelHeaderClasses(level: ShellLevel): string {
  const metrics = SHELL_LEVELS[level]
  return `${metrics.height} ${metrics.paddingX} ${metrics.gap}`
}

/** Every existing workbench entry, in the order the delivery table lists them. */
export type ShellEntryId =
  | 'open-file'
  | 'open-folder'
  | 'new-compare'
  | 'settings'
  | 'filter'
  | 'sync'
  | 'template'
  | 'snapshot-import'
  | 'snapshot-export'
  | 'report-export'
  | 'drilldown-back'
  | 'prev-diff'
  | 'next-diff'
  | 'override'
  | 'save'
  | 'merge-accept'
  | 'export'
  | 'tab-select'

/** `label` keeps the copy, `icon-only` hides the copy and keeps the entry. */
export type EntryPresentation = 'label' | 'icon-only'

export interface ShellEntryPlacement {
  readonly level: ShellLevel
  /** Stable slot name inside the level, for the delivery table. */
  readonly slot: string
  /** Primary copy of the entry, as listed in the delivery table. */
  readonly labelKey: MessageKey
  /** Every copy this entry may render (a mode-specific view renames one). */
  readonly labelKeys: readonly MessageKey[]
  readonly presentation: Record<WidthTier, EntryPresentation>
  /** Width budget of the entry (px), keyed by presentation. */
  readonly width: Readonly<Record<EntryPresentation, number>>
}

const ALL_LABELS = { compact: 'label', regular: 'label', wide: 'label' } as const
const ICON_ONLY = { compact: 'icon-only', regular: 'icon-only', wide: 'icon-only' } as const
const COMPACT_ICONS = { compact: 'icon-only', regular: 'label', wide: 'label' } as const

/**
 * Every entry the shell renders, with its level, slot and per-tier
 * presentation. Nothing else in the shell may hide or move an entry.
 */
export const SHELL_ENTRIES: Record<ShellEntryId, ShellEntryPlacement> = {
  'open-file': {
    level: 'app',
    slot: 'global-actions',
    labelKey: 'shell.toolbar.openFile',
    labelKeys: ['shell.toolbar.openFile'],
    presentation: COMPACT_ICONS,
    width: { label: 92, 'icon-only': 26 }
  },
  'open-folder': {
    level: 'app',
    slot: 'global-actions',
    labelKey: 'shell.toolbar.openFolder',
    labelKeys: ['shell.toolbar.openFolder'],
    presentation: COMPACT_ICONS,
    width: { label: 104, 'icon-only': 26 }
  },
  'new-compare': {
    level: 'app',
    slot: 'global-actions',
    labelKey: 'shell.toolbar.newCompare',
    labelKeys: ['shell.toolbar.newCompare'],
    presentation: COMPACT_ICONS,
    width: { label: 96, 'icon-only': 26 }
  },
  settings: {
    level: 'app',
    slot: 'global-actions',
    labelKey: 'shell.settings.open',
    labelKeys: ['shell.settings.open'],
    presentation: ICON_ONLY,
    width: { label: 26, 'icon-only': 26 }
  },
  filter: {
    level: 'view-toolbar',
    slot: 'directory-filter',
    labelKey: 'directory.filter.group',
    labelKeys: ['directory.filter.group'],
    presentation: ALL_LABELS,
    width: { label: 256, 'icon-only': 256 }
  },
  sync: {
    level: 'view-toolbar',
    slot: 'directory-sync',
    labelKey: 'directory.toolbar.previewSync',
    labelKeys: ['directory.toolbar.previewSync'],
    presentation: ALL_LABELS,
    width: { label: 92, 'icon-only': 92 }
  },
  template: {
    level: 'view-toolbar',
    slot: 'directory-sync',
    labelKey: 'directory.toolbar.template',
    labelKeys: ['directory.toolbar.template'],
    presentation: ALL_LABELS,
    width: { label: 84, 'icon-only': 84 }
  },
  'snapshot-import': {
    level: 'view-toolbar',
    slot: 'directory-snapshots',
    labelKey: 'directory.toolbar.importLeft',
    labelKeys: ['directory.toolbar.importLeft'],
    presentation: ALL_LABELS,
    width: { label: 206, 'icon-only': 206 }
  },
  'snapshot-export': {
    level: 'view-toolbar',
    slot: 'directory-snapshots',
    labelKey: 'directory.toolbar.exportLeft',
    labelKeys: ['directory.toolbar.exportLeft'],
    presentation: ALL_LABELS,
    width: { label: 206, 'icon-only': 206 }
  },
  'report-export': {
    level: 'view-toolbar',
    slot: 'directory-report',
    labelKey: 'directory.report.toolbar.export',
    labelKeys: ['directory.report.toolbar.export'],
    presentation: ALL_LABELS,
    width: { label: 108, 'icon-only': 108 }
  },
  'drilldown-back': {
    level: 'view-toolbar',
    slot: 'drilldown',
    labelKey: 'shell.notice.returnAction',
    labelKeys: ['shell.notice.returnAction'],
    presentation: COMPACT_ICONS,
    width: { label: 148, 'icon-only': 26 }
  },
  'prev-diff': {
    level: 'view-toolbar',
    slot: 'code-navigation',
    labelKey: 'files.code.prevDifference',
    labelKeys: ['files.code.prevDifference', 'files.merge.prevConflict'],
    presentation: ICON_ONLY,
    width: { label: 26, 'icon-only': 26 }
  },
  'next-diff': {
    level: 'view-toolbar',
    slot: 'code-navigation',
    labelKey: 'files.code.nextDifference',
    labelKeys: ['files.code.nextDifference', 'files.merge.nextConflict'],
    presentation: ICON_ONLY,
    width: { label: 26, 'icon-only': 26 }
  },
  override: {
    level: 'view-toolbar',
    slot: 'code-edit',
    labelKey: 'files.code.overwriteRight',
    labelKeys: ['files.code.overwriteRight'],
    presentation: ALL_LABELS,
    width: { label: 168, 'icon-only': 168 }
  },
  save: {
    level: 'view-toolbar',
    slot: 'code-edit',
    labelKey: 'files.code.saveLeft',
    labelKeys: ['files.code.saveLeft'],
    presentation: ALL_LABELS,
    width: { label: 184, 'icon-only': 184 }
  },
  'merge-accept': {
    level: 'view-toolbar',
    slot: 'merge-resolve',
    labelKey: 'files.merge.accept.ours',
    labelKeys: ['files.merge.accept.ours'],
    presentation: ALL_LABELS,
    width: { label: 400, 'icon-only': 104 }
  },
  export: {
    level: 'view-toolbar',
    slot: 'merge-export',
    labelKey: 'files.merge.export',
    labelKeys: ['files.merge.export'],
    presentation: ALL_LABELS,
    width: { label: 108, 'icon-only': 108 }
  },
  'tab-select': {
    level: 'sessions',
    slot: 'tabs',
    labelKey: 'common.sessions',
    labelKeys: ['common.sessions'],
    presentation: ALL_LABELS,
    width: { label: 160, 'icon-only': 160 }
  }
}

/** Manifest order — equality with the acceptance list is asserted in tests. */
export const SHELL_ENTRY_IDS: readonly ShellEntryId[] = Object.keys(
  SHELL_ENTRIES
) as ShellEntryId[]

/** Presentation of one entry at one tier. */
export function entryPresentation(entry: ShellEntryId, tier: WidthTier): EntryPresentation {
  return SHELL_ENTRIES[entry].presentation[tier]
}

/** The views owning a view-toolbar budget. */
export type ToolbarView = 'directory' | 'code-diff' | 'code-merge' | 'csv' | 'structured'

/**
 * A control that is not one of the 18 entries (counters, legends, pickers…),
 * kept in the table so the row budget covers the whole row.
 */
export interface ToolbarControlSpec {
  readonly id: string
  /** Per tier presentation; only icon-bearing controls may ever collapse. */
  readonly presentation: Readonly<Record<WidthTier, EntryPresentation>>
  readonly width: Readonly<Record<EntryPresentation, number>>
}

const CONTROL_LABELS: Readonly<Record<WidthTier, EntryPresentation>> = ALL_LABELS
const CONTROL_COMPACT_ICONS: Readonly<Record<WidthTier, EntryPresentation>> = COMPACT_ICONS

/** Copy of one non-entry control at one tier. */
export function controlPresentation(id: string, tier: WidthTier): EntryPresentation {
  for (const row of TOOLBAR_ROWS) {
    const control = row.controls.find((item) => item.id === id)
    if (control) return control.presentation[tier]
  }
  throw new Error(`unknown toolbar control: ${id}`)
}

/** A control that always shows its copy (counters, legends, labels). */
function control(id: string, width: number): ToolbarControlSpec {
  return { id, presentation: CONTROL_LABELS, width: { label: width, 'icon-only': width } }
}


/** An icon-bearing control that drops its copy on the compact tier. */
function collapsible(id: string, label: number, iconOnly: number): ToolbarControlSpec {
  return { id, presentation: CONTROL_COMPACT_ICONS, width: { label, 'icon-only': iconOnly } }
}

export interface ToolbarRowSpec {
  readonly id: string
  readonly level: ToolbarLevel
  /** Views this row belongs to; `app` rows are shared by every view. */
  readonly views: readonly ToolbarView[]
  readonly entries: readonly ShellEntryId[]
  readonly controls: readonly ToolbarControlSpec[]
  /** Fixed width of separators, gaps and other row chrome, in px. */
  readonly extra: number
}

const APP_ROW: ToolbarRowSpec = {
  id: 'app-actions',
  level: 'app',
  views: ['directory'],
  entries: ['new-compare', 'open-file', 'open-folder', 'settings'],
  controls: [control('brand', 130), control('view-switch', 444)],
  extra: 56
}

export const TOOLBAR_ROWS: readonly ToolbarRowSpec[] = [
  APP_ROW,
  {
    id: 'directory-status',
    level: 'view-toolbar',
    views: ['directory'],
    entries: ['filter'],
    controls: [
      control('legend', 240),
      control('pick-left', 80),
      control('pick-right', 80),
      control('busy', 16)
    ],
    extra: 48
  },
  {
    id: 'directory-sync',
    level: 'view-toolbar',
    views: ['directory'],
    entries: ['sync', 'template'],
    controls: [control('sync-direction', 112), control('sync-mode', 90)],
    extra: 32
  },
  {
    id: 'directory-snapshots',
    level: 'view-toolbar',
    views: ['directory'],
    entries: ['snapshot-export', 'snapshot-import', 'report-export'],
    controls: [control('hide-local-paths', 112), control('report-progress', 120)],
    extra: 64
  },
  {
    id: 'code-mode',
    level: 'view-toolbar',
    views: ['code-diff', 'code-merge'],
    entries: ['drilldown-back'],
    controls: [
      control('mode-switch', 312),
      control('mode-hint', 240),
      control('source-title', 170)
    ],
    extra: 24
  },
  {
    id: 'code-diff',
    level: 'view-toolbar',
    views: ['code-diff'],
    entries: ['prev-diff', 'next-diff', 'override', 'save'],
    controls: [
      control('block-counter', 96),
      control('reset', 60),
      control('open-left', 91),
      control('open-right', 91)
    ],
    extra: 88
  },
  {
    id: 'code-merge',
    level: 'view-toolbar',
    views: ['code-merge'],
    entries: ['prev-diff', 'next-diff', 'merge-accept', 'export'],
    controls: [
      control('pending-counter', 84),
      collapsible('merge-open-sides', 318, 78),
      collapsible('merge-copy', 60, 26)
    ],
    extra: 88
  },
  {
    id: 'drilldown-lead',
    level: 'view-toolbar',
    views: ['csv', 'structured'],
    entries: ['drilldown-back'],
    controls: [control('source-title', 170)],
    extra: 18
  },
  {
    id: 'csv',
    level: 'view-toolbar',
    views: ['csv'],
    entries: [],
    controls: [
      control('key-label', 33),
      // The key chips absorb the remaining row width; this is their minimum.
      control('key-columns', 212),
      control('csv-status-filter', 282),
      control('row-counter', 110),
      control('csv-open-sides', 182)
    ],
    extra: 64
  },
  {
    id: 'structured',
    level: 'view-toolbar',
    views: ['structured'],
    entries: [],
    controls: [
      control('format-switch', 98),
      control('sample-hint', 180),
      control('structured-status-filter', 280),
      control('structured-open-sides', 182)
    ],
    extra: 48
  }
]

export interface ToolbarRowBudget {
  readonly row: string
  readonly available: number
  readonly required: number
  readonly fits: boolean
}

export interface ToolbarBudget {
  /** Window width minus the level's left and right inset. */
  readonly available: number
  /** Required width of the widest row of that level. */
  readonly required: number
  readonly fits: boolean
  readonly rows: readonly ToolbarRowBudget[]
}

function rowRequired(row: ToolbarRowSpec, tier: WidthTier): number {
  const entries = row.entries.reduce((sum, entry) => {
    const placement = SHELL_ENTRIES[entry]
    return sum + placement.width[entryPresentation(entry, tier)]
  }, 0)
  const controls = row.controls.reduce(
    (sum, item) => sum + item.width[item.presentation[tier]],
    0
  )
  return entries + controls + row.extra
}

/**
 * Width budget of one shell level at one tier. `required <= available` is the
 * single fit condition every toolbar row has to meet at 1024 / 1440 / 1920.
 */
export function measureToolbar(
  tier: WidthTier,
  level: ToolbarLevel,
  view: ToolbarView = 'directory'
): ToolbarBudget {
  const metrics = SHELL_LEVELS[level]
  const available = TIER_WIDTHS[tier] - PADDING_X_PX[metrics.paddingX] * 2
  const rows = TOOLBAR_ROWS.filter(
    (row) => row.level === level && (level === 'app' || row.views.includes(view))
  ).map((row) => {
    const required = rowRequired(row, tier)
    return { row: row.id, available, required, fits: required <= available }
  })
  const required = rows.reduce((max, row) => Math.max(max, row.required), 0)
  return {
    available,
    required,
    fits: rows.every((row) => row.fits),
    rows
  }
}

/** Entries of one level (optionally of one view) in their rendered order. */
export function entriesFor(level: ShellLevel, view: ToolbarView = 'directory'): readonly ShellEntryId[] {
  if (level === 'app' || level === 'view-toolbar') {
    return TOOLBAR_ROWS.filter(
      (row) => row.level === level && (level === 'app' || row.views.includes(view))
    ).flatMap((row) => row.entries)
  }
  // Levels without a toolbar row (sessions) declare their entries directly.
  return SHELL_ENTRY_IDS.filter((id) => SHELL_ENTRIES[id].level === level)
}

/** Ready-state chrome this shell must never exceed (44 + 36 + 32). */
export const CHROME_BASELINE_PX = 112

/** Reference viewport height used by the content/row-count budgets. */
export const REFERENCE_VIEWPORT_HEIGHT_PX = 768

/** Top chrome sum: application head + (ready only) session head + status bar. */
export function chromeHeightPx(state: 'empty' | 'ready'): number {
  return (
    levelHeightPx('app') + (state === 'ready' ? levelHeightPx('sessions') : 0) + levelHeightPx('status')
  )
}

/** Height left for the work area under the chrome. */
export function mainContentHeightPx(state: 'empty' | 'ready'): number {
  return REFERENCE_VIEWPORT_HEIGHT_PX - chromeHeightPx(state)
}

/** Toolbar rows one view renders (the drilldown lead row only when drilled). */
export function viewToolbarRows(view: ToolbarView, drilldown = false): number {
  return TOOLBAR_ROWS.filter(
    (row) =>
      row.level === 'view-toolbar' &&
      row.views.includes(view) &&
      (drilldown || row.id !== 'drilldown-lead')
  ).length
}

/** Rendered height of a view-toolbar band holding `rows` rows. */
export function toolbarBandHeightPx(rows: number): number {
  if (rows <= 0) return 0
  const metrics = SHELL_LEVELS['view-toolbar']
  return (
    SPACING_PX[metrics.paddingY] * 2 +
    levelHeightPx('view-toolbar') * rows +
    SPACING_PX[metrics.stackGap] * (rows - 1)
  )
}

/** Whole rows fitting into an area of `areaPx`. */
export function visibleRowCount(areaPx: number, rowPx: number): number {
  return Math.max(0, Math.floor(areaPx / rowPx))
}

/**
 * Toolbar band heights measured on the v0.2.11 tree before this item
 * (`p-2` root + 24px rows with `gap-2`, plus the extra mode row for code and the
 * `h-8` back bar for a drilldown). Only used to prove no visible row is lost.
 */
export const BASELINE_TOOLBAR_BAND_PX: Readonly<Record<ToolbarView, number>> = {
  directory: 104,
  'code-diff': 72,
  'code-merge': 72,
  csv: 40,
  structured: 40
}

/** Pre-change band added by one drilldown back row (`h-8` + `gap-2`). */
export const BASELINE_DRILLDOWN_BAND_PX = 40

export interface ContentRowBudget {
  readonly chrome: number
  readonly toolbar: number
  readonly panelsInset: number
  readonly panelHeader: number
  /** Height left for rows inside one panel of that view. */
  readonly area: number
  readonly rows: number
}

/** Row budget of one view: chrome, its toolbar band, panel insets and header. */
export function contentRowBudget(
  state: 'empty' | 'ready',
  view: ToolbarView,
  rowPx: number,
  drilldown = false
): ContentRowBudget {
  const chrome = chromeHeightPx(state)
  const toolbar = toolbarBandHeightPx(viewToolbarRows(view, drilldown))
  const panelsInset = SPACING_PX[SHELL_LEVELS.panels.paddingY] * 2
  const panelHeader = levelHeightPx('panels')
  const area = Math.max(0, REFERENCE_VIEWPORT_HEIGHT_PX - chrome - toolbar - panelsInset - panelHeader)
  return { chrome, toolbar, panelsInset, panelHeader, area, rows: visibleRowCount(area, rowPx) }
}
