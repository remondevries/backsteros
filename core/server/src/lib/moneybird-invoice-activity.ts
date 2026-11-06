import type { MoneybirdSalesInvoiceEvent } from "./moneybird-client.js";
import {
  getInvoiceReminderTrackSnapshot,
  type InvoiceReminderTrackSnapshot,
} from "./moneybird-invoice-reminders.js";

export type InvoiceActivityChannel =
  | "portal_email"
  | "moneybird_email"
  | "moneybird_post"
  | "moneybird_manual"
  | "moneybird_peppol"
  | "system";

export type InvoiceActivityKind =
  | "invoice_sent"
  | "reminder_sent"
  | "marked_late"
  | "marked_paid"
  | "cancelled"
  | "other";

export type InvoiceActivityItem = {
  id: string;
  at: string;
  kind: InvoiceActivityKind;
  channel: InvoiceActivityChannel | null;
  step: 1 | 2 | 3 | null;
  label: string;
  source: "moneybird" | "portal";
  action: string | null;
};

export type InvoiceActivityResponse = {
  invoiceId: string;
  items: InvoiceActivityItem[];
  nextReminderStep: 1 | 2 | 3 | null;
  eligibleFromManualSend: boolean;
};

const MONEYBIRD_ACTIVITY_ACTIONS = new Set([
  "sales_invoice_send_email",
  "sales_invoice_send_manually",
  "sales_invoice_send_post",
  "sales_invoice_send_post_confirmation",
  "sales_invoice_send_si",
  "sales_invoice_send_reminder_email",
  "sales_invoice_send_reminder_manually",
  "sales_invoice_send_reminder_post",
  "sales_invoice_send_reminder_post_confirmation",
  "sales_invoice_state_changed_to_late",
  "sales_invoice_state_changed_to_reminded",
  "sales_invoice_state_changed_to_paid",
  "sales_invoice_state_changed_to_uncollectible",
]);

function mapMoneybirdEvent(
  event: MoneybirdSalesInvoiceEvent,
  index: number,
): InvoiceActivityItem | null {
  const action = event.action.trim();
  if (!MONEYBIRD_ACTIVITY_ACTIONS.has(action)) return null;
  const at = event.createdAt?.trim() || null;
  if (!at) return null;

  let kind: InvoiceActivityKind = "other";
  let channel: InvoiceActivityChannel | null = null;
  let label = action.replaceAll("_", " ");

  if (action === "sales_invoice_send_email") {
    kind = "invoice_sent";
    channel = "moneybird_email";
    label = "Invoice sent via Moneybird email";
  } else if (action === "sales_invoice_send_manually") {
    kind = "invoice_sent";
    channel = "moneybird_manual";
    label = "Invoice marked sent manually in Moneybird";
  } else if (
    action === "sales_invoice_send_post" ||
    action === "sales_invoice_send_post_confirmation"
  ) {
    kind = "invoice_sent";
    channel = "moneybird_post";
    label = "Invoice sent by post via Moneybird";
  } else if (action === "sales_invoice_send_si") {
    kind = "invoice_sent";
    channel = "moneybird_peppol";
    label = "Invoice sent via Peppol";
  } else if (action === "sales_invoice_send_reminder_email") {
    kind = "reminder_sent";
    channel = "moneybird_email";
    label = "Reminder sent via Moneybird email";
  } else if (action === "sales_invoice_send_reminder_manually") {
    kind = "reminder_sent";
    channel = "moneybird_manual";
    label = "Reminder marked sent manually in Moneybird";
  } else if (
    action === "sales_invoice_send_reminder_post" ||
    action === "sales_invoice_send_reminder_post_confirmation"
  ) {
    kind = "reminder_sent";
    channel = "moneybird_post";
    label = "Reminder sent by post via Moneybird";
  } else if (action === "sales_invoice_state_changed_to_late") {
    kind = "marked_late";
    channel = "system";
    label = "Marked late in Moneybird";
  } else if (action === "sales_invoice_state_changed_to_reminded") {
    kind = "other";
    channel = "system";
    label = "Marked reminded in Moneybird";
  } else if (action === "sales_invoice_state_changed_to_paid") {
    kind = "marked_paid";
    channel = "system";
    label = "Marked paid in Moneybird";
  } else if (action === "sales_invoice_state_changed_to_uncollectible") {
    kind = "other";
    channel = "system";
    label = "Marked uncollectible in Moneybird";
  }

  return {
    id: `moneybird:${action}:${at}:${index}`,
    at,
    kind,
    channel,
    step: null,
    label,
    source: "moneybird",
    action,
  };
}

function portalTrackItems(
  invoiceId: string,
  track: InvoiceReminderTrackSnapshot,
): InvoiceActivityItem[] {
  const items: InvoiceActivityItem[] = [];
  if (track.eligibleFromManualSend && track.portalInvoiceSentAt) {
    items.push({
      id: `portal:invoice_sent:${invoiceId}`,
      at: track.portalInvoiceSentAt,
      kind: "invoice_sent",
      channel: "portal_email",
      step: null,
      label: "Invoice sent via BacksterOS / portal email",
      source: "portal",
      action: "portal_invoice_sent",
    });
  }
  for (const reminder of track.reminders) {
    items.push({
      id: `portal:reminder:${reminder.step}:${reminder.sentAt}`,
      at: reminder.sentAt,
      kind: "reminder_sent",
      channel: "portal_email",
      step: reminder.step,
      label: `Payment reminder ${reminder.step} sent via portal email`,
      source: "portal",
      action: `portal_reminder_${reminder.step}`,
    });
  }
  if (track.cancelledAt) {
    items.push({
      id: `portal:cancelled:${track.cancelledAt}`,
      at: track.cancelledAt,
      kind: "cancelled",
      channel: "system",
      step: null,
      label: "Pending portal reminders cancelled",
      source: "portal",
      action: "portal_reminders_cancelled",
    });
  }
  return items;
}

export function buildInvoiceActivityItems(input: {
  invoiceId: string;
  moneybirdEvents: MoneybirdSalesInvoiceEvent[];
  track: InvoiceReminderTrackSnapshot | null;
}): InvoiceActivityItem[] {
  const items: InvoiceActivityItem[] = [];
  input.moneybirdEvents.forEach((event, index) => {
    const mapped = mapMoneybirdEvent(event, index);
    if (mapped) items.push(mapped);
  });
  if (input.track) {
    items.push(...portalTrackItems(input.invoiceId, input.track));
  }
  items.sort((a, b) => {
    const delta = Date.parse(b.at) - Date.parse(a.at);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
  return items;
}

export async function buildInvoiceActivityResponse(input: {
  invoiceId: string;
  moneybirdEvents: MoneybirdSalesInvoiceEvent[];
}): Promise<InvoiceActivityResponse> {
  const track = await getInvoiceReminderTrackSnapshot(input.invoiceId);
  return {
    invoiceId: input.invoiceId,
    items: buildInvoiceActivityItems({
      invoiceId: input.invoiceId,
      moneybirdEvents: input.moneybirdEvents,
      track,
    }),
    nextReminderStep: track?.nextStep ?? null,
    eligibleFromManualSend: track?.eligibleFromManualSend ?? false,
  };
}
