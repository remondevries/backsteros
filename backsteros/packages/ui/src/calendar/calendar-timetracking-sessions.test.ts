import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaskActivity } from "@backsteros/contracts";

import {
  buildTimetrackingSessionsFromActivities,
  sumTimetrackingSessionSeconds,
} from "./calendar-timetracking-sessions.js";

function activity(
  partial: Pick<TaskActivity, "id" | "type" | "createdAt"> &
    Partial<TaskActivity>,
): TaskActivity {
  return {
    taskId: "task-1",
    actorUserId: null,
    actorContactId: null,
    actorEmail: null,
    actorName: "Jaap",
    data: {},
    ...partial,
  };
}

test("buildTimetrackingSessionsFromActivities pairs start/stop", () => {
  const sessions = buildTimetrackingSessionsFromActivities([
    activity({
      id: "a1",
      type: "timer_started",
      createdAt: "2026-09-17T10:00:00.000Z",
      actorContactId: "contact-1",
    }),
    activity({
      id: "a2",
      type: "timer_stopped",
      createdAt: "2026-09-17T10:05:00.000Z",
      data: { durationSeconds: 300 },
      actorContactId: "contact-1",
    }),
    activity({
      id: "a3",
      type: "timer_started",
      createdAt: "2026-09-17T11:00:00.000Z",
    }),
    activity({
      id: "a4",
      type: "timer_stopped",
      createdAt: "2026-09-17T11:02:00.000Z",
      data: { durationSeconds: 120 },
    }),
  ]);

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0]?.durationSeconds, 120);
  assert.equal(sessions[0]?.isRunning, false);
  assert.equal(sessions[0]?.actorContactId, null);
  assert.equal(sessions[1]?.durationSeconds, 300);
  assert.equal(sessions[1]?.actorContactId, "contact-1");
  assert.equal(sumTimetrackingSessionSeconds(sessions), 420);
});

test("buildTimetrackingSessionsFromActivities keeps actor email", () => {
  const sessions = buildTimetrackingSessionsFromActivities([
    activity({
      id: "a1",
      type: "timer_started",
      createdAt: "2026-09-17T10:00:00.000Z",
      actorName: "Remon",
      actorEmail: "email@remondevries.com",
    }),
    activity({
      id: "a2",
      type: "timer_stopped",
      createdAt: "2026-09-17T10:05:00.000Z",
      data: { durationSeconds: 300 },
      actorName: "Remon",
      actorEmail: "email@remondevries.com",
    }),
  ]);
  assert.equal(sessions[0]?.actorEmail, "email@remondevries.com");
  assert.equal(sessions[0]?.actorName, "Remon");
});

test("buildTimetrackingSessionsFromActivities keeps open start as running", () => {
  const now = Date.parse("2026-09-17T12:10:00.000Z");
  const sessions = buildTimetrackingSessionsFromActivities(
    [
      activity({
        id: "a1",
        type: "timer_started",
        createdAt: "2026-09-17T12:00:00.000Z",
      }),
    ],
    now,
  );
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.isRunning, true);
  assert.equal(sessions[0]?.stoppedAt, null);
  assert.equal(sessions[0]?.durationSeconds, 600);
});

test("buildTimetrackingSessionsFromActivities drops stale unpaired starts", () => {
  const now = Date.parse("2026-09-17T12:00:00.000Z");
  const sessions = buildTimetrackingSessionsFromActivities(
    [
      activity({
        id: "a1",
        type: "timer_started",
        createdAt: "2026-08-24T19:09:44.566Z",
      }),
    ],
    now,
  );
  assert.equal(sessions.length, 0);
});

test("buildTimetrackingSessionsFromActivities omits zero-duration stops", () => {
  const sessions = buildTimetrackingSessionsFromActivities([
    activity({
      id: "a1",
      type: "timer_started",
      createdAt: "2026-08-24T19:09:44.566Z",
    }),
    activity({
      id: "a2",
      type: "timer_stopped",
      createdAt: "2026-09-17T21:00:00.000Z",
      data: { durationSeconds: 0 },
    }),
  ]);
  assert.equal(sessions.length, 0);
});
