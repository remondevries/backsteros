import type { CrmActivity } from "@backsteros/contracts";

/**
 * Overlay full REST CRM note bodies onto PowerSync rows when local `body` is
 * empty (preview-only sync) or truncated to body_preview (OS-163 review).
 * Never overwrites a longer/non-empty local body (edits stay local-first).
 */
export function mergeCrmActivityBodiesFromRest(
  local: readonly CrmActivity[],
  rest: readonly CrmActivity[] | null | undefined,
): CrmActivity[] {
  if (!rest?.length) return [...local];
  const restById = new Map(rest.map((row) => [row.id, row]));
  return local.map((row) => {
    const api = restById.get(row.id);
    if (!api) return row;
    const localBody = typeof row.body === "string" ? row.body.trim() : "";
    const apiBody = typeof api.body === "string" ? api.body.trim() : "";
    if (!apiBody) return row;
    if (!localBody) {
      return { ...row, body: api.body, bodyPreview: api.bodyPreview ?? row.bodyPreview };
    }
    // Local equals truncated preview — prefer full REST body.
    const preview =
      typeof row.bodyPreview === "string" ? row.bodyPreview.trim() : "";
    if (
      preview &&
      localBody === preview &&
      apiBody.length > localBody.length
    ) {
      return { ...row, body: api.body, bodyPreview: api.bodyPreview ?? row.bodyPreview };
    }
    return row;
  });
}
