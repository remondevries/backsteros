import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  moneybirdInvoiceReminderTracks,
  type DbMoneybirdInvoiceReminderTrack,
} from "../db/schema.js";
import { sendPortalInvoiceReminderEmailViaPortal } from "./portal-invoice-reminder-email-proxy.js";
import type { MoneybirdWebhookPayload } from "./moneybird-manual-send.js";

export const MONEYBIRD_LATE_ACTION = "sales_invoice_state_changed_to_late";
export const MONEYBIRD_PAID_ACTION = "sales_invoice_state_changed_to_paid";

type ReminderStep = 1 | 2 | 3;

type ReminderTrack = {
  /** Only invoices that received the Manual → portal invoice email. */
  eligibleFromManualSend: boolean;
  lastStep: 0 | ReminderStep;
  /** ISO times when each step was successfully emailed (or skipped paid). */
  sentAt: Partial<Record<ReminderStep, string>>;
  /** When step 2 / 3 should fire (ms epoch). Cleared when sent or cancelled. */
  dueAt: Partial<Record<2 | 3, number>>;
  locale: string | null;
  cancelledAt: string | null;
};

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
    lastStep: 0,
    sentAt: {},
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
  const dueAt: ReminderTrack["dueAt"] = {};
  if (row.dueAt2) dueAt[2] = row.dueAt2.getTime();
  if (row.dueAt3) dueAt[3] = row.dueAt3.getTime();
  const lastStep =
    row.lastStep === 1 || row.lastStep === 2 || row.lastStep === 3
      ? row.lastStep
      : 0;
  return {
    eligibleFromManualSend: row.eligibleFromManualSend,
    lastStep,
    sentAt,
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
): Promise<void> {
  const id = invoiceId.trim();
  if (!id) return;
  const track = await getOrCreateTrack(id, locale?.trim() || null);
  track.eligibleFromManualSend = true;
  track.cancelledAt = null;
  if (locale?.trim()) track.locale = locale.trim();
  await persistTrack(id, track);
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
}): Promise<{
  ok: boolean;
  skipped?: string;
  to?: string;
  message?: string;
  error?: string;
}> {
  const track = await getOrCreateTrack(input.invoiceId, input.locale);
  if (track.cancelledAt) {
    return { ok: true, skipped: "cancelled" };
  }
  if (track.sentAt[input.step]) {
    return { ok: true, skipped: "already_sent" };
  }

  const result = await sendPortalInvoiceReminderEmailViaPortal({
    invoiceId: input.invoiceId,
    step: input.step,
    locale: input.locale ?? track.locale,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  track.sentAt[input.step] = new Date().toISOString();
  track.lastStep = input.step;
  delete track.dueAt[input.step as 2 | 3];

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
