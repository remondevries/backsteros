import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createMeetingBookingSchema,
  listMeetingSlotsQuerySchema,
} from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import * as schedulingService from "../services/meeting-scheduling.js";
import { pushInboxTriageForMeeting } from "../services/inbox-triage-push-triggers.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function forbidden() {
  return { error: "Forbidden", code: "forbidden" as const };
}

function notFound(resource: string) {
  return { error: `${resource} not found`, code: "not_found" as const };
}

function getAuth(c: { get: (key: "auth") => AuthContext | undefined }) {
  return c.get("auth");
}

function bookingErrorStatus(message: string): 400 | 404 | 409 {
  if (message === "SCHEDULING_DISABLED") return 404;
  if (message === "SLOT_UNAVAILABLE") return 409;
  return 400;
}

export function registerPublicSchedulingRoutes(app: Hono) {
  app.get("/api/v1/public/meeting-scheduling", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }

    const settings = await schedulingService.getSchedulingSettings(
      auth!.workspaceId,
    );
    if (!settings) {
      return c.json(notFound("Meeting scheduling"), 404);
    }
    return c.json(settings);
  });

  app.get(
    "/api/v1/public/meeting-scheduling/slots",
    zValidator("query", listMeetingSlotsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:read")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      const settings = await schedulingService.getSchedulingSettings(
        auth!.workspaceId,
      );
      if (!settings) {
        return c.json(notFound("Meeting scheduling"), 404);
      }

      const query = c.req.valid("query");
      const slots = await schedulingService.listMeetingSlots(
        auth!.workspaceId,
        query,
      );
      return c.json({ slots });
    },
  );

  app.post(
    "/api/v1/public/meeting-scheduling/bookings",
    zValidator("json", createMeetingBookingSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }

      try {
        const meeting = await schedulingService.createMeetingBooking(
          auth!.workspaceId,
          c.req.valid("json"),
        );
        void pushInboxTriageForMeeting(auth!.workspaceId, meeting).catch(
          (error) => {
            console.warn(
              "inbox triage meeting push failed:",
              error instanceof Error ? error.message : error,
            );
          },
        );
        return c.json(
          {
            meeting,
            displayId: schedulingService.meetingDisplayIdFromMeeting(meeting),
          },
          201,
        );
      } catch (error) {
        if (error instanceof Error) {
          const status = bookingErrorStatus(error.message);
          if (error.message === "SCHEDULING_DISABLED") {
            return c.json(notFound("Meeting scheduling"), status);
          }
          if (error.message === "SLOT_UNAVAILABLE") {
            return c.json(
              {
                error: "That time is no longer available.",
                code: "slot_unavailable" as const,
              },
              status,
            );
          }
          if (
            error.message === "INVALID_MEETING_DATES" ||
            error.message === "MEETING_END_BEFORE_START" ||
            error.message === "INVALID_SLOT_DURATION"
          ) {
            return c.json(
              {
                error: "Invalid meeting time.",
                code: "invalid_meeting_dates" as const,
              },
              status,
            );
          }
        }
        throw error;
      }
    },
  );
}
