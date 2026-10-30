import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHELL_ENTRY_IDS } from '@renderer/workbench/shellLayout'
import {
  ICON_NAMES,
  ICON_PATHS,
  ICON_SIZES,
  LUCIDE_VERSION,
  SHELL_ENTRY_ICONS,
  UI_ICON_ACTIONS,
  strokeWidthFor
} from './index'

const ROOT = process.cwd()
const ICON_DIR = 'src/renderer/src/assets/icons'
const ICON_COMPONENT = 'src/renderer/src/components/Icon.tsx'
const LICENSE = 'LICENSES/lucide.txt'

/** Every icon set the renderer may never import again. */
const FOREIGN_ICON_SETS = [
  'lucide-react',
  '@tabler/icons',
  '@heroicons/',
  'heroicons',
  'feather-icons',
  'react-icons/',
  '@fortawesome/',
  'bootstrap-icons',
  '@mdi/'
] as const

function walk(path: string, out: string[] = []): string[] {
  if (statSync(join(ROOT, path)).isDirectory()) {
    for (const entry of readdirSync(join(ROOT, path), { withFileTypes: true })) {
      walk(`${path}/${entry.name}`, out)
    }
    return out
  }
  out.push(path)
  return out
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

/** Renderer sources minus tests — the shipped UI. */
const RENDERER_SOURCES = walk('src/renderer').filter(
  (path) => /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path)
)

const VENDORED_FILES = readdirSync(join(ROOT, ICON_DIR))
  .filter((name) => name.endsWith('.svg'))
  .sort()

/** All `fill` / `stroke` attribute values of one SVG document. */
function paintAttributes(svg: string): string[] {
  return Array.from(svg.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)).map((match) => match[1])
}

describe('vendored icon source', () => {
  it('keeps one file per icon and one icon per file', () => {
    expect(VENDORED_FILES.length).toBe(ICON_NAMES.length)
    expect(VENDORED_FILES.map((name) => name.replace(/\.svg$/, '')).sort()).toEqual(
      [...ICON_NAMES].sort()
    )
  })

  it('ships geometry only: svg root, 24 viewBox, no baked stroke or colour', () => {
    for (const file of VENDORED_FILES) {
      const svg = read(`${ICON_DIR}/${file}`)
      expect(svg).toContain('<svg')
      expect(svg).toContain('viewBox="0 0 24 24"')
      expect(svg).toContain('fill="none"')
      expect(svg).not.toContain('stroke-width')
      expect(svg).not.toContain('rgb(')
      expect(svg).not.toContain('#')
      for (const paint of paintAttributes(svg)) expect(['none', 'currentColor']).toContain(paint)

      const name = file.replace(/\.svg$/, '')
      expect(svg.trimStart().startsWith(`<!-- lucide:${name}@${LUCIDE_VERSION} -->`)).toBe(true)
    }
  })

  it('matches the icon table to the files it sits next to', () => {
    for (const name of ICON_NAMES) {
      expect(ICON_PATHS[name].length).toBeGreaterThan(0)
      expect(ICON_PATHS[name]).not.toContain('<svg')
      expect(read(`${ICON_DIR}/${name}.svg`).replace(/>\s+</g, '><')).toContain(ICON_PATHS[name])
    }
    expect(LUCIDE_VERSION).toBe('1.59.0')
  })

  it('reads icons from the build, never from the network', () => {
    const sources = [...VENDORED_FILES.map((file) => `${ICON_DIR}/${file}`), ICON_COMPONENT]
    for (const path of sources) {
      const source = read(path).replaceAll('http://www.w3.org/2000/svg', '')
      expect(source).not.toContain('http://')
      expect(source).not.toContain('https://')
      expect(source).not.toContain('//cdn')
      expect(source).not.toContain('fetch(')
      expect(source).not.toContain('XMLHttpRequest')
    }
  })

  it('keeps the upstream ISC licence next to the vendored files', () => {
    const licence = read(LICENSE)
    expect(licence).toContain('ISC License')
    expect(licence).toContain('Copyright (c)')
    expect(licence).toContain('Permission to use, copy, modify')
    expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  })

  it('holds at most five self-drawn icons, each with its reason', () => {
    const custom: string[] = []
    try {
      for (const file of readdirSync(join(ROOT, ICON_DIR, 'custom'))) {
        if (file.endsWith('.svg')) custom.push(`${ICON_DIR}/custom/${file}`)
      }
    } catch {
      // No custom directory is the expected state: the library covered the UI.
    }
    expect(custom.length).toBeLessThanOrEqual(5)
    for (const path of custom) {
      const svg = read(path)
      expect(svg).toContain('自绘 · 库中缺口理由')
      expect(svg).toContain('viewBox="0 0 24 24"')
      expect(svg).toContain('fill="none"')
      expect(svg).toContain('stroke="currentColor"')
      expect(svg).not.toContain('stroke-width')
      expect(svg).not.toContain('#')
      const name = path.split('/').pop()!.replace(/\.svg$/, '')
      expect(name.startsWith('custom-')).toBe(true)
      expect(ICON_NAMES).toContain(name)
    }
  })
})

