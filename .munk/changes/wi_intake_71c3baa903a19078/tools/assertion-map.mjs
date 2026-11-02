#!/usr/bin/env node
/* global console, process */
/**
 * Mechanical assertion map generator for the Q5 evidence item.
 *
 * Reads the two target test files at two git revisions (default: 97a18f3 -> 120f06d),
 * splits them into `it(` / `test(` blocks, counts `expect(` per block, and emits
 *   - a per-case table (baseline vs current expect count),
 *   - the expect calls that live outside any case block (file-local helper functions),
 *   - a file-level list of expect expressions whose text changed,
 *   - the harness export name(s) that appear in each replacement expression.
 *
 * The script is read-only: it never writes a repository file, output goes to stdout.
 *
 * Usage:
 *   node .munk/changes/wi_intake_71c3baa903a19078/tools/assertion-map.mjs \
 *     [--baseline=97a18f3] [--current=120f06d] [--json]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, '').split('=')
    return [k, rest.join('=') || 'true']
  }),
)
const BASELINE = args.get('baseline') || '97a18f3'
const CURRENT = args.get('current') || '120f06d'
const AS_JSON = args.get('json') === 'true'
const FILES = ['src/renderer/src/App.test.tsx', 'src/sync-real-gate.test.ts']
const HARNESS = 'src/test/sharedHarness.tsx'

const gitShow = (rev, file) => execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8' })

/** Blank comments and string/template literals while preserving every position. */
function mask(src) {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i += 1 }
      continue
    }
    if (c === '/' && d === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' '
        i += 1
      }
      if (i < src.length) { out[i] = ' '; out[i + 1] = ' '; i += 2 }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      out[i] = ' '; i += 1
      while (i < src.length) {
        if (src[i] === '\\') {
          out[i] = ' '
          if (i + 1 < src.length && src[i + 1] !== '\n') out[i + 1] = ' '
          i += 2
          continue
        }
        if (src[i] === q) { out[i] = ' '; i += 1; break }
        if (src[i] !== '\n') out[i] = ' '
        i += 1
      }
      continue
    }
    i += 1
  }
  return out.join('')
}

