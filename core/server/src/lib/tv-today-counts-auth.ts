import type { ApiKeyScope } from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";

/** Counts-only capability for Office TV (OS-137). */
export const TV_TODAY_COUNTS_SCOPE =
  "tv.today_counts" as const satisfies ApiKeyScope;

/**
 * TV today-counts keys are exclusive: exactly one scope, independently
 * revocable. Full-access / tasks:read / admin keys must not unlock these routes.
 */
export function isTvTodayCountsKey(scopes: readonly string[] | null | undefined): boolean {
  if (!scopes || scopes.length !== 1) return false;
  return scopes[0] === TV_TODAY_COUNTS_SCOPE;
}

export function isTvTodayCountsAuth(
  auth: AuthContext | undefined | null,
): boolean {
  if (!auth || auth.kind !== "api_key") return false;
  return isTvTodayCountsKey(auth.scopes);
}
