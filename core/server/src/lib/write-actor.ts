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
