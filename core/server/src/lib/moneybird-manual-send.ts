import { sendPortalInvoiceEmailViaPortal } from "./portal-invoice-email-proxy.js";

export const MONEYBIRD_SEND_MANUALLY_ACTION = "sales_invoice_send_manually";

/** In-process dedupe for webhook retries during a single process lifetime. */
const triggeredInvoiceIds = new Set<string>();

export type MoneybirdWebhookPayload = {
  action?: string;
  entity_type?: string;
  entity_id?: string | number;
  state?: string;
  webhook_token?: string;
  entity?: Record<string, unknown> | null;
};

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export async function handleMoneybirdManualSendWebhook(
  payload: MoneybirdWebhookPayload,
): Promise<{
  handled: boolean;
  skipped?: string;
  invoiceId?: string;
  to?: string;
  message?: string;
}> {
  const action = payload.action?.trim();
  if (action !== MONEYBIRD_SEND_MANUALLY_ACTION) {
    return { handled: false, skipped: `ignored_action:${action || "none"}` };
  }

  const invoiceId =
    asString(payload.entity_id) || asString(payload.entity?.id);
  if (!invoiceId) {
    throw Object.assign(new Error("Webhook missing sales invoice id"), {
      status: 400,
    });
  }

  if (triggeredInvoiceIds.has(invoiceId)) {
    return { handled: true, skipped: "already_triggered", invoiceId };
  }

  const locale = asString(payload.entity?.language);
  const result = await sendPortalInvoiceEmailViaPortal({
    invoiceId,
    locale,
  });

  if (!result.ok) {
    throw Object.assign(new Error(result.error), { status: result.status });
  }

  triggeredInvoiceIds.add(invoiceId);

  return {
    handled: true,
    invoiceId: result.invoiceId,
    to: result.email || undefined,
    skipped: result.skipped,
    message: result.message,
  };
}
