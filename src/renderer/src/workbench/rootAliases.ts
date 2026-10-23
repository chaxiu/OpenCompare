/**
 * Registers the real form of a comparison's directory roots on its digest
 * cache, so the same tree reached through a symlinked root reuses the digests.
 *
 * Only the cache key space is canonicalised: session ids, titles, display paths
 * and evidence roots keep the user's input, so an alias root still opens its
 * own tab. A root that cannot be resolved is simply left unregistered, which
 * keeps the comparison behaving exactly as before.
 */
import type { PlatformPort } from '@shared/platform/types'
import type { ComparisonCache } from '@core/directory/compare'

export async function aliasSideRoots(
  platform: PlatformPort,
  cache: ComparisonCache,
  roots: readonly string[]
): Promise<void> {
  if (roots.length === 0) return
  let canonical: readonly string[]
  try {
    canonical = await platform.realpath(roots)
  } catch {
    return
  }
  roots.forEach((root, index) => {
    const resolved = canonical[index]
    if (resolved === undefined || resolved === root) return
    cache.aliasRoot(root, resolved)
  })
}
