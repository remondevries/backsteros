import assert from "node:assert/strict";
import { test } from "node:test";

import { filterTasksByDueFilter } from "./tasks-due-filters.js";

test("filterTasksByDueFilter keeps completed, canceled, and duplicated in today", () => {
  const wednesday = new Date(2026, 6, 22, 12, 0, 0); // Wed Jul 22, 2026
  const tasks = [
    { id: "active", dueDate: "2026-07-22", status: "in_progress" },
    { id: "done-today", dueDate: "2026-07-22", status: "completed" },
    { id: "canceled-today", dueDate: "2026-07-22", status: "canceled" },
    { id: "dup-today", dueDate: "2026-07-22", status: "duplicated" },
    { id: "done-monday", dueDate: "2026-07-20", status: "completed" },
    { id: "later", dueDate: "2026-07-28", status: "completed" },
  ];

  const filtered = filterTasksByDueFilter(tasks, "today", wednesday);
  assert.deepEqual(
    filtered.map((task) => task.id).sort(),
    ["active", "canceled-today", "done-today", "dup-today"],
  );
});

test("filterTasksByDueFilter includes completed tasks across this-week", () => {
  const wednesday = new Date(2026, 6, 22, 12, 0, 0); // Wed Jul 22, 2026
  const tasks = [
    { id: "active", dueDate: "2026-07-22", status: "in_progress" },
    { id: "done-today", dueDate: "2026-07-22", status: "completed" },
    { id: "canceled-today", dueDate: "2026-07-22", status: "canceled" },
    { id: "dup-today", dueDate: "2026-07-22", status: "duplicated" },
    { id: "done-monday", dueDate: "2026-07-20", status: "completed" },
    { id: "later", dueDate: "2026-07-28", status: "completed" },
  ];

  const filtered = filterTasksByDueFilter(tasks, "this-week", wednesday);
  assert.deepEqual(
    filtered.map((task) => task.id).sort(),
    ["active", "canceled-today", "done-monday", "done-today", "dup-today"],
  );
});

test("filterTasksByDueFilter overdue keeps open past-due tasks only", () => {
  const wednesday = new Date(2026, 6, 22, 12, 0, 0); // Wed Jul 22, 2026
  const tasks = [
    { id: "late-open", dueDate: "2026-07-20", status: "in_progress" },
    { id: "late-done", dueDate: "2026-07-20", status: "completed" },
    { id: "late-canceled", dueDate: "2026-07-19", status: "canceled" },
    { id: "late-dup", dueDate: "2026-07-18", status: "duplicated" },
    { id: "today-open", dueDate: "2026-07-22", status: "ready_to_start" },
    { id: "future-open", dueDate: "2026-07-28", status: "backlog" },
  ];

  const filtered = filterTasksByDueFilter(tasks, "overdue", wednesday);
  assert.deepEqual(
    filtered.map((task) => task.id),
    ["late-open"],
  );
});

test("filterTasksByDueFilter applies due pills to email rows", () => {
  const wednesday = new Date(2026, 6, 22, 12, 0, 0); // Wed Jul 22, 2026
  const tasks = [
    { id: "email-open", dueDate: null, status: "triage", listKind: "email" },
    {
      id: "email-dated",
      dueDate: "2026-07-22",
      status: "triage",
      listKind: "email",
    },
    {
      id: "email-later",
      dueDate: "2026-07-28",
      status: "triage",
      listKind: "email",
    },
    {
      id: "email-done",
      dueDate: "2026-07-20",
      status: "completed",
      listKind: "email",
    },
    {
      id: "email-overdue",
      dueDate: "2026-07-20",
      status: "on_hold",
      listKind: "email",
    },
  ];

  assert.deepEqual(
    filterTasksByDueFilter(tasks, "today", wednesday).map((task) => task.id),
    ["email-dated"],
  );
  assert.deepEqual(
    filterTasksByDueFilter(tasks, "tomorrow", wednesday).map((task) => task.id),
    [],
  );
  assert.deepEqual(
    filterTasksByDueFilter(tasks, "this-week", wednesday)
      .map((task) => task.id)
      .sort(),
    ["email-dated", "email-done", "email-overdue"],
  );
  assert.deepEqual(
    filterTasksByDueFilter(tasks, "next-week", wednesday).map((task) => task.id),
    ["email-later"],
  );
  assert.deepEqual(
    filterTasksByDueFilter(tasks, "overdue", wednesday).map((task) => task.id),
    ["email-overdue"],
  );
});
