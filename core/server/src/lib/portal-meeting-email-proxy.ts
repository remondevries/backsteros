/**
 * Proxy staff "send meeting invite/reminder" to the client portal, which owns
 * Resend mail + stable join URLs.
 *
 * Env:
 * - CLIENT_PORTAL_URL — e.g. https://client.lemo-design.com or http://localhost:3000
 * - CLIENT_PORTAL_HOOK_SECRET — must match portal PORTAL_INTERNAL_HOOK_SECRET
 *   (or portal BACKSTEROS_API_KEY when that fallback is used)
 */

export type MeetingEmailKind = "invite" | "reminder";

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

export type SendPortalMeetingEmailResult =
  | { ok: true; email: string; message: string }
  | { ok: false; error: string; status: number };

export async function sendPortalMeetingEmailViaPortal(input: {
  meetingId: string;
  contactId: string;
  kind: MeetingEmailKind;
}): Promise<SendPortalMeetingEmailResult> {
  const secret = portalHookSecret();
  if (!secret) {
    return {
      ok: false,
      error:
        "CLIENT_PORTAL_HOOK_SECRET is not configured on cloud-core (must match portal PORTAL_INTERNAL_HOOK_SECRET)",
      status: 503,
    };
  }

  const url = `${portalBaseUrl()}/api/portal/admin/send-meeting-email`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meetingId: input.meetingId,
        contactId: input.contactId,
        kind: input.kind,
      }),
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
    const baseError = payload?.error || `Portal returned ${response.status}`;
    const error =
      response.status === 401
        ? `${baseError}. Check CLIENT_PORTAL_HOOK_SECRET on core matches portal PORTAL_INTERNAL_HOOK_SECRET (or BACKSTEROS_API_KEY), then restart the portal dev server after .env.local changes.`
        : baseError;
    return {
      ok: false,
      error,
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
    };
  }

  const label = input.kind === "reminder" ? "Reminder" : "Invite";
  return {
    ok: true,
    email: payload?.email?.trim() || "",
    message: payload?.message?.trim() || `${label} email sent`,
  };
}
