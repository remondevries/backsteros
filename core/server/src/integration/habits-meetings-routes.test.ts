import assert from "node:assert/strict";
import test from "node:test";

import { db, sqlClient } from "../db/index.js";
import { projects } from "../db/schema.js";
import { createTestWorkspace, testId } from "./test-workspace.js";

test("habits and meetings routes: create, read, update, delete", async (context) => {
  const ws = await createTestWorkspace("habits-meetings");
  context.after(async () => {
    await ws.cleanup();
    await sqlClient.end();
  });

  const projectId = testId("project");
  await db.insert(projects).values({
    id: projectId,
    workspaceId: ws.workspaceId,
    key: "HLT",
    name: "Health",
    status: "active",
    type: "general",
  });

  // Habits
  const habit = await ws.call("POST", "/api/v1/habits", {
    title: "Walk",
    cadence: "daily",
    projectId,
  });
  assert.equal(habit.status, 201, JSON.stringify(habit.body));
  const habitId = String(habit.body?.id);
  assert.equal(habit.body?.title, "Walk");

  const habitList = await ws.call("GET", "/api/v1/habits");
  assert.equal(habitList.status, 200);
  const habitRows = habitList.body?.habits as Array<{ id: string }>;
  assert.ok(habitRows.some((row) => row.id === habitId));

  const patchedHabit = await ws.call("PATCH", `/api/v1/habits/${habitId}`, {
    title: "Walk 5k",
  });
  assert.equal(patchedHabit.status, 200, JSON.stringify(patchedHabit.body));
  assert.equal(patchedHabit.body?.title, "Walk 5k");

  const fetchedHabit = await ws.call("GET", `/api/v1/habits/${habitId}`);
  assert.equal(fetchedHabit.status, 200);
  assert.equal(fetchedHabit.body?.title, "Walk 5k");

  const missingHabit = await ws.call("GET", "/api/v1/habits/does-not-exist");
  assert.equal(missingHabit.status, 404);

  // Meetings
  const meeting = await ws.call("POST", "/api/v1/meetings", {
    title: "Kickoff",
    projectId,
    startAt: "2026-10-26T09:00:00.000Z",
    endAt: "2026-10-26T09:30:00.000Z",
  });
  assert.equal(meeting.status, 201, JSON.stringify(meeting.body));
  const meetingId = String(meeting.body?.id);
  assert.equal(meeting.body?.title, "Kickoff");
  assert.equal(typeof meeting.body?.number, "number");

  const patchedMeeting = await ws.call("PATCH", `/api/v1/meetings/${meetingId}`, {
    title: "Kickoff call",
    format: "video_call",
  });
  assert.equal(patchedMeeting.status, 200, JSON.stringify(patchedMeeting.body));
  assert.equal(patchedMeeting.body?.title, "Kickoff call");

  const meetingList = await ws.call(
    "GET",
    `/api/v1/meetings?projectId=${projectId}`,
  );
  assert.equal(meetingList.status, 200);
  const meetingRows = meetingList.body?.meetings as Array<{ id: string }>;
  assert.deepEqual(
    meetingRows.map((row) => row.id),
    [meetingId],
  );

  const deletedMeeting = await ws.call("DELETE", `/api/v1/meetings/${meetingId}`);
  assert.equal(deletedMeeting.status, 204);
  const missingMeeting = await ws.call("GET", `/api/v1/meetings/${meetingId}`);
  assert.equal(missingMeeting.status, 404);

  const meetingOps = await ws.syncOperations("meeting", meetingId);
  assert.equal(meetingOps[0], "upsert");
  assert.equal(meetingOps.at(-1), "delete");
});
