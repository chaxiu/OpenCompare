/**
 * Template placement gate: per-row action column and explicit move selection.
 *
 * Pure strings and constructed plan data only — no Electron, no temp dirs. One
 * source of truth (`resolveTemplatePlan`) decides the action of every row, the
 * executable set and the counts; the dry-run must never re-derive them.
 */
import { describe, expect, it } from 'vitest'
import { createTemplatePlan, resolveTemplatePlan } from '@core/directory/template'
import type {
  TemplateAction,
  TemplateConflict,
  TemplateMatch,
  TemplateMatchResult,
  TemplatePlan,
  TemplateSelection
} from '@core/directory/template'

const MTIME = 1_700_000_000_000

function matched(relativePath: string, sourceRelativePath: string, body: string): TemplateMatch {
  return {
    relativePath,
    templatePath: `/template/${relativePath}`,
    sourcePath: `/incoming/${sourceRelativePath}`,
    sourceRelativePath,
    size: body.length,
    hash: `h-${body}`,
    modifiedMs: MTIME,
    text: body
  }
}

function conflict(relativePath: string, sources: readonly string[]): TemplateConflict {
  return {
    relativePath,
    templatePath: `/template/${relativePath}`,
    reason: 'ambiguous',
    candidates: sources.map((sourceRelativePath) => ({
      path: `/incoming/${sourceRelativePath}`,
      sourceRelativePath,
      size: sourceRelativePath.length,
      hash: `h-${sourceRelativePath}`,
      modifiedMs: MTIME
    }))
  }
}

function planFixture(): TemplatePlan {
  const result: TemplateMatchResult = {
    templateRoot: '/template',
    incomingRoot: '/incoming',
    matched: [
      matched('docs/ok.txt', 'bucket/ok.txt', 'ok'),
      matched('docs/deep.txt', 'nested/deep.txt', 'deep'),
      matched('docs/over.txt', 'bucket/over.txt', 'over'),
      matched('docs/placed.txt', 'bucket/placed.txt', 'placed'),
      matched('docs/occupied.txt', 'bucket/occupied.txt', 'occupied'),
      matched('../escape.txt', 'bucket/escape.txt', 'escape')
    ],
    missing: [
      {
        relativePath: 'docs/missing.txt',
        templatePath: '/template/docs/missing.txt',
        size: 1,
        hash: 'h-never'
      }
    ],
    conflicts: [conflict('docs/twin.txt', ['one/twin.txt', 'two/twin.txt'])],
    unused: [],
    templateFileCount: 8
  }
  return createTemplatePlan(result, {
    outputRoot: '/out',
    existingFiles: ['docs/over.txt', 'docs/placed.txt', 'docs/OVER.txt'],
    existingDirectories: ['docs/occupied.txt'],
    existingFileHashes: {
      'docs/over.txt': 'h-old',
      'docs/placed.txt': 'h-placed'
    }
  })
}

function defaultsOf(plan: TemplatePlan): string[] {
  return [...plan.matched, ...plan.missing, ...plan.conflicts]
    .filter((entry) => entry.defaultChecked)
    .map((entry) => entry.relativePath)
}

function actionsOf(selection: TemplateSelection): {
  readonly resolved: ReturnType<typeof resolveTemplatePlan>
  readonly values: readonly TemplateAction[]
} {
  const resolved = resolveTemplatePlan(planFixture(), selection)
  return { resolved, values: Object.values(resolved.actions) }
}

