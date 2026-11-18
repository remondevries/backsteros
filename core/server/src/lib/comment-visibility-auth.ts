/**
 * OS-187: who may list internal / all task comments.
 * Portal-safe default is always `client_visible`; `all` / `internal` only for
 * staff (local shell, Access keys) and agent persona keys — and only when
 * requested explicitly.
 */
import type { AuthContext } from "../middleware/auth.js";

export type CommentVisibilityFilter = "client_visible" | "internal" | "all";

/** Staff shell, Access/owner API keys, and agent persona keys. */
export function canListAllCommentVisibilities(
  auth: AuthContext | undefined | null,
): boolean {
  if (!auth) return false;
  if (auth.kind === "local_shell") return true;
  if (auth.kind === "api_key") return true;
  return false;
}

/**
 * Resolve list filter. Omitted query → `client_visible`.
 * Non-staff callers cannot escalate to `all` / `internal`.
 */
export function resolveCommentListVisibility(
  auth: AuthContext | undefined | null,
  requested: string | null | undefined,
): CommentVisibilityFilter {
  const raw = (requested ?? "").trim();
  const wantsAll = raw === "all";
  const wantsInternal = raw === "internal";
  if ((wantsAll || wantsInternal) && canListAllCommentVisibilities(auth)) {
    return wantsAll ? "all" : "internal";
  }
  if (raw === "client_visible") return "client_visible";
  // Default + any unauthorized escalation → portal-safe.
  return "client_visible";
}
