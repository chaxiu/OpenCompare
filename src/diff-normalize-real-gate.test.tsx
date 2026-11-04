// @vitest-environment jsdom
/**
 * Real-disk evidence gate for the newline / encoding normalization switches.
 *
 * The run writes the six encoding variants of two size groups to a fixed temp
 * root, probes the bytes that actually landed on disk, compares every pair
 * through one `diffLineTextsWithFacts` call and drives the real `Workbench` over
 * the thousand-line group. Default-on must hide newline / encoding-only
 * differences, strict off must report them, re-enabling must return to zero and
 * the status bar must always show the raw probe values.
 *
 * It prints `OPENCOMPARE_DIFF_NORMALIZE_EVIDENCE <JSON>` and, when
 * `OPENCOMPARE_EVIDENCE_OUT` is set, writes that same JSON to the given path.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { foldNewlines } from '@core/text/normalize'
import { decodeText, detectNewline } from '@core/text/probe'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { Workbench } from '@renderer/workbench/Workbench'
import {
  DOM_PAIR,
  EVIDENCE_COMMAND,
  EVIDENCE_JSON_PATH,
  EVIDENCE_ROOT,
  EXPECTED_LABELS,
  FIVE_MIB,
  GROUPS,
  PAIRS,
  STATUS_KEYS,
  STRICT_RECOMPUTE_BUDGET_MS,
  TEST_TIMEOUT_MS,
  THOUSAND_LINES,
  UNMUTATED_VARIANT_IDS,
  VARIANT_IDS,
  countNewlineTerminators,
  createDiskPlatformPort,
  emitEvidenceLine,
  measureEvidence,
  pairKey,
  pinnedFields,
  readEvidenceDocument,
  removeEvidenceRoot,
  stateOf,
  writeEvidenceFixtures,
  writeEvidenceOut
} from './test/diffNormalizeRealFixture'
import type {
  EvidenceDom,
  EvidenceRun,
  FixtureGroupId,
  PairComparisons,
  VariantId,
  WrittenFixtures
} from './test/diffNormalizeRealFixture'
type SwitchId = 'ignore-newline' | 'ignore-encoding'
interface DomFacts {
  readonly evidence: EvidenceDom
  readonly tagName: string
  readonly role: string | null
  readonly encodingRole: string | null
  readonly encodingTagName: string
  readonly encodingFocusable: boolean
  readonly tabIndex: number
  readonly focusable: boolean
  readonly checked: readonly (readonly [string | null, string | null])[]
  readonly countAfterFirstClick: number
  readonly blocksSpaceOff: number
}
let fixtures: WrittenFixtures
let run: EvidenceRun
let dom: DomFacts
const SWITCH_LABELS: Record<SwitchId, string> = {
  'ignore-newline': zh['files.code.ignoreNewline'],
  'ignore-encoding': zh['files.code.ignoreEncoding']
}
/** The single toolbar overflow trigger; every comparison switch lives inside. */
function moreTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-shell-entry="more"]')
  if (trigger === null) throw new Error('missing more trigger')
  return trigger
}
/** Opens the overflow menu and returns it, idempotently. */
function openMore(): HTMLElement {
  const trigger = moreTrigger()
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
  const menu = screen.queryByRole('menu')
  if (menu === null) throw new Error('more menu did not open')
  return menu
}
function switchOf(id: SwitchId): HTMLElement {
  return within(openMore()).getByRole('menuitem', {
    name: (name: string) => name.includes(SWITCH_LABELS[id])
  })
}
function switchState(id: SwitchId): string {
  return (switchOf(id).textContent ?? '').trimStart().startsWith('[x]') ? 'true' : 'false'
}
function checkedState(): readonly [string | null, string | null] {
  return [switchState('ignore-newline'), switchState('ignore-encoding')]
}
function countValue(): number {
  return Number(document.querySelector('[data-code-diff-count]')?.textContent ?? 'NaN')
}
function blockCount(): number {
  const spans = Array.from(
    document.querySelector('[data-shell-level="view-toolbar"]')?.querySelectorAll('span') ?? []
  )
  const counter = spans.find((span) => /^\d+\/\d+$/.test(span.textContent ?? ''))?.textContent ?? ''
  return Number(counter.slice(counter.indexOf('/') + 1))
}
/** The four original probe values of the status layer, in DOM order. */
function statusValues(): string[] {
  const bar = document.querySelector<HTMLElement>('footer[data-shell-level="status"]')
  if (bar === null) throw new Error('missing status bar')
  const labels: readonly string[] = STATUS_KEYS.map((key) => zh[key])
  return Array.from(bar.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => ({
      label: child.firstElementChild?.textContent ?? '',
      value: child.querySelector('.tabular')?.textContent ?? ''
    }))
    .filter((entry) => labels.includes(entry.label))
    .map((entry) => entry.value)
}
function paneRows(): number[] {
  const panes = Array.from(document.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto'))
  if (panes.length !== 2) throw new Error(`expected two diff panes, found ${panes.length}`)
  return panes.map((pane) => pane.querySelectorAll('[data-diff-row]').length)
}
/** Opens one real absolute pair through the manual entry and waits for its tab. */
async function openPair(left: string, right: string, tab: RegExp): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: zh['shell.toolbar.newCompare'] })[0])
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(zh['shell.compare.leftPath']), {
    target: { value: left }
  })
  fireEvent.change(within(dialog).getByLabelText(zh['shell.compare.rightPath']), {
    target: { value: right }
  })
  fireEvent.click(within(dialog).getByRole('button', { name: zh['shell.compare.submit'] }))
  await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toBeTruthy())
  await waitFor(() => expect(document.querySelector('[data-code-diff-count]')).not.toBeNull())
}
async function measureDom(): Promise<DomFacts> {
  const [leftId, rightId] = DOM_PAIR
  const thousand = fixtures.groups.thousand.variants
  const view = renderWithI18n(<Workbench platform={createDiskPlatformPort()} />, 'zh')
  try {
    await openPair(
      thousand[leftId].path,
      thousand[rightId].path,
      new RegExp(`${leftId}\\.txt ↔ ${rightId}\\.txt`)
    )
    const first = switchOf('ignore-newline')
    const tagName = first.tagName
    const role = first.getAttribute('role')
    const encodingSwitch = switchOf('ignore-encoding')
    const encodingRole = encodingSwitch.getAttribute('role')
    const encodingTagName = encodingSwitch.tagName
    encodingSwitch.focus()
    const encodingFocusable = document.activeElement === encodingSwitch
    first.focus()
    const focusable = document.activeElement === first
    const tabIndex = first.tabIndex
    const checked: (readonly [string | null, string | null])[] = []
    const counts: number[] = []
    const blocks: number[] = []
    const snap = (): void => {
      checked.push(checkedState())
      counts.push(countValue())
      blocks.push(blockCount())
    }
    snap()
    const statusDefault = statusValues()
    const clickStart = performance.now()
    fireEvent.click(switchOf('ignore-newline'))
    const switchClickMs = performance.now() - clickStart
    snap()
    fireEvent.click(switchOf('ignore-encoding'))
    snap()
    fireEvent.click(switchOf('ignore-newline'))
    fireEvent.click(switchOf('ignore-encoding'))
    snap()
    const statusAfterClickCycle = statusValues()
    // Menu items are native buttons: a Space / Enter press activates the same
    // click handler. jsdom has no default button activation, so focus the item
    // and dispatch the click the browser would synthesize.
    const spaceStart = performance.now()
    const spaceItem = switchOf('ignore-newline')
    spaceItem.focus()
    fireEvent.click(spaceItem)
    const switchSpaceMs = performance.now() - spaceStart
    snap()
    const spaceItemAgain = switchOf('ignore-newline')
    spaceItemAgain.focus()
    fireEvent.click(spaceItemAgain)
    snap()
    const statusAfterSpaceCycle = statusValues()
    const rows = paneRows()
    return {
      tagName,
      role,
      encodingRole,
      encodingTagName,
      encodingFocusable,
      tabIndex,
      focusable,
      checked,
      countAfterFirstClick: counts[1],
      blocksSpaceOff: blocks[4],
      evidence: {
        pair: DOM_PAIR,
        statusDefault,
        statusAfterClickCycle,
        statusAfterSpaceCycle,
        countDefault: counts[0],
        countClickOff: counts[2],
        countClickReopened: counts[3],
        countSpaceOff: counts[4],
        countSpaceOn: counts[5],
        blocksDefault: blocks[0],
        blocksClickOff: blocks[2],
        blocksClickReopened: blocks[3],
        switchClickMs,
        switchSpaceMs,
        leftRows: rows[0],
        rightRows: rows[1]
      }
    }
  } finally {
    view.unmount()
  }
}
function pairOf(group: FixtureGroupId, left: VariantId, right: VariantId): PairComparisons {
  const found = run.pairs.get(pairKey(group, left, right))
  if (found === undefined) throw new Error(`missing comparison: ${group}:${left}>${right}`)
  return found
}

