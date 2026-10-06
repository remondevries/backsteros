import {
  checksumForContent,
  documentContentEtag,
} from "../lib/storage.js";

export type BackfillStampDecision =
  | { kind: "match"; contentEtag: string }
  | { kind: "yamlRepair"; contentEtag: string }
  | { kind: "etagDrift"; contentEtag: string }
  | { kind: "nullEtag"; contentEtag: string };

/**
 * Stamp the document etag onto the index only when vault bytes hash to it.
 * Older API-created rows (YAML rewrite) have a matching checksum but a stale
 * etag — repair the document row. Other mismatches keep the document etag and
 * stamp the bytes' hash so retrieve will not treat the corpus as fresh.
 * Null document etags stamp the bytes' hash on the index only (no refetch loop).
 */
export function decideBackfillStamp(input: {
  rowContentEtag: string | null | undefined;
  rowChecksum: string | null | undefined;
  body: string;
}): BackfillStampDecision {
  const bodyEtag = documentContentEtag(input.body);
  const rowEtag = input.rowContentEtag?.trim() || null;
  if (!rowEtag) {
    return { kind: "nullEtag", contentEtag: bodyEtag };
  }
  if (rowEtag === bodyEtag) {
    return { kind: "match", contentEtag: rowEtag };
  }
  if (input.rowChecksum && input.rowChecksum === checksumForContent(input.body)) {
    return { kind: "yamlRepair", contentEtag: bodyEtag };
  }
  return { kind: "etagDrift", contentEtag: bodyEtag };
}
