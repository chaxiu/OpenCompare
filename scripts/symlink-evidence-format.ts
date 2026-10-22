/**
 * Serialization contract for the manual symlink footer harness
 * (`scripts/measure-symlink-footer.evidence.test.ts`).
 *
 * The `OPENCOMPARE_EVIDENCE_OUT` file must be a plain JSON document so tools can
 * `JSON.parse` it directly; the `OPENCOMPARE_SYMLINK_EVIDENCE` marker stays on
 * stdout only. The two shapes are derived from the same report so they cannot
 * drift apart.
 */
export const SYMLINK_EVIDENCE_MARKER = 'OPENCOMPARE_SYMLINK_EVIDENCE'

export interface SymlinkEvidenceRecord {
  json: string
  handoff: string
}

export function formatSymlinkEvidence(report: unknown): SymlinkEvidenceRecord {
  const payload = JSON.stringify(report)
  return {
    json: `${payload}\n`,
    handoff: `${SYMLINK_EVIDENCE_MARKER} ${payload}\n`
  }
}
