import {
  ListQueryError,
  MEETINGS_LIST_PAGINATED_ONLY_KEYS,
  buildMeetingRestPayload,
  can,
  collectQueryParams,
  commitRestEntityWrite,
  createMeetingSchema,
  forbidden,
  getAuth,
  ignoredLegacyListKeys,
  isForeignKeyViolation,
  isRestLeaderFirstWrite,
  listQueryErrorBody,
  meetingExternalCalendarHttpError,
  meetingSchedulingService,
  meetingService,
  newId,
  notFound,
  parseMeetingsListQuery,
  proxyErrorStatus,
  publishMeetingLive,
  recordMeetingDerivedCrmActivityRestSyncEvents,
  recordMeetingRestSyncEvent,
  requireResolvedRef,
  updateMeetingSchedulingSettingsSchema,
  updateMeetingSchema,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Meetings and meeting scheduling settings. */
export function registerMeetingsRoutes(app: Hono) {
  app.get("/api/v1/meetings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseMeetingsListQuery(raw);
      parsed = {
        ...parsed,
        projectId: await requireResolvedRef(
          auth.workspaceId,
          parsed.projectId,
          "projectId",
        ),
        organizationId: await requireResolvedRef(
          auth.workspaceId,
          parsed.organizationId,
          "organizationId",
        ),
        contactId: await requireResolvedRef(
          auth.workspaceId,
          parsed.contactId,
          "contactId",
        ),
      };
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      const ignored = ignoredLegacyListKeys(
        raw,
        MEETINGS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      return c.json({
        meetings: await meetingService.listMeetings(auth.workspaceId, parsed),
      });
    }

    return c.json(
      await meetingService.listMeetingsPaginated(auth.workspaceId, parsed),
    );
  });

  app.get("/api/v1/meetings/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read")) return c.json(forbidden(), 403);
    const row = await meetingService.getMeetingById(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Meeting"), 404);
    return c.json(row);
  });

  app.post(
    "/api/v1/meetings",
    zValidator("json", createMeetingSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const body = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const meetingId = body.id?.trim() || newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "meeting",
            entityId: meetingId,
            operation: "upsert",
            payload: buildMeetingRestPayload(meetingId, body),
          });
          const dbRow = await meetingService.getMeetingRow(
            auth.workspaceId,
            meetingId,
          );
          if (!dbRow) {
            throw new Error("MEETING_CREATE_FAILED");
          }
          const row = await meetingService.getMeetingById(auth.workspaceId, meetingId);
          if (row) {
            publishMeetingLive(auth, row.id, {
              projectId: row.projectId ?? null,
              operation: "upsert",
            });
          }
          return c.json(row, 201);
        }
        const row = await meetingService.createMeeting(
          auth.workspaceId,
          body,
        );
        const dbRow = await meetingService.getMeetingRow(
          auth.workspaceId,
          row.id,
        );
        if (dbRow) {
          await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "upsert");
          await recordMeetingDerivedCrmActivityRestSyncEvents(
            auth.workspaceId,
            dbRow.id,
          );
        }
        publishMeetingLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
        return c.json(row, 201);
      } catch (error) {
        const linkError = meetingExternalCalendarHttpError(error);
        if (linkError) return c.json(linkError.body, linkError.status);
        if (isForeignKeyViolation(error)) {
          return c.json(
            {
              error: {
                code: "unknown_external_calendar_event",
                message:
                  "No synced Google Calendar event matches this id. Sync Google Calendar first, or pass the stored Backster event id.",
              },
            },
            422,
          );
        }
        if (
          error instanceof Error &&
          (error.message === "INVALID_MEETING_DATES" ||
            error.message === "MEETING_END_BEFORE_START")
        ) {
          return c.json(
            {
              error: {
                code: "INVALID_MEETING_DATES",
                message: "Meeting end must be after start.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/meetings/:id",
    zValidator("json", updateMeetingSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
      try {
        const meetingId = c.req.param("id");
        const patch = c.req.valid("json");
        if (isRestLeaderFirstWrite()) {
          const existing = await meetingService.getMeetingRow(
            auth.workspaceId,
            meetingId,
          );
          if (!existing) return c.json(notFound("Meeting"), 404);
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "meeting",
            entityId: meetingId,
            operation: "upsert",
            payload: buildMeetingRestPayload(meetingId, patch),
          });
          const row = await meetingService.getMeetingById(auth.workspaceId, meetingId);
          if (row) {
            publishMeetingLive(auth, row.id, {
              projectId: row.projectId ?? null,
              operation: "upsert",
            });
          }
          return c.json(row);
        }
        const row = await meetingService.updateMeeting(
          auth.workspaceId,
          meetingId,
          patch,
        );
        if (!row) return c.json(notFound("Meeting"), 404);
        const dbRow = await meetingService.getMeetingRow(
          auth.workspaceId,
          row.id,
        );
        if (dbRow) {
          await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "upsert");
          await recordMeetingDerivedCrmActivityRestSyncEvents(
            auth.workspaceId,
            dbRow.id,
          );
        }
        publishMeetingLive(auth, row.id, {
          projectId: row.projectId ?? null,
          operation: "upsert",
        });
        return c.json(row);
      } catch (error) {
        const linkError = meetingExternalCalendarHttpError(error);
        if (linkError) return c.json(linkError.body, linkError.status);
        if (isForeignKeyViolation(error)) {
          return c.json(
            {
              error: {
                code: "unknown_external_calendar_event",
                message:
                  "No synced Google Calendar event matches this id. Sync Google Calendar first, or pass the stored Backster event id.",
              },
            },
            422,
          );
        }
        if (
          error instanceof Error &&
          (error.message === "INVALID_MEETING_DATES" ||
            error.message === "MEETING_END_BEFORE_START")
        ) {
          return c.json(
            {
              error: {
                code: "INVALID_MEETING_DATES",
                message: "Meeting end must be after start.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );

  app.post("/api/v1/meetings/:id/send-invite", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const meetingId = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as {
      contactId?: string;
    } | null;
    const contactId = body?.contactId?.trim() ?? "";
    if (!contactId) {
      return c.json({ error: "contactId is required" }, 400);
    }
    const meeting = await meetingService.getMeetingById(
      auth.workspaceId,
      meetingId,
    );
    if (!meeting) return c.json(notFound("Meeting"), 404);
    if (meeting.format !== "video_call") {
      return c.json(
        {
          error: "Meeting emails are only supported for video calls",
          code: "meeting_not_video_call",
        },
        400,
      );
    }
    if (!meeting.attendeeContactIds.includes(contactId)) {
      return c.json(
        {
          error: "Contact is not an attendee on this meeting",
          code: "contact_not_attendee",
        },
        400,
      );
    }
    const { sendMeetingPortalEmailToAttendee } = await import(
      "../../services/meeting-portal-emails.js"
    );
    const result = await sendMeetingPortalEmailToAttendee({
      workspaceId: auth.workspaceId,
      meetingId,
      contactId,
      kind: "invite",
    });
    if (!result.ok) {
      if (result.code === "not_found") {
        return c.json(notFound("Meeting"), 404);
      }
      return c.json(
        { error: result.error, code: result.code },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
      attendeePortalEmails: result.attendeePortalEmails,
    });
  });

  app.post("/api/v1/meetings/:id/send-reminder", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const meetingId = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as {
      contactId?: string;
    } | null;
    const contactId = body?.contactId?.trim() ?? "";
    if (!contactId) {
      return c.json({ error: "contactId is required" }, 400);
    }
    const meeting = await meetingService.getMeetingById(
      auth.workspaceId,
      meetingId,
    );
    if (!meeting) return c.json(notFound("Meeting"), 404);
    if (meeting.format !== "video_call") {
      return c.json(
        {
          error: "Meeting emails are only supported for video calls",
          code: "meeting_not_video_call",
        },
        400,
      );
    }
    if (!meeting.attendeeContactIds.includes(contactId)) {
      return c.json(
        {
          error: "Contact is not an attendee on this meeting",
          code: "contact_not_attendee",
        },
        400,
      );
    }
    const { sendMeetingPortalEmailToAttendee } = await import(
      "../../services/meeting-portal-emails.js"
    );
    const result = await sendMeetingPortalEmailToAttendee({
      workspaceId: auth.workspaceId,
      meetingId,
      contactId,
      kind: "reminder",
    });
    if (!result.ok) {
      if (result.code === "not_found") {
        return c.json(notFound("Meeting"), 404);
      }
      return c.json(
        { error: result.error, code: result.code },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
      attendeePortalEmails: result.attendeePortalEmails,
    });
  });

  app.delete("/api/v1/meetings/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:write")) return c.json(forbidden(), 403);
    const meetingId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await meetingService.getMeetingRow(
        auth.workspaceId,
        meetingId,
      );
      if (!existing) return c.json(notFound("Meeting"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "meeting",
        entityId: meetingId,
        operation: "delete",
        payload: { id: meetingId },
      });
      publishMeetingLive(auth, meetingId, {
        projectId: existing.projectId ?? null,
        operation: "delete",
      });
      return c.body(null, 204);
    }
    const dbRow = await meetingService.deleteMeetingRow(
      auth.workspaceId,
      meetingId,
    );
    if (!dbRow) return c.json(notFound("Meeting"), 404);
    await recordMeetingRestSyncEvent(auth.workspaceId, dbRow, "delete");
    await recordMeetingDerivedCrmActivityRestSyncEvents(
      auth.workspaceId,
      dbRow.id,
    );
    publishMeetingLive(auth, meetingId, {
      projectId: dbRow.projectId ?? null,
      operation: "delete",
    });
    return c.body(null, 204);
  });

  app.get("/api/v1/meeting-scheduling/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await meetingSchedulingService.getOrCreateSchedulingSettings(
        auth.workspaceId,
      ),
    );
  });

  app.patch(
    "/api/v1/meeting-scheduling/settings",
    zValidator("json", updateMeetingSchedulingSettingsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      return c.json(
        await meetingSchedulingService.updateSchedulingSettings(
          auth.workspaceId,
          c.req.valid("json"),
        ),
      );
    },
  );
}
