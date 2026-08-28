import type { WorkspacePowerSync } from "./workspace-data-types";

/**
 * Sole REST dual-write exception while PowerSync is primary — see
 * {@link taskPatchRequiresRestWrite} in `@backsteros/contracts`.
 */
export { taskPatchRequiresRestWrite } from "@backsteros/contracts";

/** When true, entity metadata writes go through PowerSync upload only — no REST dual-write. */
export function shouldSkipRestEntityWrite(
  powerSync: Pick<WorkspacePowerSync, "connected" | "ready">,
): boolean {
  return Boolean(powerSync.ready && powerSync.connected);
}

/** Letter PDF bytes are Mac-only; skip fetch when local-core health is not OK. */
export function shouldAttemptLetterPdfFetch(
  localCoreReachable: boolean | null,
  useApi: boolean,
): boolean {
  return useApi && localCoreReachable === true;
}
