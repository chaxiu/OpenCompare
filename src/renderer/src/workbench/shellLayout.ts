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

/**
 * The one band surface both toolbar levels render. It stays an existing token
 * (`surface-sunken`), so the app head and every view toolbar cannot drift into
 * a second colour or an inverted hierarchy.
 */
export const TOOLBAR_BAND_SURFACE: Readonly<Record<ToolbarLevel, string>> = {
  app: 'bg-surface-sunken',
  'view-toolbar': 'bg-surface-sunken'
}

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
    height: 'h-8',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-2',
    stackGap: 'gap-0',
    controlHeight: 'h-[var(--height-control-sm)]'
  },
  sessions: {
    height: 'h-7',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-2',
    stackGap: 'gap-0',
    controlHeight: 'h-[var(--height-control-sm)]'
  },
  events: {
    height: 'h-7',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-3',
    stackGap: 'gap-0',
    controlHeight: 'h-[var(--height-control-sm)]'
  },
  'view-toolbar': {
    height: 'h-8',
    paddingX: 'px-2',
    paddingY: 'py-0.5',
    gap: 'gap-2',
    stackGap: 'gap-0',
    controlHeight: 'h-[var(--height-control-sm)]'
  },
  panels: {
    height: 'h-6',
    paddingX: 'px-2',
    paddingY: 'py-0',
    gap: 'gap-2',
    stackGap: 'gap-2',
    controlHeight: 'h-[var(--height-control-sm)]'
  },
  status: {
    height: 'h-6',
    paddingX: 'px-3',
    paddingY: 'py-0',
    gap: 'gap-3',
    stackGap: 'gap-0',
    controlHeight: 'h-[var(--height-control-sm)]'
  }
}

/**
 * Rendered height of one level band, in px: the row height plus its vertical
 * inset. `view-toolbar` is the one level with a non-zero inset (`h-8` +
 * `py-0.5` = 36), which is also what `toolbarBandHeightPx` reports.
 */
