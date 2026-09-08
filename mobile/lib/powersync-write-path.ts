/**
 * Sole REST dual-write exception while PowerSync is primary — see
 * {@link taskPatchRequiresRestWrite} in `@backsteros/contracts`.
 */
export { taskPatchRequiresRestWrite } from "@backsteros/contracts";

/** Loose gate so mutation helpers can pass narrower PowerSync stubs. */
type PowerSyncWriteGate = {
  ready: boolean;
  connected?: boolean;
  preferRestWrites?: boolean;
};

/** Prefer REST when PowerSync is down or REST is targeting cloud-core. */
export function shouldWriteEntityViaPowerSync(
  powerSync: PowerSyncWriteGate,
): boolean {
  if (powerSync.preferRestWrites) return false;
  return Boolean(powerSync.ready);
}

/** When true, entity metadata writes go through PowerSync upload only — no REST dual-write. */
export function shouldSkipRestEntityWrite(
  powerSync: PowerSyncWriteGate,
): boolean {
  if (powerSync.preferRestWrites) return false;
  return Boolean(powerSync.ready && powerSync.connected);
}

/**
 * After a local write + {@link flushCrudUpload}, keep skipping REST only when
 * at least one CRUD batch was uploaded (`true`). `false` means the queue was
 * empty (UPDATE no-op or already drained) — fall through to REST.
 * `void`/`undefined` keeps prior create-path callers that ignore the return.
 */
export function shouldSkipRestAfterCrudFlush(
  uploaded: boolean | void,
): boolean {
  return uploaded !== false;
}
