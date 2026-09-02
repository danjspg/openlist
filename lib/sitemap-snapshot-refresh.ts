import { readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  parseSitemapSnapshotSet,
  type SitemapSnapshotSet,
} from "@/lib/sitemap-snapshot"

export type SitemapSnapshotRefreshResult = {
  snapshot: SitemapSnapshotSet
  status: "fresh" | "stale"
  error?: unknown
}

export const DEFAULT_MAX_STALE_SNAPSHOT_AGE_MS = 72 * 60 * 60 * 1000

export function staleSnapshotIsActionable(
  snapshot: Pick<SitemapSnapshotSet, "generatedAt">,
  now = Date.now(),
  maximumAgeMs = DEFAULT_MAX_STALE_SNAPSHOT_AGE_MS
) {
  const generatedAt = Date.parse(snapshot.generatedAt)
  return !Number.isFinite(generatedAt) || now - generatedAt > maximumAgeMs
}

export async function refreshSitemapSnapshotFile(
  targetPath: string,
  loadFresh: () => Promise<unknown>
): Promise<SitemapSnapshotRefreshResult> {
  const stale = await readSnapshotIfValid(targetPath)
  const temporaryPath = join(dirname(targetPath), `.sitemap-snapshots-${process.pid}.tmp`)

  try {
    const fresh = parseSitemapSnapshotSet(await loadFresh())
    await writeFile(temporaryPath, `${JSON.stringify(fresh)}\n`, "utf8")
    await rename(temporaryPath, targetPath)
    return { snapshot: fresh, status: "fresh" }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    if (stale) return { snapshot: stale, status: "stale", error }
    throw error
  }
}

async function readSnapshotIfValid(path: string) {
  try {
    return parseSitemapSnapshotSet(JSON.parse(await readFile(path, "utf8")))
  } catch {
    return null
  }
}
