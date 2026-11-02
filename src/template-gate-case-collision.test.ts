/**
 * Template placement gate: case-only collisions are real collisions.
 *
 * Pure functions and constructed trees only — nothing here reads the host file
 * system or probes its case sensitivity, so the gate is fast and gives the same
 * result on a case-sensitive and a case-insensitive platform. The exact-vs-fold
 * rules the gate pins: exact spelling first; a unique case-only candidate is a
 * match / conflict / placed by its hash; several case variants are ambiguous and
 * never placed.
 */
import { describe, expect, it } from 'vitest'
import type { ScannedNode, ScannedTree } from '@core/directory/compare'
import { sha256Hex } from '@core/directory/hash'
import {
  createTemplatePlan,
  matchTemplate,
  matchTemplateSlots,
  resolveTemplatePlan,
  verifyTemplateExtraction
} from '@core/directory/template'
import type {
  TemplateConflict,
  TemplateConflictCandidate,
  TemplateMatch,
  TemplateMatchResult
} from '@core/directory/template'

interface PlannedFile {
  readonly relativePath: string
  readonly text: string
  readonly modifiedMs?: number
}

function scannedTree(
  root: string,
  files: readonly PlannedFile[]
): { readonly tree: ScannedTree; readonly bodies: Map<string, string> } {
  const index = new Map<string, ScannedNode>()
  const children: ScannedNode[] = []
  const bodies = new Map<string, string>()

  for (const file of files) {
    const path = `${root}/${file.relativePath}`
    const name = file.relativePath.slice(file.relativePath.lastIndexOf('/') + 1)
    const node: ScannedNode = {
      name,
      path,
      kind: 'file',
      size: file.text.length,
      modifiedMs: file.modifiedMs ?? 0,
      children: []
    }
    index.set(file.relativePath, node)
    children.push(node)
    bodies.set(path, file.text)
  }

  const rootNode: ScannedNode = {
    name: root.slice(root.lastIndexOf('/') + 1),
    path: root,
    kind: 'directory',
    size: 0,
    modifiedMs: 0,
    children
  }
  return { tree: { root: rootNode, index, skipped: 0 }, bodies }
}

function reader(bodies: ReadonlyMap<string, string>): (path: string) => Promise<string> {
  return async (path) => {
    const body = bodies.get(path)
    if (body === undefined) throw new Error(`no body for ${path}`)
    return body
  }
}

async function matchCaseSlot(
  slotFiles: readonly PlannedFile[],
  incomingFiles: readonly PlannedFile[]
): Promise<TemplateMatchResult> {
  const template = scannedTree('/template', slotFiles)
  const incoming = scannedTree('/incoming', incomingFiles)
  const bodies = new Map([...template.bodies, ...incoming.bodies])
  return matchTemplate(template.tree, incoming.tree, { readTextFile: reader(bodies) })
}

function matched(relativePath: string, body: string): TemplateMatch {
  return {
    relativePath,
    templatePath: `/template/${relativePath}`,
    sourcePath: `/incoming/source/${relativePath}`,
    sourceRelativePath: `source/${relativePath}`,
    size: body.length,
    hash: sha256Hex(body),
    modifiedMs: 1_600_000_000_000,
    text: body
  }
}

function candidate(relativePath: string, body: string): TemplateConflictCandidate {
  return {
    path: `/incoming/source/${relativePath}`,
    sourceRelativePath: `source/${relativePath}`,
    size: body.length,
    hash: sha256Hex(body),
    modifiedMs: 1_600_000_000_000
  }
}

function resultOf(parts: {
  readonly matched?: readonly TemplateMatch[]
  readonly conflicts?: readonly TemplateConflict[]
  readonly missing?: TemplateMatchResult['missing']
  readonly unused?: TemplateMatchResult['unused']
}): TemplateMatchResult {
  return {
    templateRoot: '/template',
    incomingRoot: '/incoming',
    matched: parts.matched ?? [],
    conflicts: parts.conflicts ?? [],
    missing: parts.missing ?? [],
    unused: parts.unused ?? [],
    templateFileCount:
      (parts.matched ?? []).length +
      (parts.conflicts ?? []).length +
      (parts.missing ?? []).length
  }
}

