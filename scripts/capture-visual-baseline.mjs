#!/usr/bin/env node
/**
 * Captures the four pre-token visual baselines under `docs/visual/v1/before/`.
 *
 *   pnpm build && node scripts/capture-visual-baseline.mjs
 *
 * Each shot uses the real built application (`out/main` + `out/renderer`) and
 * real temporary directory trees / a real file pair, exactly like the README
 * capture path. The window content is captured through the DevTools protocol at
 * a 1280x792 logical viewport and 2x device scale (2560x1584 pixels); light /
 * dark is selected by setting `document.documentElement.dataset.theme` before
 * the screenshot, so both themes come from the same build.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')

// Node below 22 has no global `WebSocket`; re-run with Electron's bundled Node.
if (typeof WebSocket === 'undefined') {
  const rerun = spawnSync(electronBinary, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  process.exit(rerun.status ?? 1)
}

const root = fileURLToPath(new URL('..', import.meta.url))
// `--out=after` writes the post-change set without touching `before/`.
const outArg = process.argv.find((arg) => arg.startsWith('--out='))
const outputName = outArg === undefined ? 'before' : outArg.slice('--out='.length)
const outputDir = join(root, 'docs/visual/v1', outputName)
const BUILD_ENTRIES = [
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html'
]

const SESSION_TS_LEFT = `import { createStore } from './store'
import type { Session, SessionId } from './types'

const ROOT_KEY = 'opencompare.sessions'

export interface SessionOptions {
  readonly restore: boolean
  readonly maxOpen: number
}

export function sessionLabel(session: Session): string {
  return session.kind === 'directory'
    ? \`\${session.left} ↔ \${session.right}\`
    : session.left.split('/').at(-1) ?? session.left
}

export function createSessionStore(options: SessionOptions) {
  const store = createStore<SessionId, Session>({
    compare: (a, b) => a.createdAt - b.createdAt
  })

  function open(session: Session): SessionId {
    if (store.size >= options.maxOpen) {
      const oldest = store.first()
      if (oldest !== undefined) store.delete(oldest)
    }
    store.set(session.id, session)
    return session.id
  }

  function activate(id: SessionId): Session | undefined {
    const session = store.get(id)
    if (session === undefined) return undefined
    session.activeAt = Date.now()
    return session
  }

  function close(id: SessionId): boolean {
    return store.delete(id)
  }

  function snapshot(): Session[] {
    return store.values().sort((a, b) => a.activeAt - b.activeAt)
  }

  return { open, activate, close, snapshot, restore: options.restore }
}

export const STORAGE_KEY = ROOT_KEY
`

const SESSION_TS_RIGHT = `import { createStore } from './store'
import type { Session, SessionId } from './types'

export const ROOT_KEY = 'opencompare.workbench.sessions'

export interface SessionOptions {
  readonly restore: boolean
  readonly maxOpen: number
  readonly persist: boolean
}

export function sessionLabel(session: Session): string {
  return session.kind === 'directory'
    ? \`\${session.left} ↔ \${session.right}\`
    : session.left.split('/').at(-1) ?? session.left
}

export function createSessionStore(options: SessionOptions) {
  const store = createStore<SessionId, Session>({
    compare: (a, b) => a.createdAt - b.createdAt
  })

  function open(session: Session): SessionId {
    if (store.size >= options.maxOpen) {
      const oldest = store.first()
      if (oldest !== undefined) store.delete(oldest)
    }
    store.set(session.id, session)
    return session.id
  }

  function activate(id: SessionId): Session | undefined {
    const session = store.get(id)
    if (session === undefined) return undefined
    session.activeAt = Date.now()
    session.seenAt = session.activeAt
    return session
  }

  function close(id: SessionId): boolean {
    return store.delete(id)
  }

  function snapshot(): Session[] {
    return store.values().sort((a, b) => a.activeAt - b.activeAt)
  }

  return { open, activate, close, snapshot, restore: options.restore, persist: options.persist }
}

export const STORAGE_KEY = ROOT_KEY
`

const APP_TS = (label) => `import { createSessionStore } from './session'
import { mountToolbar } from './components/Toolbar'

/** Boots the workbench shell for the ${label} side. */
export function bootstrap(): void {
  const sessions = createSessionStore({ restore: true, maxOpen: 12 })
  mountToolbar(document.querySelector('#toolbar'), sessions)
}

