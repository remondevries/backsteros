import assert from "node:assert/strict";
import test from "node:test";

import { buildTvTodayCounts } from "./tv-today-counts.js";

/** Fixed instant: 2026-10-24 12:00 UTC → still 2026-10-24 in Europe/Amsterdam. */
const NOW = new Date("2026-10-24T12:00:00.000Z");

test("buildTvTodayCounts: Island order, omit zeros, peel agents from statuses", () => {
  const payload = buildTvTodayCounts({
    now: NOW,
    agentActiveTaskIds: new Set(["t-agent", "t-presence"]),
    tasks: [
      {
        id: "t-triage",
        status: "triage",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-ready-a",
        status: "ready_to_start",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-ready-b",
        status: "ready_to_start",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-progress",
        status: "in_progress",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-agent",
        status: "in_progress",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: "contact-1",
      },
      {
        id: "t-presence",
        status: "in_progress",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-waiting",
        status: "waiting",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-tomorrow",
        status: "ready_to_start",
        dueDate: "2026-10-25T21:59:59.000Z",
        agentWorkingContactId: null,
      },
      {
        id: "t-done",
        status: "completed",
        dueDate: "2026-10-24T21:59:59.000Z",
        agentWorkingContactId: null,
      },
    ],
  });

  assert.deepEqual(payload, {
    dueTodayTotal: 6,
    statuses: [
      { status: "triage", count: 1 },
      { status: "ready_to_start", count: 2 },
      { status: "in_progress", count: 1 },
    ],
    agentsWorking: 2,
  });
  assert.equal(
    payload.dueTodayTotal,
    payload.statuses.reduce((sum, row) => sum + row.count, 0) +
      payload.agentsWorking,
  );
  assert.equal(
    JSON.stringify(payload).includes("t-"),
    false,
    "payload must not include task ids",
  );
});

test("buildTvTodayCounts: durable agentWorkingContactId alone counts as agent-active", () => {
  const payload = buildTvTodayCounts({
    now: NOW,
    agentActiveTaskIds: new Set(),
    tasks: [
      {
        id: "t1",
        status: "in_progress",
        dueDate: "2026-10-24",
        agentWorkingContactId: "ralph",
      },
    ],
  });
  assert.deepEqual(payload, {
    dueTodayTotal: 1,
    statuses: [],
    agentsWorking: 1,
  });
});

test("buildTvTodayCounts: empty when nothing due today", () => {
  const payload = buildTvTodayCounts({
    now: NOW,
    agentActiveTaskIds: new Set(["other"]),
    tasks: [
      {
        id: "t1",
        status: "in_progress",
        dueDate: "2026-10-23T21:59:59.000Z",
        agentWorkingContactId: null,
      },
    ],
  });
  assert.deepEqual(payload, {
    dueTodayTotal: 0,
    statuses: [],
    agentsWorking: 0,
  });
});
