#!/usr/bin/env node
/**
 * Captures the two README screenshots from the built application.
 *
 *   pnpm build && node scripts/capture-readme-screenshots.mjs
 *
 * Both shots come from the real Electron window (`out/main` + `out/renderer`,
 * the same build a release ships) driving real temporary directory trees and a
 * real file pair — no built-in sample, no old or composed image. The page is
 * captured through the DevTools protocol, so nothing but the window content ends
 * up in the PNG.
 *
 * The app is started once per shot with the comparison as launch arguments, so
 * the sessions are opened by the real launch intake; the script only waits for
 * the UI to settle and asks Chromium for a screenshot.
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

// The capture talks to the page over the DevTools WebSocket. Node below 22 has
// no global `WebSocket`, so the script re-runs itself with Electron's bundled
// Node (22+) instead of pulling in a dependency.
if (typeof WebSocket === 'undefined') {
  const rerun = spawnSync(electronBinary, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  process.exit(rerun.status ?? 1)
}

const root = fileURLToPath(new URL('..', import.meta.url))
const assetsDir = join(root, 'docs/assets')
const BUILD_ENTRIES = [
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html'
]

const WORKBENCH_PNG = 'opencompare-workbench.png'
const FILE_DIFF_PNG = 'opencompare-file-diff.png'

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

async function capture({ paths, port, home, ready, output }) {
  const child = runApp(paths, port, home)
  try {
    const devtools = await Devtools.connect(port)
    try {
      await devtools.waitFor(ready, `${output} to render`)
      // One more paint after the session settles, so no transition is mid-flight.
      await new Promise((resolve) => setTimeout(resolve, 600))
      const png = await devtools.screenshot()
      writeFileSync(join(assetsDir, output), png)
      return png.length
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
      throw new Error(`missing ${entry}; run \`pnpm build\` before capturing screenshots`)
    }
  }
  mkdirSync(assetsDir, { recursive: true })

  // `/tmp` keeps the paths in the capture short; the tree is removed afterwards.
  const scratch = mkdtempSync(join('/tmp', 'oc-readme-'))
  const home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  writeTree(scratch, 'left')
  writeTree(scratch, 'right')
  const left = join(scratch, 'left')
  const right = join(scratch, 'right')

  try {
    const workbenchBytes = await capture({
      paths: [left, right],
      port: 9311,
      home,
      output: WORKBENCH_PNG,
      ready: `document.querySelectorAll('[role="tree"]').length >= 2 &&
        document.querySelectorAll('[role="treeitem"]').length > 10 &&
        !document.querySelector('[role="status"][aria-label*="progress" i]')`
    })
    const diffBytes = await capture({
      paths: [join(left, 'src/session.ts'), join(right, 'src/session.ts')],
      port: 9312,
      home,
      output: FILE_DIFF_PNG,
      ready: `!!document.querySelector('[data-diff-ruler="true"]') &&
        document.querySelectorAll('[role="tree"]').length === 0`
    })
    console.log(`wrote docs/assets/${WORKBENCH_PNG} (${workbenchBytes} bytes)`)
    console.log(`wrote docs/assets/${FILE_DIFF_PNG} (${diffBytes} bytes)`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
