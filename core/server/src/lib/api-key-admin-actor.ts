/**
 * OS-181: who may drive local→cloud API key admin forwards.
 * Agent/app keys are rejected; only the owner local-shell may mint on cloud.
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
  if (auth.kind !== "local_shell" || !auth.userId) {
    return {
      status: 403,
      body: {
        error:
          "API key admin on local-core must use the owner shell (not an app/agent key)",
        code: "forbidden",
      },
    };
  }
  return null;
}
