import assert from "node:assert/strict";
import { test } from "node:test";

import { filterTasksByDueFilter } from "../tasks/tasks-due-filters.js";
import {
  buildTaskListMeetingItem,
  getMeetingTaskListHref,
  isMeetingTaskListItem,
} from "./meeting-list-tasks.js";

test("buildTaskListMeetingItem maps schedule and display metadata", () => {
  const row = buildTaskListMeetingItem({
    id: "meet-1",
    number: 3,
    title: "Standup",
    status: "ready_to_start",
    startAt: "2026-07-22T10:00:00.000Z",
    endAt: "2026-07-22T11:00:00.000Z",
    projectId: "proj-1",
    projectName: "BacksterOS",
    projectKey: "BOS",
  });

  assert.equal(row.listKind, "meeting");
  assert.equal(row.meetingDisplayId, "M-3");
  assert.match(row.meetingScheduleLabel ?? "", /Jul/);
  assert.equal(row.dueDate, Date.parse("2026-07-22T10:00:00.000Z"));
  assert.equal(row.dueEndDate, Date.parse("2026-07-22T11:00:00.000Z"));
  assert.equal(isMeetingTaskListItem(row), true);
  assert.equal(getMeetingTaskListHref(row), "/calendar/meetings/meet-1");
});

test("filterTasksByDueFilter includes meetings on matching due tabs only", () => {
  const wednesday = new Date(2026, 6, 22, 12, 0, 0); // Wed Jul 22, 2026
  const tasks = [
    {
      id: "meeting-today",
      dueDate: "2026-07-22T10:00:00.000Z",
      status: "ready_to_start",
      listKind: "meeting",
    },
    {
      id: "meeting-tomorrow",
      dueDate: "2026-07-23T10:00:00.000Z",
      status: "ready_to_start",
      listKind: "meeting",
    },
    {
      id: "meeting-done",
      dueDate: "2026-07-20T10:00:00.000Z",
      status: "completed",
      listKind: "meeting",
    },
  ];

  assert.deepEqual(
    filterTasksByDueFilter(tasks, "today", wednesday).map((task) => task.id),
    ["meeting-today"],
  );
  assert.deepEqual(
    filterTasksByDueFilter(tasks, "tomorrow", wednesday).map((task) => task.id),
    ["meeting-tomorrow"],
  );
  assert.deepEqual(
    filterTasksByDueFilter(tasks, "overdue", wednesday).map((task) => task.id),
    [],
  );
});
