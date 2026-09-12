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
 * After a local write + flushCrudUpload, keep skipping REST only when at least
 * one CRUD batch was uploaded (`true`). `false` means the queue was empty —
 * fall through to REST. `void` keeps create-path callers that ignore the return.
 */
export function shouldSkipRestAfterCrudFlush(
  uploaded: boolean | void,
): boolean {
  return uploaded !== false;
}

/** Letter PDF bytes are Mac-only; skip fetch when local-core health is not OK. */
export function shouldAttemptLetterPdfFetch(
  localCoreReachable: boolean | null,
  useApi: boolean,
): boolean {
  return useApi && localCoreReachable === true;
}
