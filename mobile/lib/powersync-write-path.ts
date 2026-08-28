import type { useMobilePowerSync } from "./powersync-context";

/**
 * Sole REST dual-write exception while PowerSync is primary — see
 * {@link taskPatchRequiresRestWrite} in `@backsteros/contracts`.
 */
export { taskPatchRequiresRestWrite } from "@backsteros/contracts";

type PowerSyncWriteGate = Pick<
  ReturnType<typeof useMobilePowerSync>,
  "connected" | "ready"
>;

/** When true, entity metadata writes go through PowerSync upload only — no REST dual-write. */
export function shouldSkipRestEntityWrite(
  powerSync: PowerSyncWriteGate,
): boolean {
  return Boolean(powerSync.ready && powerSync.connected);
}

