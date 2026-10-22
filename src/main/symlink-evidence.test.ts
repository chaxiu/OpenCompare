import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SYMLINK_EVIDENCE_MARKER,
  formatSymlinkEvidence
} from '../../scripts/symlink-evidence-format'

// Read-only assertions over the symlink footer evidence: the two committed JSON
// reports must stay parseable (they are the harness's own
// `OPENCOMPARE_EVIDENCE_OUT` output), and every `docs/...` path referenced by
// docs/symlink-no-follow.md must resolve on disk.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const symlinkDocPath = join(repoRoot, 'docs/symlink-no-follow.md')

const evidencePaths = [
  join(repoRoot, 'docs/evidence/symlink-footer-old.json'),
  join(repoRoot, 'docs/evidence/symlink-footer-new.json')
]

interface FooterReport {
  fileCount: number
  counts: { same: number; added: number; removed: number; modified: number }
}

const readReport = (path: string): FooterReport => JSON.parse(readFileSync(path, 'utf8'))

describe('symlink footer evidence JSON', () => {
  it('parses to the measured footer numbers instead of a marker-prefixed blob', () => {
    const [oldReport, newReport] = evidencePaths.map(readReport)
    expect(oldReport.fileCount).toBe(1338294)
    expect(newReport.fileCount).toBe(752479)
    for (const report of [oldReport, newReport]) {
      const { same, added, removed, modified } = report.counts
      expect(same + added + removed + modified).toBe(report.fileCount)
    }
  })

  it('matches the harness output shape byte for byte', () => {
    for (const path of evidencePaths) {
      const raw = readFileSync(path, 'utf8')
      const report = JSON.parse(raw) as FooterReport
      expect(formatSymlinkEvidence(report).json).toBe(raw)
    }
  })

  it('writes plain JSON to OPENCOMPARE_EVIDENCE_OUT while the marker stays on stdout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-symlink-evidence-'))
    try {
      const report = { fileCount: 752479, counts: { same: 1, added: 0, removed: 0, modified: 0 } }
      const { json, handoff } = formatSymlinkEvidence(report)
      const out = join(dir, 'symlink-footer.json')
      writeFileSync(out, json, 'utf8')

      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(report)
      expect(handoff.startsWith(`${SYMLINK_EVIDENCE_MARKER} `)).toBe(true)
      expect(JSON.parse(handoff.slice(SYMLINK_EVIDENCE_MARKER.length + 1))).toEqual(report)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('docs/symlink-no-follow.md references', () => {
  it('points only at docs paths that exist on disk', () => {
    const doc = readFileSync(symlinkDocPath, 'utf8')
    const referenced = [...new Set(doc.match(/`(docs\/[^`\s]+)`/g) ?? [])].map((match) =>
      match.slice(1, -1)
    )
    expect(referenced.length).toBeGreaterThan(0)
    expect(doc).not.toContain('.raw.log')
    for (const path of referenced) {
      expect(existsSync(join(repoRoot, path)), path).toBe(true)
    }
  })
})
