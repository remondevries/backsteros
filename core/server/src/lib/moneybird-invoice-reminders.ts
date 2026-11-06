import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  moneybirdInvoiceReminderTracks,
  type DbMoneybirdInvoiceReminderTrack,
} from "../db/schema.js";
import { sendPortalInvoiceEmailViaPortal } from "./portal-invoice-email-proxy.js";
import { sendPortalInvoiceReminderEmailViaPortal } from "./portal-invoice-reminder-email-proxy.js";
import type { MoneybirdWebhookPayload } from "./moneybird-manual-send.js";

export const MONEYBIRD_LATE_ACTION = "sales_invoice_state_changed_to_late";
export const MONEYBIRD_PAID_ACTION = "sales_invoice_state_changed_to_paid";

type ReminderStep = 1 | 2 | 3;

type PortalMailRef = {
  messageId: string | null;
  inboxId: string | null;
  /** Recipient email address for activity labels. */
  to: string | null;
};

type ReminderTrack = {
  /** Only invoices that received the Manual → portal invoice email. */
  eligibleFromManualSend: boolean;
  /** When the portal invoice email was first marked eligible (ISO). */
  portalInvoiceSentAt: string | null;
  portalInvoiceMail: PortalMailRef;
  lastStep: 0 | ReminderStep;
  /** ISO times when each step was successfully emailed (or skipped paid). */
  sentAt: Partial<Record<ReminderStep, string>>;
  reminderMail: Partial<Record<ReminderStep, PortalMailRef>>;
  /** When step 2 / 3 should fire (ms epoch). Cleared when sent or cancelled. */
  dueAt: Partial<Record<2 | 3, number>>;
  locale: string | null;
  cancelledAt: string | null;
};

function emptyMailRef(): PortalMailRef {
  return { messageId: null, inboxId: null, to: null };
}

function normalizeMailRef(input?: {
  messageId?: string | null;
  inboxId?: string | null;
  to?: string | null;
} | null): PortalMailRef {
  const messageId = input?.messageId?.trim() || null;
  const inboxId = input?.inboxId?.trim() || null;
  const to = input?.to?.trim() || null;
  return { messageId, inboxId, to };
}

function mergeMailRef(
  existing: PortalMailRef | undefined,
  next: PortalMailRef,
): PortalMailRef {
  return {
    messageId: next.messageId ?? existing?.messageId ?? null,
    inboxId: next.inboxId ?? existing?.inboxId ?? null,
    to: next.to ?? existing?.to ?? null,
  };
}

function mailRefHasValue(ref: PortalMailRef): boolean {
  return Boolean(ref.messageId || ref.inboxId || ref.to);
}

/** In-process cache; Postgres is the source of truth after persistence is enabled. */
const tracks = new Map<string, ReminderTrack>();

let persistenceEnabled = false;
let schedulerStarted = false;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function daysToMs(days: number): number {
  return Math.max(0, days) * 24 * 60 * 60 * 1000;
}

