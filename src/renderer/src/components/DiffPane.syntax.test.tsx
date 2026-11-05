// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveSyntaxView } from '@core/syntax/view'
import type { SyntaxView } from '@core/syntax/view'
import { diffLineTexts } from '@core/text/diff'
import type { DiffRow, InlineSegment } from '@core/text/diff'
import { DIFF_ROW_HEIGHT, DiffPane } from './DiffPane'
import { installJsdomViewport } from '../../../test/jsdomViewport'

installJsdomViewport({ height: 600 })

afterEach(cleanup)

const TS = ['// note', 'const total = 42', 'const label = "open"'].join('\n')
const PY = ['# note', 'def total():', '    label = "open"', '    return 42'].join('\n')
const JSONC = ['{', '  // note', '  "name": "open",', '  "count": 42,', '  "ready": true', '}'].join('\n')
const MIXED = `const a = 1\n\n  const  b = "x"   \nconst long = "${'y'.repeat(300)}"\n`
const IN_TOKEN = 'const mean = "total"'
const IN_TOKEN_SEGMENTS: readonly InlineSegment[] = [
  { text: 'const mean = "to', changed: false },
  { text: 'tal', changed: true },
  { text: '"', changed: false }
]
const CLASSES = ['keyword', 'string', 'number', 'comment'] as const

function view(path: string, text: string): SyntaxView {
  const resolved = resolveSyntaxView(path, text)
  if (resolved === null) throw new Error(`expected a syntax view for ${path}`)
  return resolved
}

function renderPanes(
  rows: readonly DiffRow[],
  left: SyntaxView | null,
  right: SyntaxView | null
): { left: HTMLElement; right: HTMLElement } {
  const { container } = render(
    <div>
      <div data-pane="left">
        <DiffPane rows={rows} side="left" syntaxView={left} />
      </div>
      <div data-pane="right">
        <DiffPane rows={rows} side="right" syntaxView={right} />
      </div>
    </div>
  )
  const pane = (side: 'left' | 'right'): HTMLElement => {
    const element = container.querySelector<HTMLElement>(`[data-pane="${side}"]`)
    if (element === null) throw new Error(`missing ${side} pane wrapper`)
    return element
  }
  return { left: pane('left'), right: pane('right') }
}

function spans(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-syntax]'))
}

/** `class + text` for every syntax span, in document order. */
const signature = (root: HTMLElement): string[] =>
  spans(root).map((span) => `${span.className}|${span.textContent ?? ''}`)

function cellOf(root: HTMLElement, index: number): HTMLElement {
  const cell = root.querySelector(`[data-diff-row="${index}"]`)?.children[1]
  if (!(cell instanceof HTMLElement)) throw new Error(`row ${index} has no text cell`)
  return cell
}

/** Top-level character-change wrappers of one text cell. */
const changedWrappers = (cell: HTMLElement): HTMLElement[] =>
  Array.from(cell.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.className.includes('bg-diff-')
  )

const BASE_ROW: Omit<DiffRow, 'leftText' | 'rightText'> = {
  status: 'modified',
  leftLine: 1,
  rightLine: 1,
  leftIndex: 0,
  rightIndex: 0
}

function manualRow(
  overrides: Partial<DiffRow> & { readonly leftText: string; readonly rightText: string }
): DiffRow {
  return { ...BASE_ROW, ...overrides }
}

const ROWS = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-diff-row]'))