export function levelHeightPx(level: ShellLevel): number {
  const metrics = SHELL_LEVELS[level]
  return HEIGHT_PX[metrics.height] + SPACING_PX[metrics.paddingY] * 2
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

/**
 * Status-bar widths the shell must stay readable at. 960 and 1280 sit between
 * the three reference tiers but are part of the narrow-window acceptance.
 */
export const STATUS_BAR_WIDTHS: readonly number[] = [960, 1024, 1280, 1440, 1920]

/**
 * One-row content demand of the status bar. After dropping the session id,
 * platform name, legend and tutorial copy, the bar only carries the scene's
 * line / item measures plus the (deduped) encoding and newline facts.
 */
export const STATUS_BAR_CONTENT_PX = 520

export interface StatusBarBudget {
  /** Width left inside the level's horizontal inset. */
  readonly available: number
  /** Required width when every group sits on one row. */
  readonly required: number
  /** Single-row fit only: wrapping is not an overflow. */
  readonly fits: boolean
  /** Rows the wrapping bar occupies; content is never pushed out of view. */
  readonly rows: number
}

/**
 * Width model of the status bar. The wrapping container absorbs any content
 * that does not fit one row, so the answer is always "single row" or
 * "`rows` wrapped rows" — never an overflow. Driven by the content demand, not
 * by a width breakpoint.
 */
export function measureStatusBar(
  width: number,
  required: number = STATUS_BAR_CONTENT_PX
): StatusBarBudget {
  const available = Math.max(1, width - PADDING_X_PX[SHELL_LEVELS.status.paddingX] * 2)
  const rows = Math.max(1, Math.ceil(required / available))
  return { available, required, fits: rows === 1, rows }
}

/** Height of one wrapped status-bar text row, in px (`text-2xs` line box). */
const STATUS_BAR_ROW_PX = 16

/** `border-t` of the status bar, counted into its declared border-box height. */
const STATUS_BAR_BORDER_PX = 1

/**
 * Declared border-box height of the status bar for `rows` wrapped rows.
 *
 * One row stays on the `h-6` step (24px, border included) — the shell's single
 * row contract. From two rows on the height becomes `rows * 16 + 1`: the 16px
 * rows plus the 1px `border-t`, so the content box always fits `rows * 16` and
 * `scrollHeight <= clientHeight`.
 */
export function statusBarHeightPx(rows: number): number {
  const safeRows = Math.max(1, Math.trunc(rows))
  if (safeRows === 1) return HEIGHT_PX['h-6']
  return safeRows * STATUS_BAR_ROW_PX + STATUS_BAR_BORDER_PX
}

/**
 * Layout utilities of the status bar itself: a wrapping flex row with no
 * horizontal scroll channel. The row gap stays 0; the height is the only
 * status-layer height source — `h-6` on a single row, `h-auto min-h-6` once
 * the content model wraps (declared height then follows the content).
 */
export function statusBarClasses(rows = 1): string {
  const height = rows >= 2 ? 'h-auto min-h-6' : 'h-6'
  return `flex flex-wrap items-center gap-y-0 ${SHELL_LEVELS.status.gap} ${height}`
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
    presentation: ICON_ONLY,
    width: { label: 26, 'icon-only': 26 }
  },
  save: {
    level: 'view-toolbar',
    slot: 'code-edit',
    labelKey: 'files.code.saveLeft',
    labelKeys: ['files.code.saveLeft'],
    presentation: ICON_ONLY,
    width: { label: 26, 'icon-only': 26 }
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

/** Locale whose copy widths the directory toolbar model was measured at. */
export type DirectoryToolbarLocale = 'zh' | 'en'

export interface DirectoryToolbarWidths {
  readonly filter: number
  readonly legend: number
  readonly legendCollapsed: number
  readonly direction: number
  readonly mode: number
  readonly sync: number
  readonly syncCollapsed: number
  readonly more: number
  /** Separator and inter-control chrome that is not part of any one control. */
  readonly extra: number
}

/**
 * Measured width of every directory toolbar control, per locale. The legend
 * reserves four status words and four counter digits, so a changing count never
 * changes the collapse stage; `legendCollapsed` keeps the dot and the count.
 */
export const DIRECTORY_TOOLBAR_WIDTHS: Readonly<
  Record<DirectoryToolbarLocale, DirectoryToolbarWidths>
> = {
  zh: {
    filter: 300,
    legend: 360,
    legendCollapsed: 200,
    direction: 110,
    mode: 88,
    sync: 125,
    syncCollapsed: 40,
    more: 56,
    extra: 36
  },
  en: {
    filter: 420,
    legend: 450,
    legendCollapsed: 250,
    direction: 155,
    mode: 145,
    sync: 135,
    syncCollapsed: 40,
    more: 56,
    extra: 36
  }
}

export type DirectoryToolbarCollapse = 'none' | 'legend' | 'sync' | 'wrap'

export interface DirectoryToolbarLayout {
  /** Window width minus the level's left and right inset. */
  readonly available: number
  /** Required width of the widest rendered line. */
  readonly required: number
  /** Rendered lines: one, or two when the fixed ladder ran out of width. */
  readonly rows: number
  readonly lines: readonly number[]
  readonly collapse: DirectoryToolbarCollapse
  /** True while every legend chip keeps its status word. */
  readonly legendLabels: boolean
  /** True while the primary sync button keeps its copy. */
  readonly syncLabel: boolean
}

/** Control widths of one ladder stage, in render order. */
function directoryToolbarItems(
  widths: DirectoryToolbarWidths,
  legendLabels: boolean,
  syncLabel: boolean
): readonly number[] {
  return [
    widths.filter,
    legendLabels ? widths.legend : widths.legendCollapsed,
    widths.direction,
    widths.mode,
    syncLabel ? widths.sync : widths.syncCollapsed,
    widths.more + widths.extra
  ]
}

function singleLineWidth(items: readonly number[], gap: number): number {
  return items.reduce((sum, width) => sum + width, 0) + gap * (items.length - 1)
}

/** Greedy line packing of the wrapped stage; every returned line fits. */
function packToolbarLines(items: readonly number[], available: number, gap: number): number[] {
  const lines: number[] = []
  let current = 0
  for (const item of items) {
    if (current === 0) current = item
    else if (current + gap + item <= available) current += gap + item
    else {
      lines.push(current)
      current = item
    }
  }
  if (current > 0) lines.push(current)
  return lines
}

/**
 * Directory view-toolbar layout at one window width and locale. The fixed
 * ladder is legend status words → primary sync copy → wrapping; the ladder only
 * hides copy, it never removes a control. Single-row still reports 36px, a
 * wrapped row reports `toolbarBandHeightPx(2)`.
 */
export function measureDirectoryToolbar(
  width: number,
  locale: DirectoryToolbarLocale
): DirectoryToolbarLayout {
  const widths = DIRECTORY_TOOLBAR_WIDTHS[locale]
  const metrics = SHELL_LEVELS['view-toolbar']
  const available = Math.max(1, width - PADDING_X_PX[metrics.paddingX] * 2)
  const gap = SPACING_PX[metrics.gap]

  const full = directoryToolbarItems(widths, true, true)
  const fullWidth = singleLineWidth(full, gap)
  if (fullWidth <= available) {
    return {
      available,
      required: fullWidth,
      rows: 1,
      lines: [fullWidth],
      collapse: 'none',
      legendLabels: true,
      syncLabel: true
    }
  }

  const legendOnly = directoryToolbarItems(widths, false, true)
  const legendWidth = singleLineWidth(legendOnly, gap)
  if (legendWidth <= available) {
    return {
      available,
      required: legendWidth,
      rows: 1,
      lines: [legendWidth],
      collapse: 'legend',
      legendLabels: false,
      syncLabel: true
    }
  }

  const collapsed = directoryToolbarItems(widths, false, false)
  const collapsedWidth = singleLineWidth(collapsed, gap)
  if (collapsedWidth <= available) {
    return {
      available,
      required: collapsedWidth,
      rows: 1,
      lines: [collapsedWidth],
      collapse: 'sync',
      legendLabels: false,
      syncLabel: false
    }
  }

  const lines = packToolbarLines(collapsed, available, gap)
  return {
    available,
    required: Math.max(...lines),
    rows: lines.length,
    lines,
    collapse: 'wrap',
    legendLabels: false,
    syncLabel: false
  }
}

/** Rendered height of one directory toolbar flex line, in px. */
export const TOOLBAR_ROW_HEIGHT_PX = 32

/** Vertical gap between two wrapped directory toolbar flex lines, in px. */
export const TOOLBAR_ROW_GAP_PX = 4

/** Vertical inset of the view-toolbar band, in px (one side). */
export const TOOLBAR_BAND_PADDING_Y_PX = 2

/**
 * Utilities of the directory row container: wraps instead of overflowing.
 * The horizontal gap stays 8px; the vertical (wrapped-line) gap is 4px so two
 * 32px lines plus the band's 2+2 inset land on exactly 72px.
 */
export function directoryToolbarRowClasses(): string {
  return 'flex w-full min-w-0 items-center flex-wrap gap-x-2 gap-y-1 min-h-8'
}

export interface ToolbarRowSpec {
  readonly id: string
  readonly level: ToolbarLevel
  /** Views this row belongs to; `app` rows are shared by every view. */
  readonly views: readonly ToolbarView[]
  /** Entries rendered directly in the row. */
  readonly entries: readonly ShellEntryId[]
  /** Entries collected into the row's overflow menu (still reachable). */
  readonly overflow: readonly ShellEntryId[]
  readonly controls: readonly ToolbarControlSpec[]
  /** Fixed width of separators, gaps and other row chrome, in px. */
  readonly extra: number
}

const APP_ROW: ToolbarRowSpec = {
  id: 'app-actions',
  level: 'app',
  views: ['directory'],
  entries: ['new-compare', 'open-file', 'open-folder', 'settings'],
  overflow: [],
  controls: [control('brand', 130)],
  extra: 56
}

/**
 * One rendered row per view. The directory row keeps the filter, its legend,
 * the sync direction/mode pickers and the single solid primary action; the
 * snapshot / report / path-privacy actions live in `overflow` (the "more"
 * menu). Code rows fold the former mode row into the action row and collect
 * secondary pair actions into the same overflow menu.
 */
export const TOOLBAR_ROWS: readonly ToolbarRowSpec[] = [
  APP_ROW,
  {
    id: 'directory-toolbar',
    level: 'view-toolbar',
    views: ['directory'],
    entries: ['filter', 'sync'],
    overflow: ['template', 'snapshot-export', 'snapshot-import', 'report-export'],
    controls: [
      collapsible(
        'legend',
        DIRECTORY_TOOLBAR_WIDTHS.zh.legend,
        DIRECTORY_TOOLBAR_WIDTHS.zh.legendCollapsed
      ),
      control('sync-direction', DIRECTORY_TOOLBAR_WIDTHS.zh.direction),
      control('sync-mode', DIRECTORY_TOOLBAR_WIDTHS.zh.mode),
      control('more', DIRECTORY_TOOLBAR_WIDTHS.zh.more)
    ],
    extra: DIRECTORY_TOOLBAR_WIDTHS.zh.extra
  },
  {
    id: 'code-diff',
    level: 'view-toolbar',
    views: ['code-diff'],
    entries: ['drilldown-back', 'prev-diff', 'next-diff', 'override', 'save'],
    overflow: [],
    controls: [
      control('mode-switch', 240),
      control('block-counter', 96),
      collapsible('code-switch-newline', 132, 26),
      collapsible('code-switch-encoding', 132, 26),
      collapsible('code-switch-whitespace', 120, 26),
      control('code-diff-count', 60),
      control('more', 60)
    ],
    extra: 32
  },
  {
    id: 'code-merge',
    level: 'view-toolbar',
    views: ['code-merge'],
    entries: ['drilldown-back', 'prev-diff', 'next-diff', 'merge-accept', 'export'],
    overflow: [],
    controls: [
      control('pending-counter', 84),
      collapsible('merge-open-sides', 318, 78),
      collapsible('merge-copy', 60, 26),
      control('more', 60)
    ],
    extra: 32
  },
  {
    id: 'csv',
    level: 'view-toolbar',
    views: ['csv'],
    entries: ['drilldown-back'],
    overflow: [],
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
    entries: ['drilldown-back'],
    overflow: [],
    controls: [
      control('source-title', 170),
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
    ).flatMap((row) => [...row.entries, ...row.overflow])
  }
  // Levels without a toolbar row (sessions) declare their entries directly.
  return SHELL_ENTRY_IDS.filter((id) => SHELL_ENTRIES[id].level === level)
}

/** Ready-state chrome this shell must never exceed (32 + 28 + 24). */
export const CHROME_BASELINE_PX = 84

/** Reference viewport height used by the content/row-count budgets. */
export const REFERENCE_VIEWPORT_HEIGHT_PX = 768

/** Top chrome sum: application head + (ready only) session head + status bar. */
export function chromeHeightPx(state: 'empty' | 'ready', statusRows = 1): number {
  return (
    levelHeightPx('app') +
    (state === 'ready' ? levelHeightPx('sessions') : 0) +
    statusBarHeightPx(statusRows)
  )
}

/** Height left for the work area under the chrome. */
export function mainContentHeightPx(state: 'empty' | 'ready', statusRows = 1): number {
  return REFERENCE_VIEWPORT_HEIGHT_PX - chromeHeightPx(state, statusRows)
}

/**
 * Toolbar rows one view renders. Every view owns exactly one row now: the
 * drilldown back action sits inside that row instead of growing a second band.
 */
export function viewToolbarRows(view: ToolbarView): number {
  return TOOLBAR_ROWS.filter(
    (row) => row.level === 'view-toolbar' && row.views.includes(view)
  ).length
}

/**
 * Rendered height of a view-toolbar band holding `rows` wrapped lines:
 * `rows * 32 + (rows - 1) * 4 + 2 * 2` → 36px single, 72px wrapped.
 */
export function toolbarBandHeightPx(rows: number): number {
  const safeRows = Math.max(0, Math.trunc(rows))
  if (safeRows === 0) return 0
  return (
    safeRows * TOOLBAR_ROW_HEIGHT_PX +
    (safeRows - 1) * TOOLBAR_ROW_GAP_PX +
    TOOLBAR_BAND_PADDING_Y_PX * 2
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
  statusRows = 1
): ContentRowBudget {
  const chrome = chromeHeightPx(state, statusRows)
  const toolbar = toolbarBandHeightPx(viewToolbarRows(view))
  const panelsInset = SPACING_PX[SHELL_LEVELS.panels.paddingY] * 2
  const panelHeader = levelHeightPx('panels')
  const area = Math.max(0, REFERENCE_VIEWPORT_HEIGHT_PX - chrome - toolbar - panelsInset - panelHeader)
  return { chrome, toolbar, panelsInset, panelHeader, area, rows: visibleRowCount(area, rowPx) }
}