bootstrap()
`

const TOOLBAR_TSX = `export function mountToolbar(host, sessions) {
  if (!host) return
  host.dataset.sessionCount = String(sessions.snapshot().length)
}
`

const README_TEXT = (name) => `# ${name}

A tiny sample project used while comparing two working copies.
`

const PACKAGE_JSON = (name, version) =>
  `{\n  "name": "${name}",\n  "version": "${version}",\n  "private": true\n}\n`

function writeTree(base, side) {
  const files = {
    'README.md': README_TEXT(side === 'left' ? 'acme-web' : 'acme-web'),
    'package.json': PACKAGE_JSON('acme-web', side === 'left' ? '0.8.0' : '0.9.0'),
    'src/app.ts': APP_TS(side),
    'src/components/Toolbar.tsx': TOOLBAR_TSX,
    'docs/architecture.md': '# Architecture\n\nThe shell owns sessions and panels.\n'
  }
  if (side === 'left') {
    files['src/session.ts'] = SESSION_TS_LEFT
    files['references/legacy-notes.md'] = '# Legacy notes\n\nText files only.\n'
  } else {
    files['src/session.ts'] = SESSION_TS_RIGHT
    files['src/highlight.ts'] = `/** Line and word highlighting for the code view. */\nexport function highlight(line) {\n  return line\n}\n`
    files['tests/app.test.ts'] = `import { bootstrap } from '../src/app'\n\nbootstrap()\n`
    files['docs/theme.md'] = '# Theme\n\nLight and dark share one token set.\n'
  }
  for (const [relative, text] of Object.entries(files)) {
    const path = join(base, side, relative)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
}

class Devtools {
  static async connect(port) {
    const deadline = Date.now() + 30_000
    let target
    while (Date.now() < deadline) {
      try {
        const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
          response.json()
        )
        target = list.find((entry) => entry.type === 'page')
      } catch {
        // Chromium is still booting.
      }
      if (target) break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (!target) throw new Error('the window never exposed a DevTools page target')

    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), {
        once: true
      })
    })
    const pending = new Map()
    let nextId = 0
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
    return new Devtools(socket, pending, () => (nextId += 1))
  }

  constructor(socket, pending, nextId) {
    this.socket = socket
    this.pending = pending
    this.nextId = nextId
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId()
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
    return result.result.value
  }

  async waitFor(expression, description) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error(`timed out waiting for ${description}`)
  }

  async screenshot() {
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true
    })
    return Buffer.from(result.data, 'base64')
  }

  close() {
    this.socket.close()
  }
}

/**
 * Real DOM measurements of the shell band and view metrics, evaluated inside
 * the captured window so `measurements.md` never copies a design draft.
 */
const MEASURE_EXPRESSION = `(() => {
  const px = (value) => Math.round(value * 100) / 100
  const height = (selector) => {
    const element = document.querySelector(selector)
    return element === null ? null : px(element.getBoundingClientRect().height)
  }
  const width = (selector) => {
    const element = document.querySelector(selector)
    return element === null ? null : px(element.getBoundingClientRect().width)
  }
  const font = (selector) => {
    const element = document.querySelector(selector)
    return element === null ? null : getComputedStyle(element).fontSize
  }
  const row = document.querySelector('[data-diff-row]')
  const rowSpan = row === null ? null : row.querySelector('span')
  const ruler = document.querySelector('[data-diff-ruler="true"]')
  const track = document.querySelector('[data-ruler-track="true"]')
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    app: height('[data-shell-level="app"]'),
    sessions: height('[data-shell-level="sessions"]'),
    viewToolbar: height('[data-shell-level="view-toolbar"]'),
    panels: height('[data-shell-level="panels"]'),
    panelHeader: height('[data-panel-header]'),
    status: height('[data-shell-level="status"]'),
    treeRow: height('[role="treeitem"]'),
    diffRow: row === null ? null : px(row.getBoundingClientRect().height),
    codeFont: rowSpan === null ? null : getComputedStyle(rowSpan).fontSize,
    gutterFont: row === null ? null : font('[data-diff-row] span'),
    rulerTrack: track === null ? null : px(track.getBoundingClientRect().width),
    rulerGap:
      ruler === null
        ? null
        : px(parseFloat(getComputedStyle(ruler).paddingRight || '0')),
    scrollbar: height('[data-shell-level="panels"] [data-diff-ruler="true"]')
  }
})()`

function runApp(paths, port, home) {
  return spawn(
    electronBinary,
    [root, ...paths, `--remote-debugging-port=${port}`],
    {
      cwd: root,
      env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
}

function stop(child) {
  return new Promise((resolve) => {
    child.removeAllListeners('exit')
    child.once('exit', resolve)
    child.kill('SIGTERM')
    setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5_000)
  })
}

async function capture({ paths, port, home, ready, output, theme }) {
  const child = runApp(paths, port, home)
  try {
    const devtools = await Devtools.connect(port)
    try {
      await devtools.waitFor(ready, `${output} to render`)
      await devtools.evaluate(
        `document.documentElement.dataset.theme = ${JSON.stringify(theme)}; true`
      )
      // One more paint after the theme switch and the session settle.
      await new Promise((resolve) => setTimeout(resolve, 700))
      const metrics = await devtools.evaluate(MEASURE_EXPRESSION)
      const png = await devtools.screenshot()
      writeFileSync(join(outputDir, output), png)
      return { bytes: png.length, metrics }
    } finally {
      devtools.close()
    }
  } finally {
    await stop(child)
  }
}

async function main() {
  for (const entry of BUILD_ENTRIES) {
    if (!existsSync(join(root, entry))) {
      throw new Error(`missing ${entry}; run \`pnpm build\` before capturing baselines`)
    }
  }
  mkdirSync(outputDir, { recursive: true })

  const scratch = mkdtempSync(join('/tmp', 'oc-visual-'))
  const home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  writeTree(scratch, 'left')
  writeTree(scratch, 'right')
  const left = join(scratch, 'left')
  const right = join(scratch, 'right')

  const shots = [
    {
      theme: 'dark',
      output: 'directory-dark.png',
      paths: [left, right],
      port: 9321,
      ready: `document.querySelectorAll('[role="tree"]').length >= 2 &&
        document.querySelectorAll('[role="treeitem"]').length > 10 &&
        !document.querySelector('[role="status"][aria-label*="progress" i]')`
    },
    {
      theme: 'light',
      output: 'directory-light.png',
      paths: [left, right],
      port: 9322,
      ready: `document.querySelectorAll('[role="tree"]').length >= 2 &&
        document.querySelectorAll('[role="treeitem"]').length > 10 &&
        !document.querySelector('[role="status"][aria-label*="progress" i]')`
    },
    {
      theme: 'dark',
      output: 'file-dark.png',
      paths: [join(left, 'src/session.ts'), join(right, 'src/session.ts')],
      port: 9323,
      ready: `!!document.querySelector('[data-diff-ruler="true"]') &&
        document.querySelectorAll('[role="tree"]').length === 0`
    },
    {
      theme: 'light',
      output: 'file-light.png',
      paths: [join(left, 'src/session.ts'), join(right, 'src/session.ts')],
      port: 9324,
      ready: `!!document.querySelector('[data-diff-ruler="true"]') &&
        document.querySelectorAll('[role="tree"]').length === 0`
    }
  ]

  try {
    for (const shot of shots) {
      const result = await capture({ ...shot, home })
      console.log(
        `wrote docs/visual/v1/${outputName}/${shot.output} (${result.bytes} bytes)`
      )
      console.log(`measured ${shot.output} ${JSON.stringify(result.metrics)}`)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
