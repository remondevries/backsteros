/**
 * Machine-local fields in workspace_settings that must never be treated as
 * shared authority across local-core and cloud-core.
 *
 * Policy: strip on outbound replication; on apply, never take the peer's
 * vaultPath — preserve the local value (or env on cloud for display only).
 */
export const MACHINE_LOCAL_SETTINGS_KEYS = ["vaultPath"] as const;

export type MachineLocalSettingsKey = (typeof MACHINE_LOCAL_SETTINGS_KEYS)[number];

/** Remove machine-local keys so Mac paths never travel to the peer. */
export function stripMachineLocalSettingsFields(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...settings };
  for (const key of MACHINE_LOCAL_SETTINGS_KEYS) {
    delete next[key];
  }
  return next;
}

/**
 * Merge replicated settings onto this core without adopting the peer's
 * machine-local paths.
 * - cloud: optional display vaultPath from BACKSTEROS_VAULT_PATH only
 * - local: keep existing local vaultPath (settings / cache), ignore peer
 */
export function mergeWorkspaceSettingsForRole(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
  role: "local" | "cloud",
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const next = stripMachineLocalSettingsFields(incoming);

  if (role === "cloud") {
    const envPath = env.BACKSTEROS_VAULT_PATH?.trim();
    if (envPath) {
      next.vaultPath = envPath;
    }
    return next;
  }

  const localPath =
    typeof existing?.vaultPath === "string" && existing.vaultPath.trim()
      ? existing.vaultPath.trim()
      : null;
  if (localPath) {
    next.vaultPath = localPath;
  }
  return next;
}

/** Strip machine-local fields from a workspace_settings replication row. */
export function sanitizeWorkspaceSettingsRowForReplication(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const settings = row.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return row;
  }
  return {
    ...row,
    settings: stripMachineLocalSettingsFields(
      settings as Record<string, unknown>,
    ),
  };
}