beforeAll(async () => {
  fixtures = writeEvidenceFixtures()
  dom = await measureDom()
  run = measureEvidence(fixtures, dom.evidence)
  emitEvidenceLine(run.evidence)
  const out = process.env.OPENCOMPARE_EVIDENCE_OUT
  if (out !== undefined && out.length > 0) {
    writeEvidenceOut(resolve(process.cwd(), out), run.evidence)
  }
}, TEST_TIMEOUT_MS)

afterAll(() => {
  cleanup()
  removeEvidenceRoot()
})

describe('diff normalization on real external files', () => {
  it('writes both groups to disk with matching stat sizes and digests', () => {
    expect(fixtures.root).toBe(EVIDENCE_ROOT)
    for (const group of GROUPS) {
      for (const id of VARIANT_IDS) {
        const variant = fixtures.groups[group].variants[id]
        const diskSha = createHash('sha256').update(readFileSync(variant.path)).digest('hex')
        expect(existsSync(variant.path)).toBe(true)
        expect(statSync(variant.path).size).toBe(variant.bytes)
        expect(variant.bytes).toBeGreaterThan(0)
        expect(diskSha).toBe(variant.sha256)
      }
    }
  })
  it('labels every variant from its own bytes and decodes one identical text', () => {
    for (const group of GROUPS) {
      const reference = fixtures.groups[group].variants['utf8-lf']
      for (const id of VARIANT_IDS) {
        const variant = fixtures.groups[group].variants[id]
        expect(variant.encoding).toBe(EXPECTED_LABELS[id].encoding)
        expect(variant.newline).toBe(EXPECTED_LABELS[id].newline)
        expect(detectNewline(variant.text)).toBe(EXPECTED_LABELS[id].newline)
        expect(decodeText(readFileSync(variant.path)).text).toBe(variant.text)
        if (id !== 'utf8-crlf-mutated') {
          expect(foldNewlines(variant.text)).toBe(foldNewlines(reference.text))
        }
      }
      expect(fixtures.groups[group].variants['gbk-lf'].encoding).toBe('GBK')
    }
  })
  it('keeps the thousand-line count and the five-mebibyte floor', () => {
    for (const id of VARIANT_IDS) {
      const thousand = fixtures.groups.thousand.variants[id]
      expect(countNewlineTerminators(thousand.text)).toBe(THOUSAND_LINES)
      expect(thousand.lines).toBe(THOUSAND_LINES)
      const terminator = thousand.newline === 'CRLF' ? '\r\n' : '\n'
      expect(thousand.text.endsWith(terminator)).toBe(true)
      expect(thousand.text.endsWith(`${terminator}${terminator}`)).toBe(false)
      const large = fixtures.groups['five-megabyte'].variants[id]
      expect(large.lines).toBeGreaterThanOrEqual(THOUSAND_LINES)
      if (id.startsWith('utf8')) expect(large.bytes).toBeGreaterThanOrEqual(FIVE_MIB)
    }
  })
  it('reports zero differences for the same text with both switches on', () => {
    for (const group of GROUPS) {
      for (const spec of PAIRS) {
        if (!UNMUTATED_VARIANT_IDS.includes(spec.left)) continue
        const comparison = pairOf(group, spec.left, spec.right).defaultComparison
        expect(comparison.differenceCount).toBe(0)
        expect(comparison.blocks).toHaveLength(0)
        expect(comparison.identical).toBe(true)
        expect(stateOf(comparison).nonSameRows).toBe(0)
      }
    }
  })
  it('reports newline and encoding differences only when both switches are off', () => {
    for (const group of GROUPS) {
      const newlineOnly = pairOf(group, 'utf8-crlf', 'utf8-lf').strictComparison
      expect(newlineOnly.blocks.length).toBeGreaterThanOrEqual(1)
      expect(newlineOnly.differenceCount).toBeGreaterThanOrEqual(1)
      expect(newlineOnly.normalization.encoding.byteDifference).toBe(false)
      const bomOnly = pairOf(group, 'utf8bom-lf', 'utf8-lf').strictComparison
      expect(bomOnly.blocks).toHaveLength(0)
      expect(bomOnly.normalization.encoding.byteDifference).toBe(true)
      expect(bomOnly.differenceCount).toBe(1)
      expect(pairOf(group, 'utf16le-crlf', 'gbk-lf').strictComparison.differenceCount).toBeGreaterThanOrEqual(1)
    }
  })
  it('never swallows the one mutated character under either switch state', () => {
    for (const group of GROUPS) {
      const pair = pairOf(group, 'utf8-crlf-mutated', 'utf8-lf')
      for (const comparison of [pair.defaultComparison, pair.strictComparison]) {
        expect(comparison.differenceCount).toBeGreaterThanOrEqual(1)
        expect(comparison.rows.some((row) => row.status !== 'same')).toBe(true)
      }
    }
  })
  it('round-trips the DOM count, keeps raw status values and stays operable', () => {
    const pair = pairOf('thousand', DOM_PAIR[0], DOM_PAIR[1])
    const readings = dom.evidence
    expect(readings.countDefault).toBe(pair.defaultComparison.differenceCount)
    expect(readings.blocksDefault).toBe(pair.defaultComparison.blocks.length)
    expect(readings.countClickOff).toBe(pair.strictComparison.differenceCount)
    expect(readings.blocksClickOff).toBe(pair.strictComparison.blocks.length)
    expect(readings.countClickReopened).toBe(pair.defaultComparison.differenceCount)
    expect(readings.blocksClickReopened).toBe(pair.defaultComparison.blocks.length)
    expect(readings.countDefault).toBe(0)
    expect(readings.countClickOff).toBeGreaterThan(0)
    expect(readings.countClickReopened).toBe(0)
    expect(readings.statusDefault).toEqual(['CRLF', 'LF', 'UTF-8', 'GBK'])
    expect(readings.statusAfterClickCycle).toEqual(readings.statusDefault)
    expect(readings.statusAfterSpaceCycle).toEqual(readings.statusDefault)
    expect(dom.tagName).toBe('BUTTON')
    expect(dom.role).toBe('menuitem')
    expect(dom.encodingRole).toBe('menuitem')
    expect(dom.encodingTagName).toBe('BUTTON')
    expect(dom.encodingFocusable).toBe(true)
    expect(dom.tabIndex).toBe(0)
    expect(dom.focusable).toBe(true)
    expect(dom.checked[0]).toEqual(['true', 'true'])
    expect(dom.checked[1]).toEqual(['false', 'true'])
    expect(dom.countAfterFirstClick).toBe(pair.newlineOnlyComparison.differenceCount)
    expect(dom.checked[2]).toEqual(['false', 'false'])
    expect(dom.checked[3]).toEqual(['true', 'true'])
    expect(dom.checked[4]).toEqual(['false', 'true'])
    expect(readings.countSpaceOff).toBe(pair.newlineOnlyComparison.differenceCount)
    expect(dom.blocksSpaceOff).toBe(pair.newlineOnlyComparison.blocks.length)
    expect(dom.checked[5]).toEqual(['true', 'true'])
    expect(readings.countSpaceOn).toBe(0)
    expect(readings.leftRows).toBeGreaterThan(0)
    expect(readings.leftRows).toBe(readings.rightRows)
  })
  it('records probe and recompute elapsed times within the explicit budget', () => {
    const five = run.evidence.groups['five-megabyte']
    expect(five.probeMs).toBeGreaterThan(0)
    expect(five.strictRecomputeMs).toBeGreaterThanOrEqual(0)
    expect(five.strictRecomputeMs).toBeLessThan(STRICT_RECOMPUTE_BUDGET_MS)
    for (const pair of five.pairs) {
      expect(pair.defaultElapsedMs).toBeGreaterThanOrEqual(0)
      expect(pair.strictElapsedMs).toBeGreaterThanOrEqual(0)
      expect(pair.strictElapsedMs).toBeLessThan(STRICT_RECOMPUTE_BUDGET_MS)
    }
    expect(dom.evidence.switchClickMs).toBeGreaterThanOrEqual(0)
    expect(dom.evidence.switchSpaceMs).toBeGreaterThanOrEqual(0)
  })
  it('produces the evidence document described by the committed artifact', () => {
    const evidence = run.evidence
    expect(evidence.version).toBe(1)
    expect(evidence.command).toBe(EVIDENCE_COMMAND)
    expect(evidence.root).toBe(EVIDENCE_ROOT)
    expect(evidence.thresholds).toEqual({
      fiveMib: FIVE_MIB,
      thousandLines: THOUSAND_LINES,
      strictRecomputeBudgetMs: STRICT_RECOMPUTE_BUDGET_MS
    })
    for (const group of GROUPS) {
      expect(evidence.groups[group].pairs).toHaveLength(PAIRS.length)
      for (const id of VARIANT_IDS) {
        const variant = evidence.groups[group].variants[id]
        expect(variant.path.startsWith(EVIDENCE_ROOT)).toBe(true)
        expect(variant.bytes).toBeGreaterThan(0)
        expect(variant.sha256).toMatch(/^[0-9a-f]{64}$/)
      }
    }
    expect(evidence.groups.thousand.logicalLines).toBe(THOUSAND_LINES)
  })
  it('pins the committed evidence document to this live run', () => {
    const committed = readEvidenceDocument(resolve(process.cwd(), EVIDENCE_JSON_PATH))
    expect(pinnedFields(committed)).toEqual(pinnedFields(run.evidence))
  })
})