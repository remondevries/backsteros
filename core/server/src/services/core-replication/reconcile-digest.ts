/**
 * Pure helpers for reconcile fingerprints and content-drift planning.
 *
 * The original fingerprint hashed only (row key, updated_at). Two rows can
 * share an updated_at yet differ in content — notably entity_counters, where a
 * timestamp tie used to keep whichever next_value arrived first. A per-row
 * digest adds the content columns that matter so reconcile can see (and heal)
 * that drift instead of reporting "0 missing" forever.
 */

/**
 * Extra columns folded into each row digest, per table. Keep this list small:
 * only columns that are replicated verbatim and can diverge at equal
 * updated_at. Tables absent here keep the legacy (key, updated_at) digest, so
 * their fingerprints stay compatible with older peers.
 */
export const DIGEST_EXTRA_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  entity_counters: ["next_value"],
};

export function digestExtraColumnsFor(table: string): readonly string[] {
  return DIGEST_EXTRA_COLUMNS[table] ?? [];
}

/** Per-row digest: normalized updated_at plus any extra content columns. */
export function buildRowDigest(
  updatedAtIso: string,
  extras: readonly (string | null | undefined)[] = [],
): string {
  if (extras.length === 0) return updatedAtIso;
  return [updatedAtIso, ...extras.map((value) => value ?? "")].join("|");
}

export type RowDigestEntry = { key: string; digest: string };

/** Text hashed per row — matches the legacy `key|updated_at\n` shape. */
export function fingerprintLine(entry: RowDigestEntry): string {
  return `${entry.key}|${entry.digest}\n`;
}

export type ReconcilePlan = {
  missingLocally: string[];
  missingOnPeer: string[];
  /** Keys on both sides whose digests differ (needs peer digests). */
  drifted: string[];
};

/**
 * Diff local vs peer row digests. `peerDigests` is null when the peer only
 * returned key lists (older build): drift cannot be determined then.
 */
export function planReconcile(
  localDigests: ReadonlyMap<string, string>,
  peerKeys: ReadonlySet<string>,
  peerDigests: ReadonlyMap<string, string> | null,
): ReconcilePlan {
  const missingLocally = [...peerKeys].filter((key) => !localDigests.has(key));
  const missingOnPeer = [...localDigests.keys()].filter(
    (key) => !peerKeys.has(key),
  );
  const drifted: string[] = [];
  if (peerDigests) {
    for (const [key, digest] of localDigests) {
      const peerDigest = peerDigests.get(key);
      if (peerDigest !== undefined && peerDigest !== digest) {
        drifted.push(key);
      }
    }
  }
  return { missingLocally, missingOnPeer, drifted };
}

/** Cap per run so one drifted giant table cannot flood the peer. */
export const MAX_DRIFT_REPAIR_PER_TABLE = 500;
