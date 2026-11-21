/**
 * OS-181: who may drive local→cloud API key admin forwards.
 * Agent persona keys are rejected. Owner local-shell and owner Access keys
 * (settings:write, no agent contact) may mint/revoke on cloud — desktop often
 * authenticates as an Access key when the local-shell token is not baked in.
 */

export type ApiKeyAdminActor = {
  kind: string;
  userId?: string | null;
  contactId?: string | null;
};

export type ApiKeyAdminActorDenial = {
  status: 403;
  body: { error: string; code: "forbidden" };
};

/**
 * Returns a 403 body when the actor must not forward key admin to cloud.
 * Callers already gate with `canManageApiKeys` (settings:write for API keys).
 */
export function rejectNonOwnerShellForCloudForward(
  auth: ApiKeyAdminActor,
): ApiKeyAdminActorDenial | null {
  if (auth.kind === "api_key" && auth.contactId) {
    return {
      status: 403,
      body: {
        error: "Agent keys cannot create or manage API keys on the cloud",
        code: "forbidden",
      },
    };
  }
  if (auth.kind === "local_shell" && auth.userId) {
    return null;
  }
  // Owner Access key (no contact) — same surface as Settings → API in the shell.
  if (auth.kind === "api_key" && auth.userId && !auth.contactId) {
    return null;
  }
  return {
    status: 403,
    body: {
      error:
        "API key admin on local-core must use the owner shell or an owner Access key (not an app/agent key)",
      code: "forbidden",
    },
  };
}