/** Days after step 1 before step 2 (default 10 — typical Moneybird workflow). */
export function reminderStep2DelayDays(): number {
  const raw = Number(process.env.INVOICE_REMINDER_STEP_2_DELAY_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10;
}

/** Days after step 2 before step 3 (default 5). */
export function reminderStep3DelayDays(): number {
  const raw = Number(process.env.INVOICE_REMINDER_STEP_3_DELAY_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

function emptyTrack(locale: string | null): ReminderTrack {
  return {
    eligibleFromManualSend: false,
    portalInvoiceSentAt: null,
    portalInvoiceMail: emptyMailRef(),
    lastStep: 0,
    sentAt: {},
    reminderMail: {},
    dueAt: {},
    locale,
    cancelledAt: null,
  };
}

function rowToTrack(row: DbMoneybirdInvoiceReminderTrack): ReminderTrack {
  const sentAt: ReminderTrack["sentAt"] = {};
  if (row.sentAt1) sentAt[1] = row.sentAt1.toISOString();
  if (row.sentAt2) sentAt[2] = row.sentAt2.toISOString();
  if (row.sentAt3) sentAt[3] = row.sentAt3.toISOString();
  const reminderMail: ReminderTrack["reminderMail"] = {};
  if (row.reminderMessageId1 || row.reminderInboxId1 || row.reminderTo1) {
    reminderMail[1] = {
      messageId: row.reminderMessageId1,
      inboxId: row.reminderInboxId1,
      to: row.reminderTo1,
    };
  }
  if (row.reminderMessageId2 || row.reminderInboxId2 || row.reminderTo2) {
    reminderMail[2] = {
      messageId: row.reminderMessageId2,
      inboxId: row.reminderInboxId2,
      to: row.reminderTo2,
    };
  }
  if (row.reminderMessageId3 || row.reminderInboxId3 || row.reminderTo3) {
    reminderMail[3] = {
      messageId: row.reminderMessageId3,
      inboxId: row.reminderInboxId3,
      to: row.reminderTo3,
    };
  }
  const dueAt: ReminderTrack["dueAt"] = {};
  if (row.dueAt2) dueAt[2] = row.dueAt2.getTime();
  if (row.dueAt3) dueAt[3] = row.dueAt3.getTime();
  const lastStep =
    row.lastStep === 1 || row.lastStep === 2 || row.lastStep === 3
      ? row.lastStep
      : 0;
  const portalInvoiceSentAt =
    row.portalInvoiceSentAt?.toISOString() ??
    (row.eligibleFromManualSend && row.createdAt
      ? row.createdAt.toISOString()
      : null);
  return {
    eligibleFromManualSend: row.eligibleFromManualSend,
    portalInvoiceSentAt,
    portalInvoiceMail: {
      messageId: row.portalInvoiceMessageId,
      inboxId: row.portalInvoiceInboxId,
      to: row.portalInvoiceTo,
    },
    lastStep,
    sentAt,
    reminderMail,
    dueAt,
    locale: row.locale,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
  };
}

function isoToDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function msToDate(value: number | undefined): Date | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Date(value);
}

async function persistTrack(
  invoiceId: string,
  track: ReminderTrack,
): Promise<void> {
  if (!persistenceEnabled) return;
  const now = new Date();
  await db
    .insert(moneybirdInvoiceReminderTracks)
    .values({
      invoiceId,
      eligibleFromManualSend: track.eligibleFromManualSend,
      lastStep: track.lastStep,
      sentAt1: isoToDate(track.sentAt[1]),
      sentAt2: isoToDate(track.sentAt[2]),
      sentAt3: isoToDate(track.sentAt[3]),
      dueAt2: msToDate(track.dueAt[2]),
      dueAt3: msToDate(track.dueAt[3]),
      locale: track.locale,
      cancelledAt: isoToDate(track.cancelledAt ?? undefined),
      portalInvoiceSentAt: isoToDate(track.portalInvoiceSentAt ?? undefined),
      portalInvoiceMessageId: track.portalInvoiceMail.messageId,
      portalInvoiceInboxId: track.portalInvoiceMail.inboxId,
      portalInvoiceTo: track.portalInvoiceMail.to,
      reminderMessageId1: track.reminderMail[1]?.messageId ?? null,
      reminderInboxId1: track.reminderMail[1]?.inboxId ?? null,
      reminderTo1: track.reminderMail[1]?.to ?? null,
      reminderMessageId2: track.reminderMail[2]?.messageId ?? null,
      reminderInboxId2: track.reminderMail[2]?.inboxId ?? null,
      reminderTo2: track.reminderMail[2]?.to ?? null,
      reminderMessageId3: track.reminderMail[3]?.messageId ?? null,
      reminderInboxId3: track.reminderMail[3]?.inboxId ?? null,
      reminderTo3: track.reminderMail[3]?.to ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: moneybirdInvoiceReminderTracks.invoiceId,
      set: {
        eligibleFromManualSend: track.eligibleFromManualSend,
        lastStep: track.lastStep,
        sentAt1: isoToDate(track.sentAt[1]),
        sentAt2: isoToDate(track.sentAt[2]),
        sentAt3: isoToDate(track.sentAt[3]),
        dueAt2: msToDate(track.dueAt[2]),
        dueAt3: msToDate(track.dueAt[3]),
        locale: track.locale,
        cancelledAt: isoToDate(track.cancelledAt ?? undefined),
        portalInvoiceSentAt: isoToDate(track.portalInvoiceSentAt ?? undefined),
        portalInvoiceMessageId: track.portalInvoiceMail.messageId,
        portalInvoiceInboxId: track.portalInvoiceMail.inboxId,
        portalInvoiceTo: track.portalInvoiceMail.to,
        reminderMessageId1: track.reminderMail[1]?.messageId ?? null,
        reminderInboxId1: track.reminderMail[1]?.inboxId ?? null,
        reminderTo1: track.reminderMail[1]?.to ?? null,
        reminderMessageId2: track.reminderMail[2]?.messageId ?? null,
        reminderInboxId2: track.reminderMail[2]?.inboxId ?? null,
        reminderTo2: track.reminderMail[2]?.to ?? null,
        reminderMessageId3: track.reminderMail[3]?.messageId ?? null,
        reminderInboxId3: track.reminderMail[3]?.inboxId ?? null,
        reminderTo3: track.reminderMail[3]?.to ?? null,
        updatedAt: now,
      },
    });
}

async function loadTrackFromDb(
  invoiceId: string,
): Promise<ReminderTrack | null> {
  if (!persistenceEnabled) return null;
  const [row] = await db
    .select()
    .from(moneybirdInvoiceReminderTracks)
    .where(eq(moneybirdInvoiceReminderTracks.invoiceId, invoiceId))
    .limit(1);
  return row ? rowToTrack(row) : null;
}

async function getOrCreateTrack(
  invoiceId: string,
  locale: string | null,
): Promise<ReminderTrack> {
  const existing = tracks.get(invoiceId);
  if (existing) {
    if (locale && !existing.locale) existing.locale = locale;
    return existing;
  }
  const fromDb = await loadTrackFromDb(invoiceId);
  if (fromDb) {
    if (locale && !fromDb.locale) fromDb.locale = locale;
    tracks.set(invoiceId, fromDb);
    return fromDb;
  }
  const created = emptyTrack(locale);
  tracks.set(invoiceId, created);
  return created;
}

async function hydrateTracksFromDb(): Promise<void> {
  if (!persistenceEnabled) return;
  const rows = await db.select().from(moneybirdInvoiceReminderTracks);
  for (const row of rows) {
    tracks.set(row.invoiceId, rowToTrack(row));
  }
}

/**
 * Mark an invoice as eligible for the Lemo reminder ladder after Manual
 * send triggered the portal invoice email.
 */
export async function registerManualPortalInvoiceForReminders(
  invoiceId: string,
  locale?: string | null,
  mail?: {
    messageId?: string | null;
    inboxId?: string | null;
    to?: string | null;
  } | null,
): Promise<void> {
  const id = invoiceId.trim();
  if (!id) return;
  const track = await getOrCreateTrack(id, locale?.trim() || null);
  track.eligibleFromManualSend = true;
  track.cancelledAt = null;
  if (!track.portalInvoiceSentAt) {
    track.portalInvoiceSentAt = new Date().toISOString();
  }
  const mailRef = normalizeMailRef(mail);
  if (mailRefHasValue(mailRef)) {
    track.portalInvoiceMail = mergeMailRef(track.portalInvoiceMail, mailRef);
  }
  if (locale?.trim()) track.locale = locale.trim();
  await persistTrack(id, track);
}

function nextReminderStep(track: ReminderTrack): ReminderStep | null {
  if (!track.sentAt[1]) return 1;
  if (!track.sentAt[2]) return 2;
  if (!track.sentAt[3]) return 3;
  return null;
}

export type InvoiceReminderTrackSnapshot = {
  eligibleFromManualSend: boolean;
  portalInvoiceSentAt: string | null;
  portalInvoiceMessageId: string | null;
  portalInvoiceInboxId: string | null;
  portalInvoiceTo: string | null;
  locale: string | null;
  cancelledAt: string | null;
  lastStep: 0 | ReminderStep;
  nextStep: ReminderStep | null;
  reminders: Array<{
    step: ReminderStep;
    sentAt: string;
    messageId: string | null;
    inboxId: string | null;
    to: string | null;
  }>;
  dueAt: Partial<Record<2 | 3, string>>;
};

/** Snapshot used by the finance invoice Activity timeline. */
export async function getInvoiceReminderTrackSnapshot(
  invoiceId: string,
): Promise<InvoiceReminderTrackSnapshot | null> {
  const id = invoiceId.trim();
  if (!id) return null;

  let track = tracks.get(id);
  if (!track) {
    const fromDb = await loadTrackFromDb(id);
    if (!fromDb) return null;
    tracks.set(id, fromDb);
    track = fromDb;
  }

  const reminders: Array<{
    step: ReminderStep;
    sentAt: string;
    messageId: string | null;
    inboxId: string | null;
    to: string | null;
  }> = [];
  for (const step of [1, 2, 3] as const) {
    const sentAt = track.sentAt[step];
    if (sentAt) {
      reminders.push({
        step,
        sentAt,
        messageId: track.reminderMail[step]?.messageId ?? null,
        inboxId: track.reminderMail[step]?.inboxId ?? null,
        to: track.reminderMail[step]?.to ?? null,
      });
    }
  }
  return {
    eligibleFromManualSend: track.eligibleFromManualSend,
    portalInvoiceSentAt: track.portalInvoiceSentAt,
    portalInvoiceMessageId: track.portalInvoiceMail.messageId,
    portalInvoiceInboxId: track.portalInvoiceMail.inboxId,
    portalInvoiceTo: track.portalInvoiceMail.to,
    locale: track.locale,
    cancelledAt: track.cancelledAt,
    lastStep: track.lastStep,
    nextStep: track.cancelledAt ? null : nextReminderStep(track),
    reminders,
    dueAt: {
      ...(track.dueAt[2] != null
        ? { 2: new Date(track.dueAt[2]).toISOString() }
        : {}),
      ...(track.dueAt[3] != null
        ? { 3: new Date(track.dueAt[3]).toISOString() }
        : {}),
    },
  };
}

export type PortalInvoiceEmailKind = "invoice" | ReminderStep;

function validateStaffTo(
  invoiceId: string,
  to: string | null | undefined,
):
  | { ok: true; staffTo: string | null }
  | { ok: false; invoiceId: string; error: string; skipped: string } {
  const staffTo = to?.trim() || null;
  if (staffTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffTo)) {
    return {
      ok: false,
      invoiceId,
      error: "Recipient email is invalid",
      skipped: "invalid_to",
    };
  }
  return { ok: true, staffTo };
}

/**
 * Staff-triggered portal invoice email (Manual send equivalent) with optional To.
 */
export async function sendPortalInvoiceEmailManually(input: {
  invoiceId: string;
  locale?: string | null;
  to?: string | null;
}): Promise<{
  ok: boolean;
  invoiceId: string;
  kind: "invoice";
  to?: string;
  skipped?: string;
  message?: string;
  error?: string;
}> {
  const invoiceId = input.invoiceId.trim();
  if (!invoiceId) {
    return {
      ok: false,
      invoiceId: "",
      kind: "invoice",
      error: "Invoice id is required",
    };
  }
  const toCheck = validateStaffTo(invoiceId, input.to);
  if (!toCheck.ok) {
    return { ...toCheck, kind: "invoice" };
  }

  const result = await sendPortalInvoiceEmailViaPortal({
    invoiceId,
    locale: input.locale ?? null,
    to: toCheck.staffTo,
  });
  if (!result.ok) {
    return {
      ok: false,
      invoiceId,
      kind: "invoice",
      error: result.error || "Invoice email send failed",
    };
  }

  await registerManualPortalInvoiceForReminders(invoiceId, input.locale, {
    messageId: result.messageId ?? null,
    inboxId: result.inboxId ?? null,
    to: result.email?.trim() || toCheck.staffTo,
  });

  return {
    ok: true,
    invoiceId: result.invoiceId,
    kind: "invoice",
    to: result.email || toCheck.staffTo || undefined,
    skipped: result.skipped,
    message: result.message,
  };
}

/**
 * Staff-triggered reminder: send the next ladder step (or an explicit step)
 * via the portal. Marks the invoice eligible if it was not already.
 */
export async function sendInvoiceReminderManually(input: {
  invoiceId: string;
  locale?: string | null;
  /** Staff-chosen recipient email (optional override of invoice contact). */
  to?: string | null;
  /** Explicit reminder step; when set, allows resending that step. */
  step?: ReminderStep | null;
}): Promise<{
  ok: boolean;
  invoiceId: string;
  kind: "reminder";
  step?: ReminderStep;
  to?: string;
  skipped?: string;
  message?: string;
  error?: string;
}> {
  const invoiceId = input.invoiceId.trim();
  if (!invoiceId) {
    return {
      ok: false,
      invoiceId: "",
      kind: "reminder",
      error: "Invoice id is required",
    };
  }

  const toCheck = validateStaffTo(invoiceId, input.to);
  if (!toCheck.ok) {
    return { ...toCheck, kind: "reminder" };
  }
  const staffTo = toCheck.staffTo;

  await registerManualPortalInvoiceForReminders(invoiceId, input.locale);
  const track = await getOrCreateTrack(invoiceId, input.locale?.trim() || null);

  if (track.cancelledAt && input.step == null) {
    return {
      ok: false,
      invoiceId,
      kind: "reminder",
      skipped: "cancelled",
      error: "Reminders were cancelled for this invoice (paid or stopped)",
    };
  }

  const explicitStep = input.step ?? null;
  const step = explicitStep ?? nextReminderStep(track);
  if (step == null) {
    return {
      ok: false,
      invoiceId,
      kind: "reminder",
      skipped: "all_reminders_sent",
      error: "All reminder steps (1–3) have already been sent",
    };
  }

  ensureReminderScheduler();
  const result = await sendStep({
    invoiceId,
    step,
    locale: input.locale?.trim() || track.locale,
    to: staffTo,
    force: explicitStep != null,
  });

  if (!result.ok) {
    return {
      ok: false,
      invoiceId,
      kind: "reminder",
      step,
      error: result.error || "Reminder send failed",
    };
  }

  return {
    ok: true,
    invoiceId,
    kind: "reminder",
    step,
    to: result.to,
    skipped: result.skipped,
    message: result.message,
  };
}

function scheduleFollowUps(track: ReminderTrack, fromStep: ReminderStep): void {
  const now = Date.now();
  if (fromStep === 1 && !track.sentAt[2] && track.dueAt[2] == null) {
    track.dueAt[2] = now + daysToMs(reminderStep2DelayDays());
  }
  if (fromStep === 2 && !track.sentAt[3] && track.dueAt[3] == null) {
    track.dueAt[3] = now + daysToMs(reminderStep3DelayDays());
  }
}

async function sendStep(input: {
  invoiceId: string;
  step: ReminderStep;
  locale: string | null;
  to?: string | null;
  /** Staff override: resend even when this step was already recorded. */
  force?: boolean;
}): Promise<{
  ok: boolean;
  skipped?: string;
  to?: string;
  message?: string;
  error?: string;
}> {
  const track = await getOrCreateTrack(input.invoiceId, input.locale);
  if (track.cancelledAt && !input.force) {
    return { ok: true, skipped: "cancelled" };
  }
  if (track.sentAt[input.step] && !input.force) {
    return { ok: true, skipped: "already_sent" };
  }
  if (input.force && track.cancelledAt) {
    track.cancelledAt = null;
  }

  const result = await sendPortalInvoiceReminderEmailViaPortal({
    invoiceId: input.invoiceId,
    step: input.step,
    locale: input.locale ?? track.locale,
    to: input.to ?? null,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  track.sentAt[input.step] = new Date().toISOString();
  track.lastStep = input.step;
  delete track.dueAt[input.step as 2 | 3];
  if (!result.skipped) {
    const mailRef = normalizeMailRef({
      messageId: result.messageId,
      inboxId: result.inboxId,
      to: result.email,
    });
    if (mailRefHasValue(mailRef)) {
      track.reminderMail[input.step] = mergeMailRef(
        track.reminderMail[input.step],
        mailRef,
      );
    }
  }

  if (result.skipped === "already_paid") {
    track.dueAt = {};
    track.cancelledAt = new Date().toISOString();
    await persistTrack(input.invoiceId, track);
    return {
      ok: true,
      skipped: "already_paid",
      message: result.message,
    };
  }

  if (result.skipped !== "already_sent") {
    scheduleFollowUps(track, input.step);
  }

  await persistTrack(input.invoiceId, track);

  return {
    ok: true,
    skipped: result.skipped,
    to: result.email || undefined,
    message: result.message,
  };
}

export async function handleMoneybirdLateReminderWebhook(
  payload: MoneybirdWebhookPayload,
): Promise<{
  handled: boolean;
  skipped?: string;
  invoiceId?: string;
  step?: ReminderStep;
  to?: string;
  message?: string;
}> {
  const action = payload.action?.trim();
  if (action !== MONEYBIRD_LATE_ACTION) {
    return { handled: false, skipped: `ignored_action:${action || "none"}` };
  }

  const invoiceId =
    asString(payload.entity_id) || asString(payload.entity?.id);
  if (!invoiceId) {
    throw Object.assign(new Error("Webhook missing sales invoice id"), {
      status: 400,
    });
  }

  const locale = asString(payload.entity?.language);
  const track = await getOrCreateTrack(invoiceId, locale);
  if (!track.eligibleFromManualSend) {
    return {
      handled: true,
      invoiceId,
      skipped: "not_manual_send",
      message: `Skipping reminders for ${invoiceId} — invoice was not sent via Manual / portal invoice email`,
    };
  }

  if (track.cancelledAt) {
    return {
      handled: true,
      invoiceId,
      skipped: "cancelled",
      message: `Reminders cancelled for ${invoiceId}`,
    };
  }

  if (locale && !track.locale) {
    track.locale = locale;
    await persistTrack(invoiceId, track);
  }

  ensureReminderScheduler();

  // Late = overdue. Step 1 fires here; steps 2–3 ride the delay schedule.
  if (track.sentAt[1]) {
    return {
      handled: true,
      invoiceId,
      step: 1,
      skipped: track.sentAt[3]
        ? "all_reminders_sent"
        : "waiting_for_scheduled_reminder",
      message: track.sentAt[3]
        ? `All reminder steps already sent for ${invoiceId}`
        : `Reminder 1 already sent for ${invoiceId}; later steps are scheduled`,
    };
  }

  const result = await sendStep({ invoiceId, step: 1, locale });
  if (!result.ok) {
    throw Object.assign(new Error(result.error || "Reminder send failed"), {
      status: 502,
    });
  }

  return {
    handled: true,
    invoiceId,
    step: 1,
    to: result.to,
    skipped: result.skipped,
    message: result.message,
  };
}

export async function handleMoneybirdPaidCancelReminders(
  payload: MoneybirdWebhookPayload,
): Promise<{ handled: boolean; skipped?: string; invoiceId?: string }> {
  const action = payload.action?.trim();
  if (action !== MONEYBIRD_PAID_ACTION) {
    return { handled: false, skipped: `ignored_action:${action || "none"}` };
  }

  const invoiceId =
    asString(payload.entity_id) || asString(payload.entity?.id);
  if (!invoiceId) {
    return { handled: true, skipped: "missing_invoice_id" };
  }

  const track = await getOrCreateTrack(invoiceId, null);
  track.dueAt = {};
  track.cancelledAt = new Date().toISOString();
  await persistTrack(invoiceId, track);
  return { handled: true, invoiceId, skipped: "cancelled_pending" };
}

async function tickDueReminders(): Promise<void> {
  const now = Date.now();

  if (persistenceEnabled) {
    try {
      const nowDate = new Date(now);
      const dueRows = await db
        .select()
        .from(moneybirdInvoiceReminderTracks)
        .where(
          and(
            eq(moneybirdInvoiceReminderTracks.eligibleFromManualSend, true),
            isNull(moneybirdInvoiceReminderTracks.cancelledAt),
            or(
              and(
                isNotNull(moneybirdInvoiceReminderTracks.dueAt2),
                lte(moneybirdInvoiceReminderTracks.dueAt2, nowDate),
                isNull(moneybirdInvoiceReminderTracks.sentAt2),
              ),
              and(
                isNotNull(moneybirdInvoiceReminderTracks.dueAt3),
                lte(moneybirdInvoiceReminderTracks.dueAt3, nowDate),
                isNull(moneybirdInvoiceReminderTracks.sentAt3),
              ),
            ),
          ),
        );

      for (const row of dueRows) {
        tracks.set(row.invoiceId, rowToTrack(row));
      }
    } catch (error) {
      // Table may not exist yet (migrate runs after first boot) — retry next tick.
      console.error(
        "invoice reminder due query failed",
        error instanceof Error ? error.message : error,
      );
      return;
    }
  }

  for (const [invoiceId, track] of tracks) {
    if (!track.eligibleFromManualSend || track.cancelledAt) continue;
    for (const step of [2, 3] as const) {
      const due = track.dueAt[step];
      if (due == null || due > now || track.sentAt[step]) continue;
      try {
        await sendStep({
          invoiceId,
          step,
          locale: track.locale,
        });
      } catch {
        // Keep dueAt so the next tick retries.
      }
    }
  }
}

/** Start the due-reminder poller once (safe to call repeatedly). */
export function ensureReminderScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const intervalMs = 60_000;
  schedulerTimer = setInterval(() => {
    void tickDueReminders();
  }, intervalMs);
  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}

/**
 * Enable Postgres persistence, hydrate tracks, and start the due poller.
 * Call once from server boot so schedules survive process restarts.
 */
export async function startInvoiceReminderScheduler(): Promise<void> {
  persistenceEnabled = true;
  try {
    await hydrateTracksFromDb();
  } catch (error) {
    console.error(
      "invoice reminder track hydrate failed",
      error instanceof Error ? error.message : error,
    );
  }
  ensureReminderScheduler();
  void tickDueReminders();
}

/** Test helper — reset in-memory state (keeps persistence off). */
export function resetInvoiceReminderStateForTests(): void {
  tracks.clear();
  persistenceEnabled = false;
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
}
