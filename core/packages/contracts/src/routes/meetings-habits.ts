import { initContract, type AppRouter } from "@ts-rest/core";
import {
  badRequestSchema,
  errorSchema,
  whoopDayResultSchema,
  whoopSettingsStatusSchema,
} from "../schemas.js";
import * as s from "../schemas.js";
import { z } from "zod";

const c = initContract();

/** Meetings, habits and WHOOP. */
export const meetingsHabitsRoutes: AppRouter = c.router({
  listHabits: {
    method: "GET",
    path: "/api/v1/habits",
    responses: {
      200: z.object({ habits: z.array(s.habitSchema) }),
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List habits and ensure today's tasks exist",
  },
  getHabit: {
    method: "GET",
    path: "/api/v1/habits/:id",
    pathParams: s.idParamsSchema,
    responses: {
      200: s.habitSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get a habit and ensure today's task exists",
  },
  createHabit: {
    method: "POST",
    path: "/api/v1/habits",
    body: s.createHabitSchema,
    responses: {
      201: s.habitSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Create a habit and today's Health-project task",
  },
  updateHabit: {
    method: "PATCH",
    path: "/api/v1/habits/:id",
    pathParams: s.idParamsSchema,
    body: s.updateHabitSchema,
    responses: {
      200: s.habitSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update a habit and refresh today's task",
  },
  recordHabitDay: {
    method: "POST",
    path: "/api/v1/habits/:id/days",
    pathParams: s.idParamsSchema,
    body: s.recordHabitDaySchema,
    responses: {
      200: s.taskSchema,
      201: s.taskSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Create or update a habit day as completed or skipped",
  },
  listMeetings: {
    method: "GET",
    path: "/api/v1/meetings",
    query: s.listMeetingsQuerySchema,
    responses: {
      200: z.union([
        z.object({ meetings: z.array(s.meetingSchema) }),
        s.listPaginatedResponseSchema(s.meetingSchema),
      ]),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List workspace meetings (filters + paginated=true for { items, nextCursor })",
  },
  getMeeting: {
    method: "GET",
    path: "/api/v1/meetings/:id",
    pathParams: s.idParamsSchema,
    responses: {
      200: s.meetingSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get a meeting",
  },
  createMeeting: {
    method: "POST",
    path: "/api/v1/meetings",
    body: s.createMeetingSchema,
    responses: {
      201: s.meetingSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Create a meeting",
  },
  updateMeeting: {
    method: "PATCH",
    path: "/api/v1/meetings/:id",
    pathParams: s.idParamsSchema,
    body: s.updateMeetingSchema,
    responses: {
      200: s.meetingSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update a meeting",
  },
  deleteMeeting: {
    method: "DELETE",
    path: "/api/v1/meetings/:id",
    pathParams: s.idParamsSchema,
    responses: {
      204: z.void(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Delete a meeting",
  },
  getWhoopDay: {
    method: "GET",
    path: "/api/v1/whoop/day",
    query: z.object({ date: z.string().date() }),
    responses: {
      200: whoopDayResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Fetch Whoop sleep, recovery, and strain for a calendar day",
  },
  getWhoopStatus: {
    method: "GET",
    path: "/api/v1/whoop/status",
    responses: {
      200: whoopSettingsStatusSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Whoop connection status from local totem.env",
  },
});