function findMatching(masked, start, open, close) {
  let depth = 0
  for (let i = start; i < masked.length; i += 1) {
    if (masked[i] === open) depth += 1
    else if (masked[i] === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** All expect(...) chains in [from, to), with absolute source spans. */
function expectCalls(src, masked, from, to) {
  const calls = []
  const re = /(^|[^A-Za-z0-9_$.])expect\s*\(/g
  re.lastIndex = from
  let m
  while ((m = re.exec(masked)) !== null && m.index < to) {
    const start = m.index + m[1].length
    const open = masked.indexOf('(', start)
    const close = findMatching(masked, open, '(', ')')
    if (close < 0 || close > to) break
    let end = close + 1
    // Absorb the matcher chain: `.toBe(...)`, `.not.toEqual(...)`, `.resolves...`
    for (;;) {
      const rest = masked.slice(end, to)
      const chain = rest.match(/^\s*(?:\??\.\s*[A-Za-z_$][\w$]*\s*(?:\([^()]*\))?)+/)
      if (!chain) break
      end += chain[0].length
    }
    calls.push({ start, end, text: src.slice(start, end).replace(/\s+/g, ' ').trim() })
    re.lastIndex = end
  }
  return calls
}

function lineOf(src, position) {
  let line = 1
  for (let i = 0; i < position; i += 1) if (src[i] === '\n') line += 1
  return line
}

/** Nearest top-level function / const binding above `position`. */
function enclosing(src, position) {
  const before = src.slice(0, position)
  const re = /(?:^|\n)[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g
  let last = '(top-level)'
  let m
  while ((m = re.exec(before)) !== null) last = m[1]
  return last
}

function testCases(src, masked) {
  const cases = []
  // `it(...)`, `test(...)` and variants such as `it.skipIf(cond)(...)`.
  const re = /(^|[^A-Za-z0-9_$.])(it|test)((?:\.[A-Za-z_$][\w$]*)*)\s*\(/g
  let m
  while ((m = re.exec(masked)) !== null) {
    const kwStart = m.index + m[1].length
    const modifier = m[3] || ''
    const firstOpen = masked.indexOf('(', kwStart)
    let open = firstOpen
    let end = findMatching(masked, firstOpen, '(', ')')
    if (modifier && end >= 0) {
      // The modifier call returns the real `it`/`test`; the next `(` carries title/body.
      let next = end + 1
      while (next < masked.length && /\s/.test(masked[next])) next += 1
      if (masked[next] === '(') {
        open = next
        end = findMatching(masked, next, '(', ')')
      }
    }
    if (end < 0) continue
    const raw = src.slice(open, end + 1)
    const titleMatch = raw.match(/\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/)
    const title = titleMatch ? titleMatch[2].replace(/\\(['"`\\])/g, '$1') : '(unknown)'
    cases.push({
      title,
      line: lineOf(src, kwStart),
      modifier,
      start: open,
      end,
      expects: expectCalls(src, masked, open, end),
    })
    re.lastIndex = end
  }
  return cases
}

/** File-local `function` declarations and how many expects live in each body. */
function localHelpers(src, masked) {
  const helpersOut = []
  const re = /(?:^|\n)[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g
  let m
  while ((m = re.exec(masked)) !== null) {
    const name = m[1]
    const bodyOpen = masked.indexOf('{', m.index + m[0].length)
    if (bodyOpen < 0) continue
    const bodyClose = findMatching(masked, bodyOpen, '{', '}')
    if (bodyClose < 0) continue
    helpersOut.push({
      name,
      line: lineOf(src, m.index + m[0].indexOf(m[1])),
      expects: expectCalls(src, masked, bodyOpen, bodyClose).length,
    })
    re.lastIndex = bodyClose
  }
  return helpersOut
}

function harnessExports() {
  let src
  try {
    src = fs.readFileSync(HARNESS, 'utf8')
  } catch {
    return []
  }
  const masked = mask(src)
  const names = new Set()
  for (const m of masked.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of masked.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}

const helpers = harnessExports()
const usedHelpers = (expr) => {
  const masked = mask(expr)
  return helpers.filter((name) => new RegExp(`(^|[^\\w$])${name.replace(/[$]/g, '\\$')}\\b`).test(masked))
}

const report = { baseline: BASELINE, current: CURRENT, harnessExports: helpers, files: [] }

for (const file of FILES) {
  const baseSrc = gitShow(BASELINE, file)
  const currSrc = gitShow(CURRENT, file)
  const baseMasked = mask(baseSrc)
  const currMasked = mask(currSrc)
  const baseCases = testCases(baseSrc, baseMasked)
  const currCases = testCases(currSrc, currMasked)
  const baseHelpers = localHelpers(baseSrc, baseMasked)
  const currHelpers = localHelpers(currSrc, currMasked)

  const inside = (pos, cases) => cases.some((c) => pos >= c.start && pos <= c.end)
  const unattributed = (src, masked, cases) =>
    expectCalls(src, masked, 0, src.length)
      .filter((call) => !inside(call.start, cases))
      .map((call) => ({ line: lineOf(src, call.start), owner: enclosing(src, call.start), text: call.text }))

  const baseOutside = unattributed(baseSrc, baseMasked, baseCases)
  const currOutside = unattributed(currSrc, currMasked, currCases)

  const currByTitle = new Map()
  for (const c of currCases) {
    if (!currByTitle.has(c.title)) currByTitle.set(c.title, [])
    currByTitle.get(c.title).push(c)
  }

  const rows = []
  const textChanges = []
  for (let i = 0; i < baseCases.length; i += 1) {
    const base = baseCases[i]
    const bucket = currByTitle.get(base.title)
    const curr = bucket && bucket.length ? bucket.shift() : undefined
    const row = {
      index: i + 1,
      line: base.line,
      title: base.title,
      modifier: base.modifier,
      baselineExpects: base.expects.length,
      currentExpects: curr ? curr.expects.length : 0,
      present: Boolean(curr),
      textChanges: [],
    }
    if (curr) {
      const max = Math.max(base.expects.length, curr.expects.length)
      for (let j = 0; j < max; j += 1) {
        const before = base.expects[j]
        const after = curr.expects[j]
        if (before && after && before.text === after.text) continue
        const helpersUsed = after ? usedHelpers(after.text) : []
        // Ignore line-wrap, trailing commas and redundant parentheses.
        const skeleton = (text) => text.replace(/[\s,()]/g, '')
        const kind =
          before && after && skeleton(before.text) === skeleton(after.text)
            ? 'formatting-only'
            : helpersUsed.length
              ? 'helper-substitution'
              : 'text-changed'
        const change = {
          case: base.title,
          position: j + 1,
          before: before ? before.text : '(none)',
          after: after ? after.text : '(none)',
          helpers: helpersUsed,
          kind,
        }
        row.textChanges.push(change)
        textChanges.push(change)
      }
    }
    rows.push(row)
  }

  const matched = rows.filter((r) => r.present)
  const baseHelperMap = new Map(baseHelpers.map((h) => [h.name, h]))
  const currHelperMap = new Map(currHelpers.map((h) => [h.name, h]))
  const helperNamesAll = [...new Set([...baseHelperMap.keys(), ...currHelperMap.keys()])].sort()
  const helperDelta = helperNamesAll
    .map((name) => ({
      name,
      baseline: baseHelperMap.get(name)?.expects ?? null,
      current: currHelperMap.get(name)?.expects ?? null,
      baselineLine: baseHelperMap.get(name)?.line ?? null,
      currentLine: currHelperMap.get(name)?.line ?? null,
    }))
    .filter((h) => h.baseline !== h.current)
  report.files.push({
    file,
    baselineCases: baseCases.length,
    currentCases: currCases.length,
    baselineExpects: baseCases.reduce((s, c) => s + c.expects.length, 0),
    currentExpects: currCases.reduce((s, c) => s + c.expects.length, 0),
    baselineOutside: baseOutside,
    currentOutside: currOutside,
    localHelperDelta: helperDelta,
    identicalCountCases: matched.filter((r) => r.baselineExpects === r.currentExpects).length,
    differingCountCases: matched
      .filter((r) => r.baselineExpects !== r.currentExpects)
      .map((r) => ({ index: r.index, title: r.title, baselineExpects: r.baselineExpects, currentExpects: r.currentExpects })),
    missingCaseTitles: rows.filter((r) => !r.present).map((r) => r.title),
    textChangedExpects: textChanges.length,
    textChangeKinds: textChanges.reduce((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1
      return acc
    }, {}),
    rows,
    textChanges,
  })
}

if (AS_JSON) {
  fs.writeSync(1, `${JSON.stringify(report, null, 2)}\n`)
  process.exit(0)
}

const esc = (s) => String(s).replace(/\|/g, '\\|')
console.log(`# Assertion map: ${BASELINE} -> ${CURRENT}\n`)
console.log(`harness exports (${helpers.length}): ${helpers.join(', ')}\n`)
for (const f of report.files) {
  console.log(`## ${f.file}\n`)
  console.log(`- cases: ${f.baselineCases} -> ${f.currentCases}`)
  console.log(`- expects inside case blocks: ${f.baselineExpects} -> ${f.currentExpects}`)
  console.log(`- expects outside case blocks (file-local helpers): ${f.baselineOutside.length} -> ${f.currentOutside.length}`)
  console.log(`- identical-count cases: ${f.identicalCountCases}/${f.rows.length}`)
  console.log(`- differing-count cases: ${f.differingCountCases.length}`)
  console.log(`- expect texts changed: ${f.textChangedExpects}`)
  console.log(`- change kinds: ${Object.entries(f.textChangeKinds).map(([k, v]) => `${k} ${v}`).join(', ')}\n`)
  console.log('| # | 用例标题 | 基线 expect | 现 expect | 判定 |')
  console.log('| --- | --- | --- | --- | --- |')
  for (const r of f.rows) {
    const verdict = !r.present
      ? '缺失'
      : r.baselineExpects === r.currentExpects
        ? '一致'
        : `变化 ${r.baselineExpects} -> ${r.currentExpects}`
    console.log(`| ${r.index} | ${esc(r.title)}${r.modifier ? ` (${r.modifier})` : ''} | ${r.baselineExpects} | ${r.present ? r.currentExpects : '-'} | ${verdict} |`)
  }
  console.log('')
  if (f.differingCountCases.length) {
    console.log('### 条数变化用例\n')
    for (const d of f.differingCountCases) console.log(`- #${d.index} ${d.title}: ${d.baselineExpects} -> ${d.currentExpects}`)
    console.log('')
  }
  console.log('### 用例块之外的 expect（文件内 helper 函数）\n')
  const max = Math.max(f.baselineOutside.length, f.currentOutside.length)
  for (let i = 0; i < max; i += 1) {
    const b = f.baselineOutside[i]
    const c = f.currentOutside[i]
    console.log(`- outside #${i + 1}`)
    console.log(`  - 基线 ${b ? b.owner : '-'} L${b ? b.line : '-'}: ${b ? `\`${b.text.replace(/`/g, '\\`')}\`` : '(none)'}`)
    console.log(`  - 现   ${c ? c.owner : '-'} L${c ? c.line : '-'}: ${c ? `\`${c.text.replace(/`/g, '\\`')}\`` : '(none)'}`)
    console.log(`  - 判定: ${b && c && b.text === c.text ? '文本一致' : '变化'}`)
  }
  console.log('')
  console.log('### 文件内 helper 的 expect 条数（按函数名聚合）\n')
  if (!f.localHelperDelta.length) {
    console.log('- 无 helper 级条数变化\n')
  } else {
    console.log('| helper | 基线 | 现 | 基线行 | 现行 |')
    console.log('| --- | --- | --- | --- | --- |')
    for (const h of f.localHelperDelta) {
      console.log(`| ${h.name} | ${h.baseline ?? '—'} | ${h.current ?? '—'} | ${h.baselineLine ?? '—'} | ${h.currentLine ?? '—'} |`)
    }
    console.log('')
  }
  console.log('### expect 文本变化\n')
  for (const c of f.textChanges) {
    console.log(`- ${c.case} #${c.position}`)
    console.log(`  - 原: \`${c.before.replace(/`/g, '\\`')}\``)
    console.log(`  - 现: \`${c.after.replace(/`/g, '\\`')}\``)
    console.log(`  - kind: ${c.kind}`)
    console.log(`  - helper: ${c.helpers.length ? c.helpers.join(', ') : '—'}`)
  }
  console.log('')
}
