import { sendPortalInvoiceReminderEmailViaPortal } from "./portal-invoice-reminder-email-proxy.js";
import type { MoneybirdWebhookPayload } from "./moneybird-manual-send.js";

export const MONEYBIRD_LATE_ACTION = "sales_invoice_state_changed_to_late";
export const MONEYBIRD_PAID_ACTION = "sales_invoice_state_changed_to_paid";

type ReminderStep = 1 | 2 | 3;

type ReminderTrack = {
  lastStep: 0 | ReminderStep;
  /** ISO times when each step was successfully emailed (or skipped paid). */
  sentAt: Partial<Record<ReminderStep, string>>;
  /** When step 2 / 3 should fire (ms epoch). Cleared when sent or cancelled. */
  dueAt: Partial<Record<2 | 3, number>>;
  locale: string | null;
};

/** In-process reminder ladder state (survives webhook retries; resets on process restart). */
const tracks = new Map<string, ReminderTrack>();

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

function getOrCreateTrack(
  invoiceId: string,
  locale: string | null,
): ReminderTrack {
  const existing = tracks.get(invoiceId);
  if (existing) {
    if (locale && !existing.locale) existing.locale = locale;
    return existing;
  }
  const created: ReminderTrack = {
    lastStep: 0,
    sentAt: {},
    dueAt: {},
    locale,
  };
  tracks.set(invoiceId, created);
  return created;
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
  const track = getOrCreateTrack(input.invoiceId, input.locale);
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
    return {
      ok: true,
      skipped: "already_paid",
      message: result.message,
    };
  }

  if (result.skipped !== "already_sent") {
    scheduleFollowUps(track, input.step);
  }

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
  const track = getOrCreateTrack(invoiceId, locale);

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

  const track = tracks.get(invoiceId);
  if (track) {
    track.dueAt = {};
  }
  return { handled: true, invoiceId, skipped: "cancelled_pending" };
}

async function tickDueReminders(): Promise<void> {
  const now = Date.now();
  for (const [invoiceId, track] of tracks) {
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

/** Test helper — reset in-memory state. */
export function resetInvoiceReminderStateForTests(): void {
  tracks.clear();
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
}
