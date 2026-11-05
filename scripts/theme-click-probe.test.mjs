import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PROBE_EXIT_CODES,
  buildProbeReport,
  judgeThemeProbe,
  parseProbeArgs,
  probeExitCode
} from './theme-click-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scriptPath = join(here, 'theme-click-probe.mjs')

const facts = {
  label: 'Light',
  expectTheme: 'light',
  tabs: [
    {
      label: 'Light',
      role: 'tab',
      tablist: 'Theme',
      ariaSelected: 'true',
      rect: { x: 10, y: 20, width: 60, height: 24 }
    }
  ],
  hit: {
    x: 40,
    y: 32,
    insideTarget: true,
    element: { tagName: 'BUTTON', role: 'tab', text: 'Light', insideTarget: true }
  }
}

describe('judgeThemeProbe', () => {
  it('classifies a coordinate miss as driver-miss even when the click cannot change DOM', () => {
    expect(judgeThemeProbe({ hit: false, cdpMutated: false, domClickMutated: false })).toBe(
      'driver-miss'
    )
    expect(judgeThemeProbe({ hit: false, cdpMutated: false, domClickMutated: true })).toBe(
      'driver-miss'
    )
  })

  it('classifies a hit plus CDP mutation as ok-cdp', () => {
    expect(judgeThemeProbe({ hit: true, cdpMutated: true, domClickMutated: false })).toBe('ok-cdp')
  })

  it('classifies a hit whose only working path is in-page click as driver-miss', () => {
    expect(judgeThemeProbe({ hit: true, cdpMutated: false, domClickMutated: true })).toBe(
      'driver-miss'
    )
  })

  it('classifies an unresponsive product as product-no-switch', () => {
    expect(judgeThemeProbe({ hit: true, cdpMutated: false, domClickMutated: false })).toBe(
      'product-no-switch'
    )
  })
})

describe('probe exit codes', () => {
  it('maps verdicts to 0 / 1 / 2', () => {
    expect(PROBE_EXIT_CODES).toEqual({
      'ok-cdp': 0,
      'driver-miss': 1,
      'product-no-switch': 2
    })
    expect(probeExitCode('ok-cdp')).toBe(0)
    expect(probeExitCode('driver-miss')).toBe(1)
    expect(probeExitCode('product-no-switch')).toBe(2)
    expect(() => probeExitCode('unknown')).toThrow('unknown probe verdict')
  })
})

describe('buildProbeReport', () => {
  it('keeps tab control facts and the hit element in the report', () => {
    const report = buildProbeReport({
      ...facts,
      cdp: { mutated: true, before: { theme: 'dark' }, after: { theme: 'light' } },
      domClick: { mutated: false }
    })
    expect(report.verdict).toBe('ok-cdp')
    expect(report.tabs).toEqual(facts.tabs)
    expect(report.hit.element).toEqual(facts.hit.element)
    expect(report.actualElement).toBeUndefined()
  })

  it('prints the actual element at the coordinates for driver-miss', () => {
    const report = buildProbeReport({
      ...facts,
      hit: {
        ...facts.hit,
        insideTarget: false,
        element: { tagName: 'DIV', role: null, text: 'overlay', insideTarget: false }
      },
      cdp: { mutated: false },
      domClick: { mutated: false }
    })
    expect(report.verdict).toBe('driver-miss')
    expect(report.actualElement).toEqual({
      tagName: 'DIV',
      role: null,
      text: 'overlay',
      insideTarget: false
    })
  })

  it('prints the in-page click fact for product-no-switch', () => {
    const report = buildProbeReport({
      ...facts,
      cdp: { mutated: false },
      domClick: { mutated: false, before: { theme: 'dark' }, after: { theme: 'dark' } }
    })
    expect(report.verdict).toBe('product-no-switch')
    expect(report.fact).toContain('in-page .click()')
    expect(report.fact).toContain('data-theme unchanged')
    expect(report.fact).toContain('dark -> dark')
  })
})

describe('parseProbeArgs', () => {
  it('defaults to port 9601 / Light / light / 2000ms', () => {
    expect(parseProbeArgs([])).toEqual({
      port: 9601,
      label: 'Light',
      expectTheme: 'light',
      timeout: 2000,
      help: false
    })
  })

  it('reads the documented flags in both --flag value and --flag=value form', () => {
    expect(
      parseProbeArgs(['--port=9602', '--label', 'Dark', '--expect=dark', '--timeout', '500'])
    ).toEqual({
      port: 9602,
      label: 'Dark',
      expectTheme: 'dark',
      timeout: 500,
      help: false
    })
  })
})

describe('CLI contract', () => {
  it('exits 0 on --help without touching CDP', () => {
    const result = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: node scripts/theme-click-probe.mjs')
    expect(result.stdout).toContain('--port')
    expect(result.stdout).toContain('product-no-switch')
  })

  it('imports only Node builtins (no third-party dependency)', () => {
    const source = readFileSync(scriptPath, 'utf8')
    const specifiers = [...source.matchAll(/^import\s[^\n]*?from\s+'([^']+)'/gm)].map(
      (match) => match[1]
    )
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) expect(specifier.startsWith('node:')).toBe(true)
    expect(source).not.toMatch(/from\s+['"](?:puppeteer|playwright|chrome-remote-interface)['"]/)
  })
})
