import type { WorkspacePowerSync } from "./workspace-data-types";

/**
 * REST exceptions while PowerSync is primary — see also
 * {@link taskPatchRequiresRestWrite} in `@backsteros/contracts`
 * (`agentInboxApproved`). Desktop additionally uses REST for task scope moves
 * (server number), letter vault relocate, and empty-flush fallback.
 */
export { taskPatchRequiresRestWrite } from "@backsteros/contracts";

/** When true, entity metadata writes go through PowerSync upload only — no REST dual-write. */
export function shouldSkipRestEntityWrite(
  powerSync: Pick<WorkspacePowerSync, "connected" | "ready">,
): boolean {
  return Boolean(powerSync.ready && powerSync.connected);
}

/**
 * Cloud-client mode. Local-only REST (scope move, letter vault relocate,
 * flush-empty fallback) must not run — and must not start Docker.
 */
export function localOnlyRestFailClosed(apiUrl: string): boolean {
  try {
    const host = new URL(apiUrl).hostname.toLowerCase();
    return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
  } catch {
    return true;
  }
}

/**
 * After a local write + flushCrudUpload, keep skipping REST only when at least
 * one CRUD batch was uploaded (`true`). `false` means the queue was empty —
 * fall through to REST. `void` keeps create-path callers that ignore the return.
 */
export function shouldSkipRestAfterCrudFlush(
  uploaded: boolean | void,
): boolean {
  return uploaded !== false;
}

/** Letter PDF bytes: cloud R2 when the product API is not loopback; else local-core health. */
export function shouldAttemptLetterPdfFetch(
  localCoreReachable: boolean | null,
  useApi: boolean,
  apiUrl?: string,
): boolean {
  if (!useApi) return false;
  if (apiUrl && localOnlyRestFailClosed(apiUrl)) return true;
  return localCoreReachable === true;
}
