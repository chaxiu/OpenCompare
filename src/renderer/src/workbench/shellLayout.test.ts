import { describe, expect, it } from 'vitest'
import {
  BASELINE_DRILLDOWN_BAND_PX,
  BASELINE_TOOLBAR_BAND_PX,
  CHROME_BASELINE_PX,
  REFERENCE_VIEWPORT_HEIGHT_PX,
  contentRowBudget,
  controlPresentation,
  HEIGHT_PX,
  SHELL_ENTRIES,
  SHELL_ENTRY_IDS,
  SHELL_LEVELS,
  SHELL_LEVEL_ORDER,
  TIER_WIDTHS,
  TOOLBAR_ROWS,
  chromeHeightPx,
  entriesFor,
  entryPresentation,
  levelBandClasses,
  levelHeaderClasses,
  levelHeightPx,
  levelRowClasses,
  mainContentHeightPx,
  measureToolbar,
  resolveWidthTier,
  toolbarBandHeightPx,
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
      expect(['h-6', 'h-7']).toContain(metrics.controlHeight)
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

  it('keeps the ready chrome at or under the pre-change 112px baseline', () => {
    expect(levelHeightPx('app')).toBe(44)
    expect(levelHeightPx('sessions')).toBe(36)
    expect(levelHeightPx('status')).toBe(32)
    expect(chromeHeightPx('ready')).toBe(112)
    expect(chromeHeightPx('ready')).toBeLessThanOrEqual(CHROME_BASELINE_PX)
    expect(chromeHeightPx('empty')).toBe(76)
    for (const tier of TIERS) {
      expect(TIER_WIDTHS[tier]).toBeGreaterThan(0)
      // Tier independent: the same numbers for every window width.
      expect(chromeHeightPx('ready')).toBe(112)
      expect(mainContentHeightPx('ready')).toBe(768 - 112)
    }
  })

  it('does not lose a visible row against the pre-change bands', () => {
    expect(toolbarBandHeightPx(0)).toBe(0)
    expect(toolbarBandHeightPx(1)).toBe(32)
    expect(toolbarBandHeightPx(2)).toBe(66)
    expect(toolbarBandHeightPx(3)).toBe(100)

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
          const after = contentRowBudget('ready', view, rowPx, drilldown)
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
    const alwaysIcon = ['settings', 'prev-diff', 'next-diff']
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
    for (const tier of TIERS) {
      for (const view of VIEWS) {
        const budget = measureToolbar(tier, 'view-toolbar', view)
        expect(budget.fits).toBe(true)
        for (const row of budget.rows) {
          expect(row.required).toBeLessThanOrEqual(row.available)
        }
      }
    }
  })

  it('reports one budget row per rendered toolbar row', () => {
    const directory = measureToolbar('compact', 'view-toolbar', 'directory')
    expect(directory.rows.map((row) => row.row)).toEqual([
      'directory-status',
      'directory-sync',
      'directory-snapshots'
    ])
    const code = measureToolbar('compact', 'view-toolbar', 'code-merge')
    expect(code.rows.map((row) => row.row)).toEqual(['code-mode', 'code-merge'])
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
    // A row control that has no icon must keep its copy at every width.
    expect(controlPresentation('legend', 'compact')).toBe('label')
    expect(() => controlPresentation('no-such-control', 'compact')).toThrow()
  })

  it('collapses only label widths when the window is compact', () => {
    const wide = measureToolbar('wide', 'app')
    const compact = measureToolbar('compact', 'app')
    expect(compact.required).toBeLessThan(wide.required)
    // The collapse never hides an entry: the row keeps its budget, it shrinks.
    expect(compact.rows.length).toBe(wide.rows.length)
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