describe('template gate: case-only collision', () => {
  it('matches a case-only B file with the same hash and consumes it', async () => {
    const result = await matchCaseSlot(
      [{ relativePath: 'Logo.png', text: 'NEW' }],
      [{ relativePath: 'bucket/logo.png', text: 'NEW' }]
    )

    expect(result.matched.map((item) => item.relativePath)).toEqual(['Logo.png'])
    expect(result.matched[0]?.sourcePath).toBe('/incoming/bucket/logo.png')
    expect(result.conflicts).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unused).toEqual([])
  })

  it('reports a case-only B file with a different hash as content-mismatch', async () => {
    const result = await matchCaseSlot(
      [{ relativePath: 'Logo.png', text: 'NEW' }],
      [{ relativePath: 'bucket/logo.png', text: 'OTHER' }]
    )

    expect(result.matched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unused).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      relativePath: 'Logo.png',
      reason: 'content-mismatch'
    })
    expect(result.conflicts[0]?.candidates).toHaveLength(1)
  })

  it('never lets a case variant outrank the exact spelling', async () => {
    const result = await matchCaseSlot(
      [{ relativePath: 'Logo.png', text: 'NEW' }],
      [
        { relativePath: 'Logo.png', text: 'OTHER' },
        { relativePath: 'bucket/logo.png', text: 'NEW' }
      ]
    )

    expect(result.matched).toEqual([])
    expect(result.conflicts[0]?.reason).toBe('content-mismatch')
    expect(result.conflicts[0]?.candidates.map((item) => item.path)).toEqual([
      '/incoming/Logo.png'
    ])
    expect(result.unused.map((item) => item.relativePath).sort()).toEqual([
      'Logo.png',
      'bucket/logo.png'
    ])
  })

  it('reports several case-only variants as ambiguous', async () => {
    const result = await matchCaseSlot(
      [{ relativePath: 'Logo.png', text: 'NEW' }],
      [
        { relativePath: 'a/logo.png', text: 'NEW' },
        { relativePath: 'b/LOGO.PNG', text: 'NEW' }
      ]
    )

    expect(result.matched).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.unused).toEqual([])
    expect(result.conflicts[0]?.reason).toBe('ambiguous')
    expect(result.conflicts[0]?.candidates).toHaveLength(2)
  })

  it('overwrites a case-only target with different content, unchecked by default', () => {
    const plan = createTemplatePlan(resultOf({ matched: [matched('Logo.png', 'NEW')] }), {
      outputRoot: '/out',
      existingFiles: ['logo.png'],
      existingFileHashes: { 'logo.png': sha256Hex('OLD') }
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('matched')
    expect(row?.overwrite).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
    expect(resolveTemplatePlan(plan, {}).executableCount).toBe(0)
  })

  it('places a case-only target that already holds the source body', () => {
    const plan = createTemplatePlan(resultOf({ matched: [matched('Logo.png', 'NEW')] }), {
      outputRoot: '/out',
      existingFiles: ['logo.png'],
      existingFileHashes: { 'logo.png': sha256Hex('NEW') }
    })

    const row = plan.placed.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('placed')
    expect(row?.overwrite).toBe(false)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.matched).toEqual([])
    expect(resolveTemplatePlan(plan, { checkedPaths: ['Logo.png'] }).executableCount).toBe(0)
  })

  it('keeps the exact spelling ahead of a matching case variant', () => {
    const plan = createTemplatePlan(resultOf({ matched: [matched('Logo.png', 'NEW')] }), {
      outputRoot: '/out',
      existingFiles: ['Logo.png', 'logo.png'],
      existingFileHashes: {
        'Logo.png': sha256Hex('OLD'),
        'logo.png': sha256Hex('NEW')
      }
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('matched')
    expect(row?.overwrite).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
  })

  it('never places when several case variants hold the target', () => {
    const ambiguous: TemplateConflict = {
      relativePath: 'Logo.png',
      templatePath: '/template/Logo.png',
      reason: 'ambiguous',
      candidates: [candidate('a/logo.png', 'NEW'), candidate('b/LOGO.PNG', 'NEW')]
    }
    const plan = createTemplatePlan(resultOf({ conflicts: [ambiguous] }), {
      outputRoot: '/out',
      existingFiles: ['logo.png', 'LOGO.PNG'],
      existingFileHashes: {
        'logo.png': sha256Hex('NEW'),
        'LOGO.PNG': sha256Hex('NEW')
      }
    })

    const row = plan.conflicts.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.outcome).toBe('conflict')
    expect(row?.overwrite).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(plan.placed).toEqual([])
  })

  it('treats a case-only directory as an occupied target', () => {
    const plan = createTemplatePlan(resultOf({ matched: [matched('Logo.png', 'NEW')] }), {
      outputRoot: '/out',
      existingDirectories: ['logo.png']
    })

    const row = plan.matched.find((entry) => entry.relativePath === 'Logo.png')
    expect(row?.occupiedByDirectory).toBe(true)
    expect(row?.defaultChecked).toBe(false)
    expect(resolveTemplatePlan(plan, { checkedPaths: ['Logo.png'] }).rejected).toEqual([
      { relativePath: 'Logo.png', reason: 'target-occupied-by-directory' }
    ])
  })

  it('verifies a case-only output entry instead of reporting it missing', async () => {
    const output = scannedTree('/out', [
      { relativePath: 'logo.png', text: 'NEW', modifiedMs: 1_600_000_000_800 }
    ])
    const written = [
      {
        relativePath: 'Logo.png',
        sourcePath: '/incoming/bucket/logo.png',
        targetPath: '/out/Logo.png',
        sourceHash: sha256Hex('NEW'),
        modifiedMs: 1_600_000_000_100,
        action: 'copy' as const
      }
    ]

    const verification = await verifyTemplateExtraction(written, {
      readTextFile: reader(output.bodies),
      listDirectory: async (path) => {
        if (path === '/incoming/bucket') {
          return [
            {
              name: 'logo.png',
              path: '/incoming/bucket/logo.png',
              isDirectory: false,
              size: 3,
              modifiedMs: 1_600_000_000_100
            }
          ]
        }
        if (path !== '/out') throw new Error(`no directory ${path}`)
        return [...output.tree.index.values()].map((node) => ({
          name: node.name,
          path: node.path,
          isDirectory: false,
          size: node.size,
          modifiedMs: node.modifiedMs
        }))
      }
    })
    expect(verification.verified).toBe(1)
    expect(verification.failed).toBe(0)
    expect(verification.entries[0]?.reason).toBeUndefined()
  })

  it('still reports a case-only target whose hash differs as a hash failure', async () => {
    const output = scannedTree('/out', [
      { relativePath: 'logo.png', text: 'OTHER', modifiedMs: 1_600_000_000_800 }
    ])
    const verification = await verifyTemplateExtraction(
      [
        {
          relativePath: 'Logo.png',
          sourcePath: '/incoming/bucket/logo.png',
          targetPath: '/out/Logo.png',
          sourceHash: sha256Hex('NEW'),
          modifiedMs: 1_600_000_000_100,
          action: 'copy' as const
        }
      ],
      {
        readTextFile: reader(output.bodies),
        listDirectory: async (path) =>
          path === '/incoming/bucket'
            ? [
                {
                  name: 'logo.png',
                  path: '/incoming/bucket/logo.png',
                  isDirectory: false,
                  size: 3,
                  modifiedMs: 1_600_000_000_100
                }
              ]
            : [
                {
                  name: 'logo.png',
                  path: '/out/logo.png',
                  isDirectory: false,
                  size: 'OTHER'.length,
                  modifiedMs: 1_600_000_000_800
                }
              ]
      }
    )

    expect(verification.entries[0]).toMatchObject({ ok: false, reason: 'hash' })
  })

  it('matches case-only restored slots after extraction', async () => {
    const template = scannedTree('/template', [{ relativePath: 'Logo.png', text: 'NEW' }])
    const output = scannedTree('/out', [{ relativePath: 'logo.png', text: 'NEW' }])

    const result = await matchTemplateSlots(
      template.tree,
      output.tree,
      ['Logo.png'],
      { readTextFile: reader(new Map([...template.bodies, ...output.bodies])) }
    )
    expect(result.matched.map((item) => item.relativePath)).toEqual(['Logo.png'])
    expect(result.matched[0]?.sourcePath).toBe('/out/logo.png')
    expect(result.missing).toEqual([])
    expect(result.conflicts).toEqual([])
  })
})
