/**
 * OS-187: who may list internal / all task comments.
 *
 * Staff/agent keys (local shell, Access, agent personas) default to `all` so
 * CLI / BacksterDEV keep seeing internal notes. Portal keys marked with the
 * `portal` scope are locked to `client_visible` and get 403 if they ask for
 * `all` / `internal`.
 */
import {
  PORTAL_API_KEY_MARKER_SCOPE,
  isPortalRestrictedApiKeyScopes,
} from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";

export type CommentVisibilityFilter = "client_visible" | "internal" | "all";

export type ResolveCommentVisibilityResult =
  | { ok: true; visibility: CommentVisibilityFilter }
  | { ok: false; status: 403; error: string };

/** True when this API key is the client portal key (marker scope `portal`). */
export function isPortalCommentVisibilityKey(
  auth: AuthContext | undefined | null,
): boolean {
  if (!auth || auth.kind !== "api_key") return false;
  return isPortalRestrictedApiKeyScopes(auth.scopes);
}

/** Staff shell, Access/owner API keys, and agent persona keys — not portal. */
export function canListAllCommentVisibilities(
  auth: AuthContext | undefined | null,
): boolean {
  if (!auth) return false;
  if (auth.kind === "local_shell") return true;
  if (auth.kind === "api_key") {
    return !isPortalCommentVisibilityKey(auth);
  }
  return false;
}

/**
 * Resolve list filter.
 * - Staff/agent omit → `all` (CLI / BacksterDEV see internal notes).
 * - Portal key → always `client_visible`; asking for all/internal → 403.
 * - Unauthenticated / unknown → `client_visible`.
 */
export function resolveCommentListVisibility(
  auth: AuthContext | undefined | null,
  requested: string | null | undefined,
): ResolveCommentVisibilityResult {
  const raw = (requested ?? "").trim();
  const wantsAll = raw === "all";
  const wantsInternal = raw === "internal";
  const wantsClient = raw === "client_visible";

  if (isPortalCommentVisibilityKey(auth)) {
    if (wantsAll || wantsInternal) {
      return {
        ok: false,
        status: 403,
        error: `Portal API keys (scope "${PORTAL_API_KEY_MARKER_SCOPE}") may only list client_visible comments`,
      };
    }
    return { ok: true, visibility: "client_visible" };
  }

  if (canListAllCommentVisibilities(auth)) {
    if (wantsAll) return { ok: true, visibility: "all" };
    if (wantsInternal) return { ok: true, visibility: "internal" };
    if (wantsClient) return { ok: true, visibility: "client_visible" };
    // Omitted → staff/agent see everything (pre-OS-187 behaviour).
    return { ok: true, visibility: "all" };
  }

  // Non-staff: portal-safe only; never escalate.
  return { ok: true, visibility: "client_visible" };
}
