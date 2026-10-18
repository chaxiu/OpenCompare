import { describe, expect, it } from 'vitest'
import { CODE_SCENE } from '@shared/fixtures'
import {
  CONFLICT_MARKER_OURS,
  CONFLICT_MARKER_THEIRS,
  buildMergeModel,
  conflictAtLine,
  countUnresolved,
  renderMerge,
  renderMergeText,
  resolveBlock
} from './merge'

const BASE = ['head', 'shared: 1', 'mid', 'tail', ''].join('\n')
const OURS = ['head', 'ours: 1', 'mid', 'tail', ''].join('\n')
const THEIRS = ['head', 'theirs: 1', 'mid', 'tail', ''].join('\n')

describe('buildMergeModel', () => {
  it('marks a both-sides change as one conflict block with per-side ranges', () => {
    const model = buildMergeModel(BASE, OURS, THEIRS)
    expect(model.conflictIds).toHaveLength(1)

    const conflict = model.blocks.find((block) => block.kind === 'conflict')
    expect(conflict).toMatchObject({
      ours: ['ours: 1'],
      base: ['shared: 1'],
      theirs: ['theirs: 1'],
      oursRange: { start: 1, count: 1 },
      baseRange: { start: 1, count: 1 },
      theirsRange: { start: 1, count: 1 }
    })
  })

  it('auto-resolves a one-sided change and a false conflict', () => {
    const oursOnly = buildMergeModel(BASE, ['head', 'ours: 1', 'mid', 'tail', ''].join('\n'), BASE)
    expect(oursOnly.conflictIds).toHaveLength(0)
    const stable = oursOnly.blocks.find((block) => block.kind === 'stable' && block.source === 'ours')
    expect(stable?.ours).toEqual(['ours: 1'])

    const sameChange = buildMergeModel(
      BASE,
      ['head', 'both: 1', 'mid', 'tail', ''].join('\n'),
      ['head', 'both: 1', 'mid', 'tail', ''].join('\n')
    )
    expect(sameChange.conflictIds).toHaveLength(0)
  })

  it('finds the three conflict blocks of the code sample', () => {
    const model = buildMergeModel(
      CODE_SCENE.merge.base.text,
      CODE_SCENE.merge.ours.text,
      CODE_SCENE.merge.theirs.text
    )
    expect(model.conflictIds).toHaveLength(CODE_SCENE.composition.conflict)
    expect(conflictAtLine(model, 'ours', model.blocks[1].oursRange.start)?.id).toBe(
      model.conflictIds[0]
    )
  })
})

describe('renderMerge', () => {
  it('keeps markers and counts unresolved conflicts', () => {
    const model = buildMergeModel(BASE, OURS, THEIRS)
    const render = renderMerge(model, {})

    expect(render.unresolved).toBe(1)
    expect(render.lines.map((line) => line.text)).toContain(CONFLICT_MARKER_OURS)
    expect(render.lines.map((line) => line.text)).toContain(CONFLICT_MARKER_THEIRS)
    expect(render.lines.some((line) => line.conflict)).toBe(true)
  })

  it('rebuilds each input exactly when every conflict takes that side', () => {
    const model = buildMergeModel(BASE, OURS, THEIRS)
    const id = model.conflictIds[0]

    expect(renderMergeText(renderMerge(model, { [id]: 'ours' }))).toBe(OURS)
    expect(renderMergeText(renderMerge(model, { [id]: 'theirs' }))).toBe(THEIRS)
    expect(renderMergeText(renderMerge(model, { [id]: 'base' }))).toBe(BASE)
    expect(renderMerge(model, { [id]: 'ours' }).unresolved).toBe(0)
  })

  it('concatenates both sides for an Accept Both resolution', () => {
    const model = buildMergeModel(BASE, OURS, THEIRS)
    const block = model.blocks.find((entry) => entry.kind === 'conflict')
    expect(block && resolveBlock(block, 'both')).toEqual(['ours: 1', 'theirs: 1'])

    const render = renderMerge(model, { [model.conflictIds[0]]: 'both' })
    expect(renderMergeText(render)).toBe(
      ['head', 'ours: 1', 'theirs: 1', 'mid', 'tail', ''].join('\n')
    )
  })

  it('counts the remaining conflicts as they are resolved', () => {
    const model = buildMergeModel(BASE, OURS, THEIRS)
    expect(countUnresolved(model, {})).toBe(1)
    expect(countUnresolved(model, { [model.conflictIds[0]]: 'ours' })).toBe(0)
  })
})
