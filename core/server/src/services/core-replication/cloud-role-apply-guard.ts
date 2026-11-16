/**
 * Cloud-side guards for users.role / workspace_members.role from the local peer.
 * Pure — safe for unit tests without DATABASE_URL.
 *
 * Existing rows: keep cloud's role (ignore local changes).
 * New rows: demote elevated roles (owner/admin) to a safe default.
 */

export const ELEVATED_CLOUD_ROLES = new Set(["owner", "admin"]);

/** Safe default for users.role when local tries to mint an elevated user. */
export const SAFE_USER_ROLE_FROM_LOCAL = "member";

/** Safe default for workspace_members.role when local tries to mint owner/admin. */
export const SAFE_WORKSPACE_MEMBER_ROLE_FROM_LOCAL = "member";

export function isElevatedCloudRole(
  role: string | null | undefined,
): boolean {
  if (role == null) return false;
  return ELEVATED_CLOUD_ROLES.has(String(role).trim().toLowerCase());
}

export type CloudRoleGuardResult = {
  role: string;
  /** Existing cloud role differed from inbound — kept cloud's. */
  ignored: boolean;
  /** New row arrived with an elevated role — demoted to safeDefault. */
  demoted: boolean;
};

/**
 * Resolve the role to persist on cloud for a row arriving from local.
 * @param existingRole null/undefined when the row does not yet exist on cloud
 */
export function resolveCloudRoleFromLocal(
  existingRole: string | null | undefined,
  incomingRole: string | null | undefined,
  safeDefault: string,
): CloudRoleGuardResult {
  const incoming =
    incomingRole == null || String(incomingRole).trim() === ""
      ? safeDefault
      : String(incomingRole).trim();

  if (existingRole != null && String(existingRole).trim() !== "") {
    const existing = String(existingRole).trim();
    if (existing === incoming) {
      return { role: existing, ignored: false, demoted: false };
    }
    return { role: existing, ignored: true, demoted: false };
  }

  if (isElevatedCloudRole(incoming)) {
    return { role: safeDefault, ignored: false, demoted: true };
  }
  return { role: incoming, ignored: false, demoted: false };
}
