/**
 * Atomic evidence write: a partially written JSON file must never look like a
 * successful run, so the payload lands in a sibling temp file and is renamed
 * into place only after the whole document is serialized.
 */
import { mkdir, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PerfEvidence } from '@shared/perf/types'

export async function writeEvidenceAtomic(path: string, evidence: PerfEvidence): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}
