import type { AuthContext } from "../middleware/auth.js";

export type TaskWriteActor = {
  userId: string | null;
  contactId?: string | null;
  kind?: "user" | "agent" | "contact";
};

/** Prefer a contact attached to an API key so Grok/other agents show as that person. */
export function writeActorFromAuth(
  auth: AuthContext,
  activityActor?: "user" | "agent",
): TaskWriteActor {
  if (auth.contactId) {
    return {
      userId: null,
      contactId: auth.contactId,
      kind: "contact",
    };
  }
  if (activityActor === "agent") {
    return { userId: null, kind: "agent" };
  }
  return { userId: auth.userId, kind: "user" };
}

/**
 * Resolve the comment write actor.
 * API-key callers may override authorship with `authorContactId`
 * (client portal, agent contact profile). Explicit contact wins over
 * `activityActor: "agent"` so agent comments can show as a person.
 */
export function writeActorForComment(
  auth: AuthContext,
  options?: {
    activityActor?: "user" | "agent";
    authorContactId?: string | null;
  },
): TaskWriteActor {
  const override = options?.authorContactId?.trim() || null;
  // Prefer explicit portal/agent contact over anonymous Agent / key contact.
  if (override && auth.apiKeyId) {
    return {
      userId: null,
      contactId: override,
      kind: "contact",
    };
  }
  if (options?.activityActor === "agent") {
    // API keys with an attached contact still show as that person.
    if (auth.contactId) {
      return {
        userId: null,
        contactId: auth.contactId,
        kind: "contact",
      };
    }
    return { userId: null, kind: "agent" };
  }
  return writeActorFromAuth(auth, options?.activityActor);
}
