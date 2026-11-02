/**
 * Template placement gate: a slot path may never escape the output root.
 *
 * The check is one exported pure function (`templatePathIssue`) shared by the
 * plan, the resolver and the executor. This gate runs on pure strings and
 * constructed data only, so it is platform independent and fast; the real
 * filesystem proof lives in the template real-directory e2e.
 */
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@core/directory/hash'
import {
  createTemplatePlan,
  executeTemplatePlan,
  resolveTemplatePlan,
  templatePathIssue
} from '@core/directory/template'
import type {
  TemplateExecutableEntry,
  TemplateMatch,
  TemplateMatchResult,
  TemplateResolvedPlan
} from '@core/directory/template'

function matched(relativePath: string, body: string): TemplateMatch {
  return {
    relativePath,
    templatePath: `/template/${relativePath}`,
    sourcePath: `/incoming/source-${relativePath.replace(/[^a-z0-9.]/gi, '_')}`,
    sourceRelativePath: `source-${relativePath.replace(/[^a-z0-9.]/gi, '_')}`,
    size: body.length,
    hash: sha256Hex(body),
    modifiedMs: 1_600_000_000_000,
    text: body
  }
}

function resultOf(matchedSlots: readonly TemplateMatch[]): TemplateMatchResult {
  return {
    templateRoot: '/template',
    incomingRoot: '/incoming',
    matched: matchedSlots,
    conflicts: [],
    missing: [],
    unused: [],
    templateFileCount: matchedSlots.length
  }
}

function executable(relativePath: string, targetPath: string, body: string): TemplateExecutableEntry {
  return {
    relativePath,
    sourcePath: `/incoming/source-${body}`,
    targetPath,
    sourceHash: sha256Hex(body),
    modifiedMs: 1_600_000_000_000,
    size: body.length,
    action: 'copy'
  }
}

describe('template gate: path containment', () => {
  it('refuses every escaping or absolute shape and accepts normal relative paths', () => {
    for (const path of [
      '../evil.txt',
      '/etc/passwd',
      'a/../../b',
      'a\\..\\b',
      'C:\\Windows\\x',
      '\\\\server\\share\\x',
      ''
    ]) {
      expect(templatePathIssue(path), path).toBe('path-escape')
    }

    expect(templatePathIssue('a/b.png')).toBeUndefined()
    expect(templatePathIssue('docs/规格 文档/clean.txt')).toBeUndefined()
  })

  it('never default-checks an escaping slot, even when it matched', () => {
    const plan = createTemplatePlan(
      resultOf([matched('../evil.txt', 'EVIL'), matched('a/b.png', 'OK')]),
      { outputRoot: '/out' }
    )
    const evil = plan.matched.find((entry) => entry.relativePath === '../evil.txt')
    const safe = plan.matched.find((entry) => entry.relativePath === 'a/b.png')

    expect(evil?.outcome).toBe('matched')
    expect(evil?.defaultChecked).toBe(false)
    expect(safe?.defaultChecked).toBe(true)
  })

  it('rejects a checked escaping row in the resolver and keeps the safe row executable', () => {
    const plan = createTemplatePlan(
      resultOf([matched('../evil.txt', 'EVIL'), matched('a/b.png', 'OK')]),
      { outputRoot: '/out' }
    )
    const resolved = resolveTemplatePlan(plan, {
      checkedPaths: ['../evil.txt', 'a/b.png']
    })

    expect(resolved.executable.map((entry) => entry.relativePath)).toEqual(['a/b.png'])
    expect(resolved.rejected).toEqual([{ relativePath: '../evil.txt', reason: 'path-escape' }])
  })

  it('refuses to write a crafted escaping manifest row and continues the rest', async () => {
    const plan = createTemplatePlan(resultOf([]), { outputRoot: '/out' })
    const bad = executable('../evil.txt', '/out/../evil.txt', 'EVIL')
    const good = executable('a/b.png', '/out/a/b.png', 'OK')
    const resolved: TemplateResolvedPlan = {
      plan,
      counts: plan.counts,
      executable: [bad, good],
      executableCount: 2,
      actions: { '../evil.txt': 'copy', 'a/b.png': 'copy' },
      copyCount: 2,
      moveCount: 0,
      rejected: [],
      rejectedCount: 0
    }

    const writes: string[] = []
    const directories: string[] = []
    const execution = await executeTemplatePlan(resolved, {
      readTextFile: async (path) => {
        if (path === bad.sourcePath) return 'EVIL'
        if (path === good.sourcePath) return 'OK'
        throw new Error(`unexpected read ${path}`)
      },
      writeTextFile: async (path) => {
        writes.push(path)
      },
      ensureDirectory: async (path) => {
        directories.push(path)
      },
      listDirectory: async () => [],
      deleteFile: async () => undefined
    })

    expect(execution.written.map((entry) => entry.relativePath)).toEqual(['a/b.png'])
    expect(execution.failed).toEqual([
      {
        relativePath: '../evil.txt',
        sourcePath: bad.sourcePath,
        targetPath: bad.targetPath,
        reason: 'path-escape'
      }
    ])
    expect(writes).toEqual(['/out/a/b.png'])
    expect(directories).toEqual(['/out/a'])
  })
})
