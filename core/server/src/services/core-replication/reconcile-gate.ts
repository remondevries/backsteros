/**
 * Pure gate for the hourly reconcile job — kept free of DB imports so unit
 * tests can load it without DATABASE_URL.
 */
export function isReplicationReconcileEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.CORE_REPLICATION_RECONCILE?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  // Integration / unit tests must never hit a live peer reconcile.
  if (env.NODE_ENV === "test") return false;
  if (env.BACKSTEROS_INTEGRATION_TEST === "1") return false;
  return true;
}
