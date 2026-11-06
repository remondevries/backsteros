/**
 * Proxy Moneybird Manual → Lemo Design portal invoice email.
 * Portal owns branded HTML, pay links, PDF surface, and transactional send.
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

export type SendPortalInvoiceEmailResult =
  | {
      ok: true;
      email: string;
      message: string;
      invoiceId: string;
      messageId?: string;
      inboxId?: string;
      skipped?: "already_sent";
    }
  | { ok: false; error: string; status: number };

export async function sendPortalInvoiceEmailViaPortal(input: {
  invoiceId: string;
  locale?: string | null;
  /** Staff-chosen recipient; forwarded to the portal (bypasses dry-run override). */
  to?: string | null;
}): Promise<SendPortalInvoiceEmailResult> {
  const secret = portalHookSecret();
  if (!secret) {
    return {
      ok: false,
      error:
        "CLIENT_PORTAL_HOOK_SECRET is not configured on cloud-core (must match portal PORTAL_INTERNAL_HOOK_SECRET)",
      status: 503,
    };
  }

  const url = `${portalBaseUrl()}/api/portal/admin/send-invoice-email`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invoiceId: input.invoiceId,
        locale: input.locale ?? null,
        ...(input.to?.trim() ? { to: input.to.trim() } : {}),
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
    invoiceId?: string;
    emailId?: string;
    messageId?: string;
    inboxId?: string;
    skipped?: string;
  } | null;

  if (!response.ok) {
    const baseError = payload?.error || `Portal returned ${response.status}`;
    const error =
      response.status === 401
        ? `${baseError}. Check CLIENT_PORTAL_HOOK_SECRET on core matches portal PORTAL_INTERNAL_HOOK_SECRET (or BACKSTEROS_API_KEY).`
        : baseError;
    return {
      ok: false,
      error,
      status:
        response.status >= 400 && response.status < 600 ? response.status : 502,
    };
  }

  return {
    ok: true,
    email: payload?.email?.trim() || "",
    invoiceId: payload?.invoiceId?.trim() || input.invoiceId,
    messageId:
      payload?.messageId?.trim() || payload?.emailId?.trim() || undefined,
    inboxId: payload?.inboxId?.trim() || undefined,
    skipped:
      payload?.skipped === "already_sent" ? "already_sent" : undefined,
    message:
      payload?.message?.trim() ||
      `Invoice email sent for ${input.invoiceId}`,
  };
}
