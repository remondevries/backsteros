/**
 * Pure policy for revealing TransIP domain transfer / EPP codes — no DB import.
 *
 * Domain detail/list must never fetch the code. The explicit reveal action is
 * limited to the local-shell owner or an elevated settings:write Access key.
 * Agent persona keys (contactId bound) are always refused.
 */

import type { AuthContext } from "../middleware/auth.js";
import { isOwnerShellAuth, requireScope } from "../middleware/auth.js";

export type TransipAuthCodeAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

function isAgentPersonaAuth(auth: AuthContext): boolean {
  return auth.kind === "api_key" && auth.contactId != null;
}

export function canRevealTransipDomainAuthCode(
  auth: AuthContext | undefined | null,
): TransipAuthCodeAccessDecision {
  if (!auth) {
    return { allowed: false, reason: "Unauthorized" };
  }
  if (isOwnerShellAuth(auth)) {
    return { allowed: true };
  }
  if (isAgentPersonaAuth(auth)) {
    return {
      allowed: false,
      reason: "Agent API keys cannot reveal TransIP transfer codes",
    };
  }
  if (requireScope("settings:write")(auth)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason:
      "Revealing a TransIP transfer code requires the owner shell or settings:write",
  };
}
