import { and, eq, gt, isNull, lte } from "drizzle-orm";

import type { MeetingAttendeePortalEmails } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { meetings } from "../db/schema.js";
import { appendOpsLog } from "../lib/ops-log-buffer.js";
import { contactIdsDueForPortalReminder } from "../lib/meeting-portal-reminder-eligibility.js";
import { sendPortalMeetingEmailViaPortal } from "../lib/portal-meeting-email-proxy.js";
import { publishMeetingWorkspaceUpdated } from "../lib/workspace-events.js";
import { notifyPeerOfDocumentWrite } from "./core-replication/nudge.js";
import {
  isHybridScheduledJobExplicitlyDisabled,
  shouldRunHybridScheduledJob,
} from "./core-replication/scheduled-job-leadership.js";
import * as meetingService from "./meetings.js";
import { recordMeetingRestSyncEvent } from "./sync.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const SKIP_MEETING_STATUSES = new Set(["cancelled", "canceled", "duplicated"]);
const REMINDER_SCHEDULER_DISABLED_ENV = "MEETING_PORTAL_REMINDER_SCHEDULER";

/** @deprecated Prefer shouldRunHybridScheduledJob — kept for hybrid-write-bar regression. */
export function shouldRunMeetingPortalReminderScheduler(): boolean {
  return !isHybridScheduledJobExplicitlyDisabled(REMINDER_SCHEDULER_DISABLED_ENV);
}

function reminderLeadMs(): number {
  const raw = process.env.MEETING_PORTAL_REMINDER_LEAD_MS?.trim();
  if (!raw) return ONE_HOUR_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ONE_HOUR_MS;
}

export async function publishMeetingPortalEmailSideEffects(
  workspaceId: string,
  meetingId: string,
  projectId: string | null,
): Promise<void> {
  const dbRow = await meetingService.getMeetingRow(workspaceId, meetingId);
  if (dbRow) {
    await recordMeetingRestSyncEvent(workspaceId, dbRow, "upsert");
  }
  publishMeetingWorkspaceUpdated(workspaceId, meetingId, {
    projectId,
    operation: "upsert",
  });
  notifyPeerOfDocumentWrite({
    workspaceId,
    reason: "meeting",
    entity: "meeting",
    entityId: meetingId,
    operation: "upsert",
    projectId,
  });
}

export type SendMeetingPortalEmailResult =
  | {
      ok: true;
      email: string;
      message: string;
      attendeePortalEmails: MeetingAttendeePortalEmails;
    }
  | { ok: false; error: string; code: string; status: number };

export async function sendMeetingPortalEmailToAttendee(input: {
  workspaceId: string;
  meetingId: string;
  contactId: string;
  kind: "invite" | "reminder";
}): Promise<SendMeetingPortalEmailResult> {
  const meeting = await meetingService.getMeetingById(
    input.workspaceId,
    input.meetingId,
  );
  if (!meeting) {
    return {
      ok: false,
      error: "Meeting not found",
      code: "not_found",
      status: 404,
    };
  }
  if (meeting.format !== "video_call") {
    return {
      ok: false,
      error: "Meeting emails are only supported for video calls",
      code: "meeting_not_video_call",
      status: 400,
    };
  }
  if (!meeting.attendeeContactIds.includes(input.contactId)) {
    return {
      ok: false,
      error: "Contact is not an attendee on this meeting",
      code: "contact_not_attendee",
      status: 400,
    };
  }

  const result = await sendPortalMeetingEmailViaPortal({
    meetingId: input.meetingId,
    contactId: input.contactId,
    kind: input.kind,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      code: "portal_meeting_email_failed",
      status: result.status,
    };
  }

  const updated = await meetingService.recordAttendeePortalEmail(
    input.workspaceId,
    input.meetingId,
    input.contactId,
    input.kind,
  );
  if (!updated) {
    return {
      ok: false,
      error: "Meeting not found",
      code: "not_found",
      status: 404,
    };
  }

  await publishMeetingPortalEmailSideEffects(
    input.workspaceId,
    input.meetingId,
    updated.projectId ?? null,
  );

  return {
    ok: true,
    email: result.email,
    message: result.message,
    attendeePortalEmails: updated.attendeePortalEmails,
  };
}

export async function runDueMeetingPortalReminders(): Promise<number> {
  if (!(await shouldRunHybridScheduledJob(REMINDER_SCHEDULER_DISABLED_ENV))) {
    return 0;
  }

  const now = new Date();
  const leadMs = reminderLeadMs();
  const windowEnd = new Date(now.getTime() + leadMs);

  const rows = await db
    .select()
    .from(meetings)
    .where(
      and(
        isNull(meetings.deletedAt),
        eq(meetings.format, "video_call"),
        gt(meetings.startAt, now),
        lte(meetings.startAt, windowEnd),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    const status = row.status?.trim().toLowerCase() ?? "";
    if (SKIP_MEETING_STATUSES.has(status)) continue;

    const dueContactIds = contactIdsDueForPortalReminder(
      {
        startAt: row.startAt,
        attendeeContactIds: row.attendeeContactIds,
        attendeePortalEmails: row.attendeePortalEmails,
      },
      now,
      leadMs,
    );
    for (const contactId of dueContactIds) {
      try {
        const outcome = await sendMeetingPortalEmailToAttendee({
          workspaceId: row.workspaceId,
          meetingId: row.id,
          contactId,
          kind: "reminder",
        });
        if (outcome.ok) {
          sent += 1;
          appendOpsLog(
            "info",
            "meeting portal reminder sent",
            `${row.id} → ${contactId}`,
          );
        } else {
          appendOpsLog(
            "warn",
            "meeting portal reminder failed",
            `${row.id} → ${contactId}: ${outcome.error}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendOpsLog(
          "error",
          "meeting portal reminder failed",
          `${row.id} → ${contactId}: ${message}`,
        );
        console.error("meeting portal reminder failed", row.id, contactId, error);
      }
    }
  }
  return sent;
}

let reminderTimer: ReturnType<typeof setInterval> | null = null;

export function startMeetingPortalReminderScheduler(
  intervalMs = 60_000,
): void {
  if (reminderTimer) return;
  if (
    isHybridScheduledJobExplicitlyDisabled(REMINDER_SCHEDULER_DISABLED_ENV)
  ) {
    appendOpsLog("info", "meeting portal reminder scheduler disabled");
    return;
  }
  const tick = () => {
    void runDueMeetingPortalReminders().catch((error) => {
      console.error("meeting portal reminder scheduler tick failed", error);
      appendOpsLog(
        "error",
        "meeting portal reminder scheduler tick failed",
        error instanceof Error ? error.message : String(error),
      );
    });
  };
  tick();
  reminderTimer = setInterval(tick, intervalMs);
  appendOpsLog(
    "info",
    "meeting portal reminder scheduler started (local-primary, cloud fallback)",
  );
}

export function stopMeetingPortalReminderScheduler(): void {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}