describe('template move-actions gate', () => {
  it('uses only copy / move, defaults every source row to copy and gives no action to a source-less row', () => {
    const plan = planFixture()
    for (const entry of plan.matched) {
      expect(entry.defaultAction, `template move-actions: ${entry.relativePath} default`).toBe('copy')
    }
    for (const entry of [...plan.missing, ...plan.conflicts]) {
      expect(entry.defaultAction, `template move-actions: ${entry.relativePath} has no action`).toBe(
        undefined
      )
    }
    expect(plan.placed.every((entry) => entry.defaultAction === undefined)).toBe(true)

    const { resolved, values } = actionsOf({})
    for (const value of values) {
      expect(['copy', 'move'], `template move-actions: action value ${value}`).toContain(value)
    }
    expect(new Set(values), 'template move-actions: no third action').toEqual(new Set(['copy']))
    expect(resolved.actions['docs/missing.txt'], 'template move-actions: missing has no action').toBe(
      undefined
    )
    expect(
      resolved.actions['docs/twin.txt'],
      'template move-actions: unresolved conflict has no action'
    ).toBe(undefined)
    expect(resolved.actions['docs/placed.txt'], 'template move-actions: placed has no action').toBe(
      undefined
    )
    expect(resolved.moveCount, 'template move-actions: no move by default').toBe(0)
    expect(resolved.copyCount, 'template move-actions: all executable copy').toBe(
      resolved.executableCount
    )
    expect(
      resolved.executable.every((entry) => entry.action === 'copy'),
      'template move-actions: default executable actions are copy'
    ).toBe(true)
  })

  it('applies movePaths only to checked executable rows and leaves unchecked rows on copy', () => {
    const defaults = defaultsOf(planFixture())
    const { resolved } = actionsOf({
      checkedPaths: [...defaults, '../escape.txt'],
      movePaths: [
        ...defaults,
        'docs/over.txt',
        'docs/missing.txt',
        'docs/placed.txt',
        '../escape.txt'
      ]
    })

    for (const entry of resolved.executable) {
      expect(entry.action, `template move-actions: ${entry.relativePath} explicit move`).toBe('move')
    }
    expect(resolved.moveCount, 'template move-actions: moved rows').toBe(resolved.executableCount)
    expect(resolved.copyCount, 'template move-actions: copied rows').toBe(0)
    expect(resolved.actions['docs/over.txt'], 'template move-actions: unchecked hazard stays copy').toBe(
      'copy'
    )
    expect(
      resolved.executable.map((entry) => entry.relativePath),
      'template move-actions: hazards never execute'
    ).not.toContain('docs/over.txt')
    expect(resolved.executable.map((entry) => entry.relativePath)).not.toContain('docs/missing.txt')
    expect(resolved.executable.map((entry) => entry.relativePath)).not.toContain('docs/placed.txt')
    expect(resolved.executable.map((entry) => entry.relativePath)).not.toContain('../escape.txt')
    expect(resolved.rejected, 'template move-actions: escaping move is refused').toContainEqual({
      relativePath: '../escape.txt',
      reason: 'path-escape'
    })
  })

  it('keeps conflict, path-escape, name collision and directory-occupied rows default-unchecked', () => {
    const plan = planFixture()
    const byPath = new Map(
      [...plan.matched, ...plan.missing, ...plan.conflicts].map((entry) => [entry.relativePath, entry])
    )
    for (const relativePath of [
      'docs/twin.txt',
      'docs/over.txt',
      'docs/occupied.txt',
      'docs/missing.txt',
      '../escape.txt'
    ]) {
      expect(
        byPath.get(relativePath)?.defaultChecked,
        `template move-actions: ${relativePath} default-unchecked`
      ).toBe(false)
    }
    // The case-only collision (`docs/OVER.txt` vs `docs/over.txt`) is an explicit
    // overwrite, not a silent default.
    expect(byPath.get('docs/over.txt')?.overwrite).toBe(true)
    expect(
      new Set(defaultsOf(plan)),
      'template move-actions: only clean rows start checked'
    ).toEqual(new Set(['docs/deep.txt', 'docs/ok.txt']))
  })

  it('requires a candidate and a check for a conflict, and still starts it on copy', () => {
    const defaults = defaultsOf(planFixture())

    const unresolved = actionsOf({ checkedPaths: [...defaults, 'docs/twin.txt'] }).resolved
    expect(unresolved.executable.map((entry) => entry.relativePath)).not.toContain('docs/twin.txt')
    expect(unresolved.rejected).toContainEqual({
      relativePath: 'docs/twin.txt',
      reason: 'conflict-unresolved'
    })

    // Choosing the candidate alone never checks the row.
    const chosenOnly = actionsOf({
      checkedPaths: defaults,
      conflictChoices: { 'docs/twin.txt': '/incoming/one/twin.txt' }
    }).resolved
    expect(chosenOnly.actions['docs/twin.txt'], 'template move-actions: chosen but unchecked').toBe(
      'copy'
    )
    expect(chosenOnly.executable.map((entry) => entry.relativePath)).not.toContain('docs/twin.txt')

    const checked = actionsOf({
      checkedPaths: [...defaults, 'docs/twin.txt'],
      conflictChoices: { 'docs/twin.txt': '/incoming/one/twin.txt' }
    }).resolved
    expect(
      checked.executable.find((entry) => entry.relativePath === 'docs/twin.txt')?.action,
      'template move-actions: checked conflict defaults to copy'
    ).toBe('copy')

    const moved = actionsOf({
      checkedPaths: [...defaults, 'docs/twin.txt'],
      movePaths: ['docs/twin.txt'],
      conflictChoices: { 'docs/twin.txt': '/incoming/one/twin.txt' }
    }).resolved
    expect(
      moved.executable.find((entry) => entry.relativePath === 'docs/twin.txt')?.action,
      'template move-actions: conflict move is explicit'
    ).toBe('move')
    expect(moved.moveCount).toBe(1)
  })

  it('gives the batch and the per-row choice the same movePaths contract', () => {
    const defaults = defaultsOf(planFixture())
    const batch = actionsOf({ checkedPaths: defaults, movePaths: defaults }).resolved
    const perRow = actionsOf({ checkedPaths: defaults, movePaths: [...defaults] }).resolved
    expect(perRow.executable).toEqual(batch.executable)
    expect(perRow.moveCount).toBe(batch.moveCount)
    expect(batch.executable.every((entry) => entry.action === 'move')).toBe(true)

    // A batch never checks anything: the hazard rows stay out of the executable set.
    expect(batch.executable.map((entry) => entry.relativePath).sort()).toEqual([...defaults].sort())
    expect(batch.rejectedCount, 'template move-actions: batch adds no refusals').toBe(0)
  })

  it('keeps copyCount + moveCount equal to executableCount for every selection', () => {
    const cases: readonly TemplateSelection[] = [
      {},
      { checkedPaths: defaultsOf(planFixture()) },
      { checkedPaths: [...defaultsOf(planFixture()), 'docs/twin.txt'], movePaths: ['docs/twin.txt'], conflictChoices: { 'docs/twin.txt': '/incoming/two/twin.txt' } },
      { checkedPaths: ['docs/over.txt', 'docs/occupied.txt', '../escape.txt'], movePaths: ['docs/over.txt'] }
    ]
    for (const selection of cases) {
      const resolved = resolveTemplatePlan(planFixture(), selection)
      expect(resolved.copyCount + resolved.moveCount).toBe(resolved.executableCount)
      for (const entry of resolved.executable) {
        expect(resolved.actions[entry.relativePath]).toBe(entry.action)
      }
    }
  })
})
