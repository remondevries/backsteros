/**
 * Proxy Moneybird late / reminder schedule → Lemo Design portal reminder email.
 *
 * Env:
 * - CLIENT_PORTAL_URL — e.g. https://client.lemo-design.com (loopback ignored)
 * - CLIENT_PORTAL_HOOK_SECRET (must match portal PORTAL_INTERNAL_HOOK_SECRET)
 */

import { resolveClientPortalBaseUrl } from "./client-portal-url.js";

function portalBaseUrl(): string {
  return resolveClientPortalBaseUrl();
}

function portalHookSecret(): string {
  return (
    process.env.CLIENT_PORTAL_HOOK_SECRET?.trim() ||
    process.env.PORTAL_INTERNAL_HOOK_SECRET?.trim() ||
    ""
  );
}

export type SendPortalInvoiceReminderEmailResult =
  | {
      ok: true;
      email: string;
      message: string;
      invoiceId: string;
      step: 1 | 2 | 3;
      messageId?: string;
      inboxId?: string;
      skipped?: "already_sent" | "already_paid";
    }
  | { ok: false; error: string; status: number };

export async function sendPortalInvoiceReminderEmailViaPortal(input: {
  invoiceId: string;
  step: 1 | 2 | 3;
  locale?: string | null;
  /** Staff-chosen recipient; portal bypasses dry-run override when set. */
  to?: string | null;
}): Promise<SendPortalInvoiceReminderEmailResult> {
  const secret = portalHookSecret();
  if (!secret) {
    return {
      ok: false,
      error:
        "CLIENT_PORTAL_HOOK_SECRET is not configured on cloud-core (must match portal PORTAL_INTERNAL_HOOK_SECRET)",
      status: 503,
    };
  }

  const url = `${portalBaseUrl()}/api/portal/admin/send-invoice-reminder-email`;
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
        step: input.step,
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
    step?: number;
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

  const step =
    payload?.step === 2 || payload?.step === 3 ? payload.step : input.step;

  return {
    ok: true,
    email: payload?.email?.trim() || "",
    invoiceId: payload?.invoiceId?.trim() || input.invoiceId,
    step,
    messageId:
      payload?.messageId?.trim() || payload?.emailId?.trim() || undefined,
    inboxId: payload?.inboxId?.trim() || undefined,
    skipped:
      payload?.skipped === "already_sent" || payload?.skipped === "already_paid"
        ? payload.skipped
        : undefined,
    message:
      payload?.message?.trim() ||
      `Reminder step ${step} sent for ${input.invoiceId}`,
  };
}