describe('icon naming table', () => {
  it('covers every shell entry exactly once', () => {
    expect([...Object.keys(SHELL_ENTRY_ICONS)].sort()).toEqual([...SHELL_ENTRY_IDS].sort())
    for (const icon of Object.values(SHELL_ENTRY_ICONS)) expect(ICON_NAMES).toContain(icon)
  })

  it('keeps every non-shell action on a vendored icon', () => {
    const actions = Object.values(UI_ICON_ACTIONS)
    expect(actions.length).toBeGreaterThan(0)
    for (const icon of actions) expect(ICON_NAMES).toContain(icon)
  })

  it('vendors no icon that no action uses', () => {
    const used = new Set<string>([...Object.values(SHELL_ENTRY_ICONS), ...Object.values(UI_ICON_ACTIONS)])
    expect(ICON_NAMES.filter((name) => !used.has(name))).toEqual([])
  })
})

describe('optical stroke width', () => {
  it('never reuses the 24px stroke on a smaller rendition', () => {
    expect(strokeWidthFor(24)).toBe(2)
    expect(strokeWidthFor(16)).toBeLessThan(strokeWidthFor(20))
    expect(strokeWidthFor(20)).toBeLessThanOrEqual(2)
    expect(strokeWidthFor(16)).toBeGreaterThanOrEqual(1.25)
    expect(ICON_SIZES).toEqual([16, 20, 24])
    for (const size of ICON_SIZES) expect(strokeWidthFor(size)).toBeGreaterThan(0)
    expect(new Set(ICON_SIZES.map(strokeWidthFor)).size).toBe(ICON_SIZES.length)
  })
})

describe('dependency set', () => {
  it('no longer declares or locks an icon package', () => {
    const manifest = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies)).not.toContain('lucide-react')
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@tanstack/react-virtual',
      'diff',
      'jsonc-parser',
      'node-diff3',
      'papaparse',
      'react',
      'react-dom',
      'yaml'
    ])
    expect(read('pnpm-lock.yaml')).not.toContain('lucide-react')
  })

  it('lets the linter catch any later icon-package import', () => {
    const config = read('eslint.config.mjs')
    for (const name of FOREIGN_ICON_SETS) expect(config).toContain(name)
  })
})

describe('renderer icon usage', () => {
  it('imports no icon package anywhere in the repo', () => {
    const offenders: string[] = []
    for (const path of walk('src').filter((file) => /\.(ts|tsx)$/.test(file))) {
      const source = read(path)
      for (const name of FOREIGN_ICON_SETS) {
        if (source.includes(`from '${name}`) || source.includes(`from "${name}`)) {
          offenders.push(`${path} → ${name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('never names an icon inline: the name comes from the table', () => {
    const offenders = RENDERER_SOURCES.filter((path) => /<Icon[^>]*\sname="/.test(read(path)))
    expect(offenders).toEqual([])
  })

  it('emits svg only from the Icon component', () => {
    const offenders = RENDERER_SOURCES.filter(
      (path) => path.endsWith('.tsx') && path !== ICON_COMPONENT && read(path).includes('<svg')
    )
    expect(offenders).toEqual([])
  })

  it('keeps icon sizes on the 16 / 20 / 24 steps', () => {
    const offenders: string[] = []
    for (const path of RENDERER_SOURCES) {
      // An icon takes its size from the component, never from a utility class.
      const source = read(path)
      for (const match of source.matchAll(/<Icon\b[\s\S]*?\/>/g)) {
        if (/\bsize-/.test(match[0])) offenders.push(`${path}: ${match[0]}`)
      }
      if (/\bsize-3(\.5)?\b/.test(source)) offenders.push(`${path}: size-3 utility`)
    }
    expect(offenders).toEqual([])
  })

  it('renders no emoji in place of an icon', () => {
    const emoji = /\uFE0F|[\u{1F300}-\u{1FAFF}]|[\u2600-\u27BF]/u
    const offenders = RENDERER_SOURCES.filter((path) => emoji.test(read(path)))
    expect(offenders).toEqual([])
  })
})
