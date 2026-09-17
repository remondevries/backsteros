/**
 * Proxy staff "send portal password reset" to the client portal, which owns
 * reset tokens + Resend mail.
 *
 * Env:
 * - CLIENT_PORTAL_URL — e.g. https://client.lemo-design.com or http://localhost:3000
 * - CLIENT_PORTAL_HOOK_SECRET — must match portal PORTAL_INTERNAL_HOOK_SECRET
 *   (or portal BACKSTEROS_API_KEY when that fallback is used)
 */

function portalBaseUrl(): string {
  return (
    process.env.CLIENT_PORTAL_URL?.trim() ||
    process.env.PORTAL_PUBLIC_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function portalHookSecret(): string {
  return (
    process.env.CLIENT_PORTAL_HOOK_SECRET?.trim() ||
    process.env.PORTAL_INTERNAL_HOOK_SECRET?.trim() ||
    ""
  );
}

export type SendPortalPasswordResetResult =
  | { ok: true; email: string; message: string }
  | { ok: false; error: string; status: number };

export async function sendPortalPasswordResetViaPortal(
  contactId: string,
): Promise<SendPortalPasswordResetResult> {
  const secret = portalHookSecret();
  if (!secret) {
    return {
      ok: false,
      error:
        "CLIENT_PORTAL_HOOK_SECRET is not configured on cloud-core (must match portal PORTAL_INTERNAL_HOOK_SECRET)",
      status: 503,
    };
  }

  const url = `${portalBaseUrl()}/api/portal/admin/send-password-reset`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contactId }),
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not reach portal at ${portalBaseUrl()}: ${error.message}`
          : `Could not reach portal at ${portalBaseUrl()}`,
      status: 502,
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    email?: string;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error || `Portal returned ${response.status}`,
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
    };
  }

  return {
    ok: true,
    email: payload?.email?.trim() || "",
    message: payload?.message?.trim() || "Password reset email sent",
  };
}

export type SendPortalInviteResult =
  | { ok: true; email: string; message: string }
  | { ok: false; error: string; status: number };

/**
 * Proxy staff "send portal invite" to the client portal, which owns invite
 * tokens + Resend mail. Contact chooses their own password on the portal.
 */
export async function sendPortalInviteViaPortal(
  contactId: string,
): Promise<SendPortalInviteResult> {
  const secret = portalHookSecret();
  if (!secret) {
    return {
      ok: false,
      error:
        "CLIENT_PORTAL_HOOK_SECRET is not configured on cloud-core (must match portal PORTAL_INTERNAL_HOOK_SECRET)",
      status: 503,
    };
  }

  const url = `${portalBaseUrl()}/api/portal/admin/send-invite`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contactId }),
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not reach portal at ${portalBaseUrl()}: ${error.message}`
          : `Could not reach portal at ${portalBaseUrl()}`,
      status: 502,
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    email?: string;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error || `Portal returned ${response.status}`,
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
    };
  }

  return {
    ok: true,
    email: payload?.email?.trim() || "",
    message: payload?.message?.trim() || "Invite email sent",
  };
}
