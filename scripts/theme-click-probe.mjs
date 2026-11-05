#!/usr/bin/env node
// Settings 主题点击探针：区分「驱动坐标没命中」与「产品真的不切换」。
//
// 只使用 Node 内置 fetch 与运行时全局 WebSocket（CDP 传输），不依赖任何第三方包。
// 判定顺序：
//   1. elementFromPoint(tab 中心) 未落在 tab 内部 -> driver-miss；
//   2. CDP 坐标点击后 MutationObserver 观察到 data-theme/color-scheme 变更 -> ok-cdp；
//   3. 未变更则页面内 el.click() 复测；仍不变更 -> product-no-switch；
//      页面内点击能变更而坐标点击不能 -> driver-miss（坐标/遮挡问题）。
//
// 退出码：0 = ok-cdp，1 = driver-miss，2 = product-no-switch / 探针本身失败。

import { pathToFileURL } from 'node:url'

export const DEFAULT_PROBE_OPTIONS = Object.freeze({
  port: 9601,
  label: 'Light',
  expectTheme: 'light',
  timeout: 2000
})

export const PROBE_EXIT_CODES = Object.freeze({
  'ok-cdp': 0,
  'driver-miss': 1,
  'product-no-switch': 2
})

const VALUE_FLAGS = Object.freeze({
  '--port': 'port',
  '--label': 'label',
  '--expect': 'expectTheme',
  '--timeout': 'timeout'
})

/**
 * 纯判定函数：只吃三个事实，不碰 DOM / 网络。
 * - hit：坐标点是否命中目标 tab；
 * - cdpMutated：CDP 坐标点击后目标主题是否生效；
 * - domClickMutated：页面内 `.click()` 复测后目标主题是否生效。
 */
export function judgeThemeProbe({ hit, cdpMutated, domClickMutated }) {
  if (!hit) return 'driver-miss'
  if (cdpMutated) return 'ok-cdp'
  if (domClickMutated) return 'driver-miss'
  return 'product-no-switch'
}

export function probeExitCode(verdict) {
  const code = PROBE_EXIT_CODES[verdict]
  if (code === undefined) throw new Error(`unknown probe verdict: ${verdict}`)
  return code
}

/** 把页面事实整理成可复查的报告；判定为失败分支时补上归因事实。 */
export function buildProbeReport({ label, expectTheme, tabs, hit, cdp, domClick }) {
  const verdict = judgeThemeProbe({
    hit: hit?.insideTarget === true,
    cdpMutated: cdp?.mutated === true,
    domClickMutated: domClick?.mutated === true
  })
  const report = {
    label,
    expectTheme,
    verdict,
    exitCode: probeExitCode(verdict),
    tabs,
    hit,
    cdp,
    domClick
  }
  if (verdict === 'driver-miss') report.actualElement = hit?.element ?? null
  if (verdict === 'product-no-switch') {
    report.fact = `in-page .click() left data-theme unchanged (${domClick?.before?.theme ?? 'null'} -> ${domClick?.after?.theme ?? 'null'})`
  }
  return report
}

export function parseProbeArgs(argv) {
  const options = { ...DEFAULT_PROBE_OPTIONS, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    const match = /^(--[a-z-]+)(?:=(.*))?$/.exec(arg)
    if (!match) throw new Error(`unknown argument: ${arg}`)
    const key = VALUE_FLAGS[match[1]]
    if (!key) throw new Error(`unknown argument: ${arg}`)
    const value = match[2] ?? argv[(index += 1)]
    if (value === undefined) throw new Error(`missing value for ${match[1]}`)
    if (key === 'port' || key === 'timeout') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid ${match[1]}: ${value}`)
      options[key] = Math.trunc(parsed)
      continue
    }
    options[key] = value
  }
  return options
}

const HELP = `Usage: node scripts/theme-click-probe.mjs [options]

在 Electron 窗口验收会话里判定 Settings 主题 tab「有没有被真正点到」。

Options:
  --port <n>      远程调试端口（默认 9601）
  --label <text>  主题 tab 文案（默认 Light）
  --expect <mode> 期望写入的 data-theme（默认 light：light / dark）
  --timeout <ms>  每次点击后等待 DOM 变更的上限（默认 2000）
  --help, -h      打印本帮助并以 0 退出

Verdict / exit code:
  0  ok-cdp             坐标命中且 CDP 点击后主题生效
  1  driver-miss        坐标没命中 tab，或坐标点击无效但页面内 .click() 有效
  2  product-no-switch  坐标与页面内 .click() 都无法改变 data-theme

示例（先在设置里打开 Settings 对话框，暴露远程调试端口后）：
  node scripts/theme-click-probe.mjs --port 9601 --label Light --expect light
`

async function resolvePageTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`CDP endpoint http://127.0.0.1:${port}/json/list -> ${response.status}`)
  const targets = await response.json()
  const page = targets.find(
    (target) => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string'
  )
  if (!page) throw new Error('no page target exposes webSocketDebuggerUrl')
  return page
}

function connectSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    socket.addEventListener('open', () => resolve(socket), { once: true })
    socket.addEventListener('error', () => reject(new Error(`cannot connect ${url}`)), {
      once: true
    })
  })
}