describe('two-column syntax rendering', () => {
  it('colours each side from its own extension and keeps unknown extensions plain', () => {
    const rows = diffLineTexts(TS, PY).rows
    const py = view('/pairs/right.py', PY)
    const keywords = (root: HTMLElement): (string | null)[] =>
      spans(root).filter((span) => span.dataset.syntax === 'keyword').map((span) => span.textContent)
    const first = renderPanes(rows, view('/pairs/left.ts', TS), py)
    expect(keywords(first.left)).toContain('const')
    expect(keywords(first.right)).toContain('def')
    expect(keywords(first.left)).not.toContain('def')
    expect(keywords(first.right)).not.toContain('const')
    expect(new Set(spans(first.left).map((span) => span.dataset.syntax))).toEqual(new Set(CLASSES))
    expect(new Set(spans(first.right).map((span) => span.dataset.syntax))).toEqual(new Set(CLASSES))
    const rightSignature = signature(first.right)

    cleanup()
    const plainLeft = renderPanes(rows, resolveSyntaxView('/pairs/left.txt', TS), py)
    expect(spans(plainLeft.left)).toHaveLength(0)
    expect(signature(plainLeft.right)).toEqual(rightSignature)

    cleanup()
    const { container } = render(<DiffPane rows={rows} side="left" />)
    const noViewCells = Array.from(container.querySelectorAll('[data-diff-row]')).map(
      (row) => row.children[1]?.innerHTML
    )
    expect(ROWS(plainLeft.left).map((row) => row.children[1]?.innerHTML)).toEqual(noViewCells)
  })

  it('falls back one empty side while the other keeps colouring', () => {
    const rows = diffLineTexts('', TS).rows
    const { left, right } = renderPanes(rows, resolveSyntaxView('/pairs/empty.ts', ''), view('/pairs/a.ts', TS))
    expect(spans(left)).toHaveLength(0)
    expect(spans(right).length).toBeGreaterThan(0)
  })

  it('renders all four foreground classes for the .jsonc sample', () => {
    const resolved = view('/pairs/a.jsonc', JSONC)
    const { left } = renderPanes(diffLineTexts(JSONC, JSONC).rows, resolved, resolved)
    expect(new Set(spans(left).map((span) => span.dataset.syntax))).toEqual(new Set(CLASSES))
    for (const span of spans(left)) expect(span.className).toContain(`text-syntax-${span.dataset.syntax ?? ''}`)
  })

  it('keeps every rendered line text equal to its source line, coloured or plain', () => {
    const rows = diffLineTexts(MIXED, MIXED).rows
    const coloured = renderPanes(rows, view('/pairs/a.ts', MIXED), view('/pairs/a.ts', MIXED))
    const colouredText = rows.map((_, index) => cellOf(coloured.left, index).textContent)
    for (const [index, row] of rows.entries()) {
      expect(colouredText[index]).toBe(row.leftText === '' ? '\u00a0' : row.leftText)
    }

    cleanup()
    const plain = renderPanes(rows, null, null)
    expect(colouredText).toEqual(rows.map((_, index) => cellOf(plain.left, index).textContent))
  })

  it('renders identical spans, gutters and row counts for CRLF and LF', () => {
    const crlf = TS.replace(/\n/g, '\r\n')
    const lf = renderPanes(diffLineTexts(TS, TS).rows, view('/a.ts', TS), view('/a.ts', TS))
    const lfSignature = signature(lf.left)
    const gutter = (root: HTMLElement): (string | null | undefined)[] =>
      ROWS(root).map((row) => row.firstElementChild?.textContent)

    cleanup()
    const crlfPane = renderPanes(diffLineTexts(crlf, crlf).rows, view('/a.ts', crlf), view('/a.ts', crlf))
    expect(signature(crlfPane.left)).toEqual(lfSignature)
    expect(ROWS(crlfPane.left).length).toBe(ROWS(lf.left).length)
    expect(gutter(crlfPane.left)).toEqual(gutter(lf.left))
  })

  it('keeps the virtual window bounded when a large side is coloured', () => {
    const count = 5_000
    const rows = Array.from({ length: count }, (_, index) =>
      manualRow({
        status: 'same',
        leftLine: index + 1,
        rightLine: index + 1,
        leftText: `const line${index} = ${index}`,
        rightText: `const line${index} = ${index}`,
        leftIndex: index,
        rightIndex: index
      })
    )
    const text = rows.map((row) => row.leftText).join('\n')
    const { left } = renderPanes(rows, view('/a.ts', text), view('/a.ts', text))
    expect(ROWS(left).length).toBeGreaterThan(0)
    expect(ROWS(left).length).toBeLessThan(50)
    const contentHeight = left.querySelector('[data-diff-content-height]')
    expect(contentHeight?.getAttribute('data-diff-content-height')).toBe(String(count * DIFF_ROW_HEIGHT))
    expect(left.querySelector('[data-diff-window-start]')).not.toBeNull()
  })
})

describe('syntax tokens × character-level changes', () => {
  it('keeps one token class and only background changes inside a token', () => {
    const rows = [manualRow({ leftText: IN_TOKEN, rightText: IN_TOKEN, leftSegments: IN_TOKEN_SEGMENTS })]
    const { left } = renderPanes(rows, view('/a.ts', IN_TOKEN), view('/a.ts', IN_TOKEN))
    const cell = cellOf(left, 0)
    expect(cell.textContent).toBe(IN_TOKEN)
    expect(cell.className).toContain('bg-diff-modified-soft')
    for (const span of spans(left)) expect(span.className).not.toMatch(/(^|\s)bg-/)

    const stringSpans = spans(left).filter((span) => span.dataset.syntax === 'string')
    expect(stringSpans.map((span) => span.textContent)).toEqual(['"to', 'tal', '"'])
    for (const span of stringSpans) expect(span.className).toContain('text-syntax-string')
    // Only the middle piece carries the change wash, and it is the background layer.
    expect(stringSpans[0]?.parentElement?.className).not.toContain('bg-diff-')
    expect(stringSpans[1]?.parentElement?.className).toContain('bg-diff-modified')
    expect(stringSpans[2]?.parentElement?.className).not.toContain('bg-diff-')

    const changed = changedWrappers(cell)[0]
    expect(changed).toBeDefined()
    expect(changed?.className).not.toMatch(/(^|\s)text-diff-/)
    expect(changed?.querySelector('[data-syntax="string"]')?.className).toContain('text-syntax-string')
  })

  it('splits a token that crosses a changed boundary while keeping its class', () => {
    const text = 'const s = "abcdef" + 1'
    const segments: readonly InlineSegment[] = [
      { text: 'const s = "ab', changed: false },
      { text: 'cdef" + 1', changed: true }
    ]
    const rows = [manualRow({ leftText: text, rightText: text, leftSegments: segments })]
    const { left } = renderPanes(rows, view('/a.ts', text), view('/a.ts', text))
    expect(cellOf(left, 0).textContent).toBe(text)

    const stringTexts = spans(left)
      .filter((span) => span.dataset.syntax === 'string')
      .map((span) => span.textContent)
    expect(stringTexts).toContain('"ab')
    expect(stringTexts).toContain('cdef"')
    for (const span of spans(left)) expect(span.className).toContain('text-syntax-')
    expect(changedWrappers(cellOf(left, 0)).map((span) => span.textContent).join('')).toBe('cdef" + 1')
  })

  it('keeps red only on removed rows, never on a syntax span', () => {
    const text = 'const dead = "gone"'
    const rows = [
      manualRow({ status: 'removed', leftText: text, rightText: text, rightLine: null, rightSegments: [] })
    ]
    const { left } = renderPanes(rows, view('/a.ts', text), view('/a.ts', text))
    expect(cellOf(left, 0).className).toContain('bg-diff-removed-soft')
    for (const span of spans(left)) {
      expect(span.className).toMatch(/^text-syntax-/)
      expect(span.className).not.toContain('diff-removed')
      expect(span.className).not.toContain('danger')
    }
  })
})

