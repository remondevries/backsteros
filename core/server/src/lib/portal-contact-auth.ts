import {
  isUniqueViolation,
  readPgError,
} from "../services/core-replication/soft-unique-conflicts.js";

export class PortalUsernameConflictError extends Error {
  readonly code = "portal_username_conflict" as const;

  constructor(message = "Portal username is already in use by another contact") {
    super(message);
    this.name = "PortalUsernameConflictError";
  }
}

export function isPortalUsernameUniqueViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const constraint = readPgError(error)?.constraint;
  return constraint === "contacts_workspace_portal_username_unique";
}

/** Map Postgres unique violations on portal usernames to a stable API error. */
export function rethrowPortalUsernameConflict(error: unknown): never {
  if (isPortalUsernameUniqueViolation(error)) {
    throw new PortalUsernameConflictError();
  }
  throw error;
}
