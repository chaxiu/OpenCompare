import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BASELINE_DRILLDOWN_BAND_PX,
  BASELINE_TOOLBAR_BAND_PX,
  CHROME_BASELINE_PX,
  REFERENCE_VIEWPORT_HEIGHT_PX,
  TOOLBAR_BAND_SURFACE,
  contentRowBudget,
  controlPresentation,
  DIRECTORY_TOOLBAR_WIDTHS,
  HEIGHT_PX,
  SHELL_ENTRIES,
  SHELL_ENTRY_IDS,
  SHELL_LEVELS,
  SHELL_LEVEL_ORDER,
  STATUS_BAR_CONTENT_PX,
  STATUS_BAR_WIDTHS,
  TIER_WIDTHS,
  TOOLBAR_BAND_PADDING_Y_PX,
  TOOLBAR_ROW_GAP_PX,
  TOOLBAR_ROW_HEIGHT_PX,
  TOOLBAR_ROWS,
  chromeHeightPx,
  directoryToolbarRowClasses,
  entriesFor,
  entryPresentation,
  levelBandClasses,
  levelHeaderClasses,
  levelHeightPx,
  levelRowClasses,
  mainContentHeightPx,
  measureDirectoryToolbar,
  measureStatusBar,
  measureToolbar,
  resolveWidthTier,
  statusBarClasses,
  statusBarHeightPx,
  toolbarBandHeightPx,
  viewToolbarRows,
  visibleRowCount
} from './shellLayout'
import type { ShellLevel, ToolbarView, WidthTier } from './shellLayout'

const TIERS: readonly WidthTier[] = ['compact', 'regular', 'wide']

/** The acceptance list, written out once so the manifest cannot drift. */
const ACCEPTANCE_ENTRIES = [
  'open-file',
  'open-folder',
  'new-compare',
  'settings',
  'filter',
  'sync',
  'template',
  'snapshot-import',
  'snapshot-export',
  'report-export',
  'drilldown-back',
  'prev-diff',
  'next-diff',
  'override',
  'save',
  'merge-accept',
  'export',
  'tab-select'
] as const

const VIEWS: readonly ToolbarView[] = ['directory', 'code-diff', 'code-merge', 'csv', 'structured']

describe('shell width tiers', () => {
  it('maps the three reference widths onto compact / regular / wide', () => {
    expect(resolveWidthTier(TIER_WIDTHS.compact)).toBe('compact')
    expect(resolveWidthTier(TIER_WIDTHS.regular)).toBe('regular')
    expect(resolveWidthTier(TIER_WIDTHS.wide)).toBe('wide')
  })

  it('keeps the breakpoints between the reference widths', () => {
    expect(resolveWidthTier(TIER_WIDTHS.compact + 1)).toBe('compact')
    expect(resolveWidthTier(1279)).toBe('compact')
    expect(resolveWidthTier(1280)).toBe('regular')
    expect(resolveWidthTier(1679)).toBe('regular')
    expect(resolveWidthTier(1680)).toBe('wide')
    expect(resolveWidthTier(768)).toBe('compact')
  })
})