function createCdpClient(socket) {
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP error'))
    else waiter.resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1
      pending.set(nextId, { resolve, reject })
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'page evaluation failed')
    }
    return result.result.value
  }
  return { send, evaluate, close: () => socket.close() }
}

const COLLECT_EXPRESSION = (label) => `
(() => {
  const label = ${JSON.stringify(label)};
  const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
    (element) => (element.textContent || '').trim() === label
  );
  if (!tab) {
    return {
      found: false,
      visibleTabs: Array.from(document.querySelectorAll('[role="tab"]')).map(
        (element) => (element.textContent || '').trim()
      )
    };
  }
  const tablist = tab.closest('[role="tablist"]');
  const tabs = Array.from(tablist ? tablist.querySelectorAll('[role="tab"]') : [tab]).map(
    (element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: (element.textContent || '').trim(),
        role: element.getAttribute('role'),
        tablist: tablist ? tablist.getAttribute('aria-label') : null,
        ariaSelected: element.getAttribute('aria-selected'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    }
  );
  const rect = tab.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const hitElement = document.elementFromPoint(x, y);
  const insideTarget = Boolean(hitElement && (hitElement === tab || tab.contains(hitElement)));
  window.__themeClickProbe = {
    tab,
    before: {
      theme: document.documentElement.dataset.theme || null,
      colorScheme: document.documentElement.style.colorScheme || null,
      bodyBg: getComputedStyle(document.body).backgroundColor || null
    }
  };
  return {
    found: true,
    tabs,
    hit: {
      x,
      y,
      insideTarget,
      element: hitElement
        ? {
            tagName: hitElement.tagName,
            role: hitElement.getAttribute('role'),
            text: (hitElement.textContent || '').trim().slice(0, 80),
            insideTarget
          }
        : null
    }
  };
})()
`

const settleExpression = (expectTheme, timeout, clickInPage) => `
new Promise((resolve) => {
  const state = window.__themeClickProbe;
  const doc = document.documentElement;
  const snapshot = () => ({
    theme: doc.dataset.theme || null,
    colorScheme: doc.style.colorScheme || null,
    bodyBg: getComputedStyle(document.body).backgroundColor || null
  });
  const changed = () => (doc.dataset.theme || null) === ${JSON.stringify(expectTheme)};
  const settle = (mutated, elapsedMs) => {
    const after = snapshot();
    resolve({
      mutated,
      before: state.before,
      after: {
        ...after,
        bodyBgChanged: after.bodyBg !== state.before.bodyBg
      },
      elapsedMs
    });
  };
  if (changed()) { settle(true, 0); return; }
  const started = performance.now();
  let done = false;
  const finish = (mutated) => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearTimeout(timer);
    settle(mutated, Math.round(performance.now() - started));
  };
  const observer = new MutationObserver(() => {
    if (changed()) finish(true);
  });
  observer.observe(doc, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  const timer = setTimeout(() => finish(false), ${timeout});
  if (${clickInPage}) {
    state.before = snapshot();
    state.tab.click();
  }
})
`

async function runProbe(options) {
  const target = await resolvePageTarget(options.port)
  const socket = await connectSocket(target.webSocketDebuggerUrl)
  const cdp = createCdpClient(socket)
  try {
    await cdp.send('Runtime.enable')
    const collected = await cdp.evaluate(COLLECT_EXPRESSION(options.label))
    if (!collected.found) {
      throw new Error(
        `theme tab "${options.label}" not found; visible tabs: ${JSON.stringify(collected.visibleTabs)}`
      )
    }
    let cdpResult = {
      mutated: false,
      skipped: true,
      before: null,
      after: null,
      elapsedMs: 0
    }
    if (collected.hit.insideTarget) {
      const { x, y } = collected.hit
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', {
          type,
          x,
          y,
          button: type === 'mouseMoved' ? 'none' : 'left',
          clickCount: type === 'mouseMoved' ? 0 : 1
        })
      }
      cdpResult = await cdp.evaluate(settleExpression(options.expectTheme, options.timeout, false))
    }
    let domClickResult = {
      mutated: false,
      skipped: true,
      before: null,
      after: null,
      elapsedMs: 0
    }
    if (collected.hit.insideTarget && !cdpResult.mutated) {
      domClickResult = await cdp.evaluate(
        settleExpression(options.expectTheme, options.timeout, true)
      )
    }
    return buildProbeReport({
      label: options.label,
      expectTheme: options.expectTheme,
      tabs: collected.tabs,
      hit: collected.hit,
      cdp: cdpResult,
      domClick: domClickResult
    })
  } finally {
    cdp.close()
  }
}

async function main() {
  let options
  try {
    options = parseProbeArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`theme-click-probe: ${error instanceof Error ? error.message : String(error)}`)
    console.error(HELP)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(HELP)
    return
  }
  try {
    const report = await runProbe(options)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.exitCode
  } catch (error) {
    console.error(`theme-click-probe failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
