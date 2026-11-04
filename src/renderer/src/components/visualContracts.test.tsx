import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Checkbox } from './Checkbox'

/**
 * Control contracts for the visual baseline item. The assertions read the
 * shipped sources (never a copy) so a drifting class or a stray spacing step
 * fails here first.
 */
const source = (path: string): string =>
  readFileSync(join(process.cwd(), 'src/renderer/src', path), 'utf8')

const TOUCHED = [
  'components/Button.tsx',
  'components/Checkbox.tsx',
  'components/DiffBadge.tsx',
  'components/diffSemantics.ts',
  'components/StatusBar.tsx',
  'components/SessionTabs.tsx',
  'components/SegmentedControl.tsx',
  'views/CodeView.tsx',
  'views/DirectoryView.tsx',
  'views/TemplateDialog.tsx',
  'views/DirectorySyncDialog.tsx'
] as const

const ALLOWED_STEPS = new Set(['0', '1', '2', '3', '4', '6'])
const SPACING =
  /(?:^|[\s"'`:])(-)?(gap-x|gap-y|space-x|space-y|gap|px|py|pt|pr|pb|pl|p|mx|my|mt|mr|mb|ml|m)-(\d+(?:\.\d+)?)(?![\w.-])/g

describe('spacing contract', () => {
  it('only uses the 4/8/12/16/24 steps in files changed by this item', () => {
    for (const path of TOUCHED) {
      const text = source(path)
      for (const match of text.matchAll(SPACING)) {
        const utility = `${match[1] ?? ''}${match[2]}-${match[3]}`
        expect(ALLOWED_STEPS.has(match[3]), `${path}: ${utility}`).toBe(true)
      }
    }
  })
})

describe('button contract', () => {
  const button = source('components/Button.tsx')

  it('takes its height from the control tokens, never numeric steps', () => {
    expect(button).toContain('h-[var(--height-control-md)]')
    expect(button).toContain('h-[var(--height-control-sm)]')
    expect(button).not.toMatch(/\bh-[678]\b/)
    expect(button).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
  })

  it('keeps the three emphasis tiers plus the destructive exception', () => {
    for (const tone of ['default', 'primary', 'ghost', 'danger']) {
      expect(button, `tone ${tone}`).toContain(`${tone}:`)
    }
  })
})

describe('toggle contract', () => {
  const checkbox = source('components/Checkbox.tsx')

  it('paints one 28×16 box with a 2px stroke and a 4px radius', () => {
    expect(checkbox).toContain('h-4 w-7')
    expect(checkbox).toContain('rounded-xs')
    expect(checkbox).toContain('border-2')
  })

  it('keeps switch and checkbox platform semantics', () => {
    expect(checkbox).toContain('role="switch"')
    expect(checkbox).toContain('aria-checked={checked}')
    expect(checkbox).toContain('type="checkbox"')
    expect(checkbox).toContain('peer sr-only')
  })

  it('renders a switch button that reports its state', () => {
    const markup = renderToStaticMarkup(
      <Checkbox role="switch" checked label="Ignore whitespace" onChange={() => {}} />
    )
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('aria-label="Ignore whitespace"')
  })

  it('renders a native checkbox for plain booleans', () => {
    const markup = renderToStaticMarkup(<Checkbox checked={false} label="Hide paths" onChange={() => {}} />)
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('role="checkbox"')
    expect(markup).toContain('aria-label="Hide paths"')
  })
})

describe('chip contract', () => {
  const badge = source('components/DiffBadge.tsx')
  const semantics = source('components/diffSemantics.ts')
  const statusBar = source('components/StatusBar.tsx')

  it('keeps the 20px chip with an 8px dot and 11px copy', () => {
    expect(badge).toContain('size-2')
    expect(badge).toContain('h-5')
    expect(badge).toContain('rounded-xs')
    expect(badge).toContain('text-2xs')
    expect(statusBar).toContain('h-5')
    expect(statusBar).toContain('rounded-xs')
  })

  it('drops the coloured outline and keeps the soft tint class', () => {
    expect(semantics).toContain('bg-diff-')
    expect(semantics).toContain('-soft')
    expect(semantics).not.toMatch(/\bborder-(?!l-)/)
  })
})

describe('tab contract', () => {
  for (const path of ['components/SessionTabs.tsx', 'components/SegmentedControl.tsx'] as const) {
    it(`${path} is 30px tall with a 2px accent underline`, () => {
      const text = source(path)
      expect(text).toContain('h-[30px]')
      expect(text).toContain('h-0.5')
      expect(text).toContain('bg-accent')
    })
  }
})

describe('segmented control height contract', () => {
  it('keeps only horizontal padding so the frame is 30 + 2 = 32', () => {
    const text = source('components/SegmentedControl.tsx')
    expect(text).toContain('px-1 py-0')
    expect(text).not.toMatch(/\bp-1\b/)
    expect(text).toContain('border-line-subtle')
  })
})