describe('shell level table', () => {
  it('declares the five levels top to bottom, once each', () => {
    expect(SHELL_LEVEL_ORDER).toEqual([
      'app',
      'sessions',
      'events',
      'view-toolbar',
      'panels',
      'status'
    ])
    expect(new Set(SHELL_LEVEL_ORDER).size).toBe(SHELL_LEVEL_ORDER.length)
    expect(Object.keys(SHELL_LEVELS).sort()).toEqual([...SHELL_LEVEL_ORDER].sort())
  })

  it('takes every height, inset, gap and control height from the existing Tailwind steps', () => {
    for (const level of SHELL_LEVEL_ORDER) {
      const metrics = SHELL_LEVELS[level]
      expect(Object.keys(HEIGHT_PX)).toContain(metrics.height)
      expect(['h-[var(--height-control-sm)]', 'h-[var(--height-control-md)]']).toContain(
        metrics.controlHeight
      )
      expect(['px-2', 'px-3']).toContain(metrics.paddingX)
      expect(['py-0', 'py-0.5', 'py-2']).toContain(metrics.paddingY)
      expect(['gap-0', 'gap-1.5', 'gap-2', 'gap-3']).toContain(metrics.stackGap)
      expect(['gap-2', 'gap-3']).toContain(metrics.gap)
    }
  })

  it('keeps one height per level, independent of the window width', () => {
    // The table has no tier dimension at all: a level height can never change
    // with the window width, and no responsive utility may leak into a row.
    for (const level of SHELL_LEVEL_ORDER) {
      const row = levelRowClasses(level)
      const band = levelBandClasses(level)
      expect(row).not.toContain(':')
      expect(band).not.toContain(':')
      expect(row).toContain(SHELL_LEVELS[level].height)
      expect(row).toContain(SHELL_LEVELS[level].gap)
      expect(band).toContain(SHELL_LEVELS[level].paddingX)
    }
  })

  it('sums the four ready chrome levels to exactly 120px', () => {
    expect(levelHeightPx('app')).toBe(32)
    expect(levelHeightPx('sessions')).toBe(28)
    expect(levelHeightPx('view-toolbar')).toBe(36)
    expect(levelHeightPx('panels')).toBe(24)
    expect(levelHeightPx('status')).toBe(24)
    expect(
      levelHeightPx('app') +
        levelHeightPx('sessions') +
        levelHeightPx('view-toolbar') +
        levelHeightPx('panels')
    ).toBe(120)
    expect(chromeHeightPx('ready')).toBe(84)
    expect(CHROME_BASELINE_PX).toBe(84)
    expect(chromeHeightPx('ready')).toBeLessThanOrEqual(CHROME_BASELINE_PX)
    expect(chromeHeightPx('empty')).toBe(56)
    for (const tier of TIERS) {
      expect(TIER_WIDTHS[tier]).toBeGreaterThan(0)
      // Tier independent: the same numbers for every window width.
      expect(chromeHeightPx('ready')).toBe(84)
      expect(mainContentHeightPx('ready')).toBe(768 - 84)
    }
  })

  it('adds only the status-row delta once the status bar wraps', () => {
    // 84px stays the single-row baseline; wrapping adds the status row delta.
    expect(chromeHeightPx('ready', 2)).toBe(93)
    expect(chromeHeightPx('ready', 2)).toBe(
      84 + (statusBarHeightPx(2) - statusBarHeightPx(1))
    )
    expect(chromeHeightPx('empty', 2)).toBe(65)
    expect(mainContentHeightPx('ready', 2)).toBe(768 - 93)
    expect(mainContentHeightPx('ready', 2)).toBe(mainContentHeightPx('ready') - 9)

    const single = contentRowBudget('ready', 'directory', 24)
    const wrapped = contentRowBudget('ready', 'directory', 24, 2)
    expect(wrapped.chrome).toBe(93)
    expect(wrapped.area).toBe(single.area - 9)
  })

  it('does not lose a visible row against the pre-change bands', () => {
    expect(toolbarBandHeightPx(0)).toBe(0)
    expect(toolbarBandHeightPx(1)).toBe(36)
    expect(toolbarBandHeightPx(2)).toBe(72)
    expect(toolbarBandHeightPx(3)).toBe(108)

    // Pre-change: p-2 root + 24px rows with gap-2 (104 / 40), plus the mode row
    // for code (72) and a 32px back row + gap-2 for a drilldown (40 more).
    const baselineRows = (view: ToolbarView, rowPx: number, drilldown: boolean): number => {
      const band = BASELINE_TOOLBAR_BAND_PX[view] + (drilldown ? BASELINE_DRILLDOWN_BAND_PX : 0)
      const area = REFERENCE_VIEWPORT_HEIGHT_PX - chromeHeightPx('ready') - band - 16 - 32
      return visibleRowCount(area, rowPx)
    }

    for (const tier of TIERS) {
      expect(TIER_WIDTHS[tier]).toBeGreaterThan(0)
      for (const [view, rowPx] of [
        ['directory', 24],
        ['code-diff', 20],
        ['code-merge', 20],
        ['csv', 24],
        ['structured', 24]
      ] as const) {
        for (const drilldown of [false, true]) {
          const after = contentRowBudget('ready', view, rowPx)
          expect(after.rows).toBeGreaterThanOrEqual(baselineRows(view, rowPx, drilldown))
          expect(after.area).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('shell entry manifest', () => {
  it('declares exactly the eighteen accepted entries', () => {
    expect([...SHELL_ENTRY_IDS].sort()).toEqual([...ACCEPTANCE_ENTRIES].sort())
    expect(SHELL_ENTRY_IDS.length).toBe(18)
  })

  it('places every entry on a known level and slot', () => {
    for (const id of SHELL_ENTRY_IDS) {
      const placement = SHELL_ENTRIES[id]
      expect(SHELL_LEVEL_ORDER).toContain(placement.level)
      expect(placement.slot.length).toBeGreaterThan(0)
      expect(placement.labelKey.length).toBeGreaterThan(0)
      expect(placement.labelKeys).toContain(placement.labelKey)
    }
  })

  it('gives every entry a determinate presentation at each tier', () => {
    for (const id of SHELL_ENTRY_IDS) {
      for (const tier of TIERS) {
        expect(['label', 'icon-only']).toContain(entryPresentation(id, tier))
        expect(SHELL_ENTRIES[id].width[entryPresentation(id, tier)]).toBeGreaterThan(0)
      }
    }
  })

  it('only ever hides copy, never adds width or drops the entry', () => {
    for (const id of SHELL_ENTRY_IDS) {
      const { width } = SHELL_ENTRIES[id]
      expect(width['icon-only']).toBeLessThanOrEqual(width.label)
    }
    // Copy is only ever dropped for these entries, and only at these tiers;
    // everything else keeps its copy so no entry can silently disappear.
    const alwaysIcon = ['settings', 'override', 'save', 'prev-diff', 'next-diff']
    const compactIcon = ['new-compare', 'open-file', 'open-folder', 'drilldown-back']
    for (const tier of TIERS) {
      for (const id of SHELL_ENTRY_IDS) {
        const collapsed =
          alwaysIcon.includes(id) || (tier === 'compact' && compactIcon.includes(id))
        expect(entryPresentation(id, tier)).toBe(collapsed ? 'icon-only' : 'label')
      }
    }
  })

  it('keeps the entry order of every level and view consistent with the manifest', () => {
    const appEntries = SHELL_ENTRY_IDS.filter((id) => SHELL_ENTRIES[id].level === 'app')
    expect([...entriesFor('app')].sort()).toEqual([...appEntries].sort())
    for (const view of VIEWS) {
      const entries = entriesFor('view-toolbar', view)
      for (const id of entries) expect(SHELL_ENTRIES[id].level).toBe('view-toolbar')
      expect(new Set(entries).size).toBe(entries.length)
    }
    const directoryEntries = entriesFor('view-toolbar', 'directory')
    expect(directoryEntries).toEqual([
      'filter',
      'sync',
      'template',
      'snapshot-export',
      'snapshot-import',
      'report-export'
    ])
    expect(entriesFor('view-toolbar', 'code-merge')).toEqual([
      'drilldown-back',
      'prev-diff',
      'next-diff',
      'merge-accept',
      'export'
    ])
  })
})

describe('toolbar width budgets', () => {
  it('fits the app head at 1024 / 1440 / 1920', () => {
    for (const tier of TIERS) {
      const budget = measureToolbar(tier, 'app')
      expect(budget.fits).toBe(true)
      expect(budget.required).toBeLessThanOrEqual(budget.available)
      expect(budget.available).toBe(TIER_WIDTHS[tier] - 24)
    }
  })

  it('recomputes the app row after the scene switcher leaves the header', () => {
    const appRow = TOOLBAR_ROWS.find((row) => row.id === 'app-actions')
    expect(appRow?.controls.map((item) => item.id)).toEqual(['brand'])

    // The 444px view-switch control is gone, so each tier needs exactly that
    // much less than the 734 / 948 / 948 baseline it was measured at.
    const baseline: Readonly<Record<WidthTier, number>> = { compact: 734, regular: 948, wide: 948 }
    for (const tier of TIERS) {
      const budget = measureToolbar(tier, 'app')
      expect(budget.required).toBe(baseline[tier] - 444)
      expect(budget.fits).toBe(true)
    }
  })

  it('fits every view toolbar at 1024 / 1440 / 1920', () => {
    // The directory row is the 1024px acceptance row: it must fit on its own.
    expect(measureToolbar('compact', 'view-toolbar', 'directory').fits).toBe(true)
    for (const tier of TIERS) {
      for (const view of VIEWS) {
        const budget = measureToolbar(tier, 'view-toolbar', view)
        expect(budget.required).toBe(Math.max(...budget.rows.map((row) => row.required)))
        expect(budget.rows.filter((row) => !row.fits)).toEqual([])
        for (const row of budget.rows) {
          expect(row.required).toBeLessThanOrEqual(row.available)
        }
      }
    }
  })

  it('reports one budget row per rendered toolbar row', () => {
    const directory = measureToolbar('compact', 'view-toolbar', 'directory')
    expect(directory.rows.map((row) => row.row)).toEqual(['directory-toolbar'])
    const code = measureToolbar('compact', 'view-toolbar', 'code-merge')
    expect(code.rows.map((row) => row.row)).toEqual(['code-merge'])
    // The widest row of the level is what the level budget reports.
    expect(directory.required).toBe(
      Math.max(...directory.rows.map((row) => row.required))
    )
  })

  it('keeps every declared row reachable from its own level and view', () => {
    for (const tier of TIERS) {
      for (const row of TOOLBAR_ROWS) {
        const view = row.views[0]
        const budget = measureToolbar(tier, row.level, view)
        expect(budget.rows.map((entry) => entry.row)).toContain(row.id)
      }
    }
  })

  it('collapses exactly the icon-bearing controls the table names', () => {
    for (const tier of TIERS) {
      for (const row of TOOLBAR_ROWS) {
        for (const item of row.controls) {
          expect(controlPresentation(item.id, tier)).toBe(item.presentation[tier])
          expect(item.width[item.presentation[tier]]).toBeGreaterThan(0)
        }
      }
    }
    expect(controlPresentation('merge-open-sides', 'compact')).toBe('icon-only')
    expect(controlPresentation('merge-copy', 'compact')).toBe('icon-only')
    expect(controlPresentation('merge-open-sides', 'regular')).toBe('label')
    // The legend drops its status words on compact; the directory model below
    // is the real per-width ladder, this table only keeps the tier budget.
    expect(controlPresentation('legend', 'compact')).toBe('icon-only')
    expect(() => controlPresentation('no-such-control', 'compact')).toThrow()
  })

  it('collapses only label widths when the window is compact', () => {
    const wide = measureToolbar('wide', 'app')
    const compact = measureToolbar('compact', 'app')
    expect(compact.required).toBeLessThan(wide.required)
    // The collapse never hides an entry: the row keeps its budget, it shrinks.
    expect(compact.rows.length).toBe(wide.rows.length)
  })

  it('registers the three code-diff switches inside the single code row', () => {
    const row = TOOLBAR_ROWS.find((item) => item.id === 'code-diff')
    // The pair actions (reload / swap / reset / open sides / byte badge) moved
    // into the row's "more" menu, so only the inline controls remain here.
    expect(row?.controls.map((item) => item.id)).toEqual([
      'mode-switch',
      'block-counter',
      'code-switch-newline',
      'code-switch-encoding',
      'code-switch-whitespace',
      'code-diff-count',
      'more'
    ])
    expect(row?.entries).toEqual(['drilldown-back', 'prev-diff', 'next-diff', 'override', 'save'])
    for (const tier of TIERS) {
      expect(measureToolbar(tier, 'view-toolbar', 'code-diff').fits).toBe(true)
      for (const control of row?.controls ?? []) {
        expect(control.width[controlPresentation(control.id, tier)]).toBeGreaterThan(0)
      }
      const compact = tier === 'compact' ? 'icon-only' : 'label'
      expect(controlPresentation('mode-switch', tier)).toBe('label')
      expect(controlPresentation('code-switch-newline', tier)).toBe(compact)
      expect(controlPresentation('code-switch-encoding', tier)).toBe(compact)
      expect(controlPresentation('code-switch-whitespace', tier)).toBe(compact)
      expect(controlPresentation('code-diff-count', tier)).toBe('label')
      expect(controlPresentation('more', tier)).toBe('label')
    }
  })

  it('keeps the accepted app and code-diff entry sets on one code row', () => {
    expect(SHELL_ENTRY_IDS.length).toBe(18)
    expect(entriesFor('app')).toEqual(['new-compare', 'open-file', 'open-folder', 'settings'])
    expect(entriesFor('view-toolbar', 'code-diff')).toEqual([
      'drilldown-back',
      'prev-diff',
      'next-diff',
      'override',
      'save'
    ])
    expect(viewToolbarRows('code-diff')).toBe(1)
  })
})

describe('directory toolbar layout model', () => {
  const WIDTHS = [960, 1024, 1280, 1440, 1920] as const
  const LOCALES = ['zh', 'en'] as const

  it('fits every rendered line at each acceptance width and locale', () => {
    for (const width of WIDTHS) {
      for (const locale of LOCALES) {
        const layout = measureDirectoryToolbar(width, locale)
        expect(layout.lines.length, `${locale}@${width} lines`).toBe(layout.rows)
        for (const line of layout.lines) {
          expect(line, `${locale}@${width} line`).toBeLessThanOrEqual(layout.available)
        }
        expect(layout.required).toBe(Math.max(...layout.lines))
        expect(layout.required).toBeLessThanOrEqual(layout.available)
      }
    }
  })

  it('keeps the 1024 zh reference and every wide zh width on one 36px row', () => {
    for (const width of [1024, 1280, 1440, 1920] as const) {
      const layout = measureDirectoryToolbar(width, 'zh')
      expect(layout.rows, `zh@${width}`).toBe(1)
      expect(toolbarBandHeightPx(layout.rows)).toBe(36)
    }
    // The wide row still carries the legend status words at the 1280 reference.
    expect(measureDirectoryToolbar(1280, 'zh').legendLabels).toBe(true)
  })

  it('follows the fixed ladder: legend words, sync copy, then wrapping', () => {
    expect(measureDirectoryToolbar(1920, 'zh').collapse).toBe('none')
    expect(measureDirectoryToolbar(1024, 'zh').collapse).toBe('legend')
    expect(measureDirectoryToolbar(960, 'zh').collapse).toBe('sync')
    expect(measureDirectoryToolbar(960, 'en').collapse).toBe('wrap')

    const wrapped = measureDirectoryToolbar(960, 'en')
    expect(wrapped.rows).toBe(2)
    expect(wrapped.legendLabels).toBe(false)
    expect(wrapped.syncLabel).toBe(false)
    expect(toolbarBandHeightPx(wrapped.rows)).toBe(72)
    expect(toolbarBandHeightPx(wrapped.rows)).toBe(levelHeightPx('view-toolbar') * wrapped.rows)
  })

  it('derives the wrapped band height from the row count', () => {
    expect(toolbarBandHeightPx(1)).toBe(36)
    expect(toolbarBandHeightPx(2)).toBe(72)
    expect(toolbarBandHeightPx(2)).toBe(levelHeightPx('view-toolbar') * 2)
  })

  it('renders a wrapping row with no horizontal scroll channel', () => {
    const tokens = directoryToolbarRowClasses().split(' ')
    expect(tokens).toContain('flex')
    expect(tokens).toContain('flex-wrap')
    expect(tokens).toContain('min-h-8')
    expect(tokens).toContain('gap-x-2')
    expect(tokens).toContain('gap-y-1')
    expect(tokens).not.toContain('gap-2')
    expect(tokens).not.toContain('h-8')
    expect(tokens.some((token) => token.startsWith('overflow'))).toBe(false)
    expect(tokens.some((token) => token.includes(':'))).toBe(false)
  })

  it('pins the 32 / 4 / 2 arithmetic behind the 36 / 72 band', () => {
    expect(TOOLBAR_ROW_HEIGHT_PX).toBe(32)
    expect(TOOLBAR_ROW_GAP_PX).toBe(4)
    expect(TOOLBAR_BAND_PADDING_Y_PX).toBe(2)
    expect(SHELL_LEVELS['view-toolbar'].height).toBe('h-8')
    expect(HEIGHT_PX[SHELL_LEVELS['view-toolbar'].height]).toBe(TOOLBAR_ROW_HEIGHT_PX)
    expect(toolbarBandHeightPx(1)).toBe(2 + 32 + 2)
    expect(toolbarBandHeightPx(2)).toBe(2 + 32 + 4 + 32 + 2)
    for (const rows of [1, 2, 3, 4]) {
      expect(toolbarBandHeightPx(rows)).toBe(
        rows * TOOLBAR_ROW_HEIGHT_PX +
          (rows - 1) * TOOLBAR_ROW_GAP_PX +
          TOOLBAR_BAND_PADDING_Y_PX * 2
      )
    }
    expect(levelHeightPx('view-toolbar')).toBe(
      TOOLBAR_ROW_HEIGHT_PX + TOOLBAR_BAND_PADDING_Y_PX * 2
    )
  })

  it('reserves four legend digits so count changes never move the ladder', () => {
    for (const locale of LOCALES) {
      const widths = DIRECTORY_TOOLBAR_WIDTHS[locale]
      expect(widths.legend).toBeGreaterThan(widths.legendCollapsed)
      expect(widths.sync).toBeGreaterThan(widths.syncCollapsed)
      expect(widths.legendCollapsed).toBeGreaterThan(0)
    }
  })
})

describe('status bar width model', () => {
  it('keeps the 520px content on one row at every reference width', () => {
    expect(STATUS_BAR_CONTENT_PX).toBe(520)
    for (const width of STATUS_BAR_WIDTHS) {
      const budget = measureStatusBar(width)
      expect(budget.required).toBe(STATUS_BAR_CONTENT_PX)
      expect(budget.fits).toBe(true)
      expect(budget.rows).toBe(1)
      // Wrapping carries the content: no row ever leaves the viewport.
      expect(budget.available).toBeGreaterThanOrEqual(budget.required)
    }
  })

  it('keeps 1440 / 1920 on one row', () => {
    for (const width of [1440, 1920]) {
      const budget = measureStatusBar(width)
      expect(budget.fits).toBe(true)
      expect(budget.rows).toBe(1)
      expect(budget.available).toBeGreaterThanOrEqual(budget.required)
    }
  })

  it('is driven by the content width, not by a width breakpoint', () => {
    // The same 1920px window wraps when its content grows...
    expect(measureStatusBar(1920, 3000).rows).toBeGreaterThan(1)
    // ...and a narrow window can still fit a short bar on one row.
    expect(measureStatusBar(960, 500).fits).toBe(true)
    for (const width of STATUS_BAR_WIDTHS) {
      const budget = measureStatusBar(width)
      expect(budget.rows * budget.available).toBeGreaterThanOrEqual(STATUS_BAR_CONTENT_PX)
    }
  })

  it('flips from one row to two exactly at the content boundary', () => {
    for (const width of [960, 1024, 1280, 1440, 1920]) {
      const { available } = measureStatusBar(width)
      expect(measureStatusBar(width, available)).toMatchObject({ fits: true, rows: 1 })
      expect(measureStatusBar(width, available + 1)).toMatchObject({ fits: false, rows: 2 })
      expect(measureStatusBar(width, available * 2)).toMatchObject({ fits: false, rows: 2 })
      expect(measureStatusBar(width, available * 2 + 1).rows).toBe(3)
    }
  })

  it('renders a wrapping container with no horizontal scroll channel', () => {
    const tokens = statusBarClasses().split(' ')
    expect(tokens).toContain('flex')
    expect(tokens).toContain('flex-wrap')
    expect(tokens).toContain('gap-y-0')
    expect(tokens.some((token) => token.startsWith('overflow-x'))).toBe(false)
    // The single-row baseline keeps the level's 24px (`h-6`) height.
    expect(levelHeightPx('status')).toBe(24)
    expect(levelHeightPx('status')).toBe(HEIGHT_PX['h-6'])
  })

  it('derives the declared height from the wrapped row count', () => {
    expect(statusBarHeightPx(1)).toBe(24)
    expect(statusBarHeightPx(2)).toBe(2 * 16 + 1)
    expect(statusBarHeightPx(3)).toBe(3 * 16 + 1)
    for (let rows = 1; rows <= 3; rows += 1) {
      // Content box loses only the 1px border; wrapping reaches exact equality.
      expect(statusBarHeightPx(rows) - 1).toBeGreaterThanOrEqual(rows * 16)
    }
    expect(statusBarHeightPx(2) - 1).toBe(2 * 16)
    expect(statusBarHeightPx(3) - 1).toBe(3 * 16)
  })

  it('maps the five reference widths onto the single-row height class', () => {
    for (const width of STATUS_BAR_WIDTHS) {
      const { rows } = measureStatusBar(width)
      expect(rows).toBe(1)
      expect(statusBarHeightPx(rows)).toBe(24)
    }
  })

  it('keeps a single height utility per row count', () => {
    for (const width of STATUS_BAR_WIDTHS) {
      const { rows } = measureStatusBar(width)
      const tokens = statusBarClasses(rows).split(' ')
      const heightTokens = tokens.filter(
        (token) => token === 'h-6' || token === 'h-auto'
      )
      expect(heightTokens).toHaveLength(1)
      expect(rows).toBe(1)
      expect(tokens).toContain('h-6')
      expect(tokens).not.toContain('h-auto')
      expect(tokens).not.toContain('min-h-6')
    }

    const wrapped = statusBarClasses(2).split(' ')
    expect(wrapped).toContain('h-auto')
    expect(wrapped).toContain('min-h-6')
    expect(wrapped).not.toContain('h-6')
  })
})

describe('level class helpers', () => {
  it('tags a header row with the level inset so it never inherits a band padding', () => {
    for (const level of SHELL_LEVEL_ORDER as readonly ShellLevel[]) {
      expect(levelHeaderClasses(level)).toContain(SHELL_LEVELS[level].height)
      expect(levelHeaderClasses(level)).toContain(SHELL_LEVELS[level].paddingX)
      expect(levelHeaderClasses(level)).toContain(SHELL_LEVELS[level].gap)
      expect(levelHeaderClasses(level)).not.toContain(SHELL_LEVELS[level].paddingY)
    }
  })

  it('never emits two different utilities for the same CSS property', () => {
    const count = (tokens: readonly string[], prefix: string): number =>
      tokens.filter((token) => token.startsWith(prefix)).length

    for (const level of SHELL_LEVEL_ORDER as readonly ShellLevel[]) {
      const band = levelBandClasses(level).split(' ')
      const row = levelRowClasses(level).split(' ')
      // The band owns the inset and the row gap, the row owns the height and
      // the control gap: no element ever gets two competing utilities.
      expect(count(band, 'gap-')).toBeLessThanOrEqual(1)
      expect(count(band, 'px-')).toBe(1)
      expect(count(band, 'py-')).toBe(1)
      expect(count(band, 'h-')).toBe(0)
      expect(count(row, 'gap-')).toBe(1)
      expect(count(row, 'h-')).toBe(1)
      expect(count(row, 'px-')).toBe(0)
    }
  })
})

describe('toolbar band surface', () => {
  const ROOT = process.cwd()
  const BAND_FILES = [
    'src/renderer/src/workbench/Workbench.tsx',
    'src/renderer/src/views/CodeView.tsx',
    'src/renderer/src/views/CsvView.tsx',
    'src/renderer/src/views/DirectoryView.tsx',
    'src/renderer/src/views/StructuredView.tsx'
  ] as const

  it('keeps both toolbar levels on one existing token', () => {
    expect(TOOLBAR_BAND_SURFACE).toEqual({
      app: 'bg-surface-sunken',
      'view-toolbar': 'bg-surface-sunken'
    })
  })

  it('has every rendered band consume the shared constant with no second surface', () => {
    const offenders: string[] = []
    let bands = 0
    for (const file of BAND_FILES) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      for (const match of source.matchAll(/data-shell-level="(app|view-toolbar)"/g)) {
        bands += 1
        const level = match[1]
        const slice = source.slice(match.index ?? 0, (match.index ?? 0) + 250)
        const expected =
          level === 'app' ? 'TOOLBAR_BAND_SURFACE.app' : "TOOLBAR_BAND_SURFACE['view-toolbar']"
        if (!slice.includes(expected)) offenders.push(`${file}:${level} missing ${expected}`)
        if (/'bg-surface-/.test(slice)) offenders.push(`${file}:${level} has a literal surface`)
      }
    }
    expect(bands).toBe(6)
    expect(offenders).toEqual([])
  })
})
