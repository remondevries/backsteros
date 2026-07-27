import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeServerTasksWithOptimistic } from "./merge-optimistic-tasks";

type Row = { id: string; status: string; sortOrder: number; title: string };

function row(
  id: string,
  status: string,
  sortOrder: number,
  title = id,
): Row {
  return { id, status, sortOrder, title };
}

describe("mergeServerTasksWithOptimistic", () => {
  it("adopts remote status when local was not edited", () => {
    const previous = [row("a", "triage", 0)];
    const local = [row("a", "triage", 0)];
    const server = [row("a", "done", 0)];

    assert.deepEqual(
      mergeServerTasksWithOptimistic(server, local, previous),
      [row("a", "done", 0)],
    );
  });

  it("keeps local optimistic status while server is still stale", () => {
    const previous = [row("a", "triage", 0)];
    const local = [row("a", "done", 0)];
    const server = [row("a", "triage", 0)];

    assert.deepEqual(
      mergeServerTasksWithOptimistic(server, local, previous),
      [row("a", "done", 0)],
    );
  });

  it("clears optimistic status once server catches up", () => {
    const previous = [row("a", "triage", 0)];
    const local = [row("a", "done", 0)];
    const server = [row("a", "done", 0)];

    assert.deepEqual(
      mergeServerTasksWithOptimistic(server, local, previous),
      [row("a", "done", 0)],
    );
  });

  it("prefers remote when both local and server edited status", () => {
    const previous = [row("a", "triage", 0)];
    const local = [row("a", "in_progress", 0)];
    const server = [row("a", "done", 0)];

    assert.deepEqual(
      mergeServerTasksWithOptimistic(server, local, previous),
      [row("a", "done", 0)],
    );
  });

  it("keeps local-only creates that are not on the server yet", () => {
    const previous = [row("a", "triage", 0)];
    const local = [row("a", "triage", 0), row("local", "triage", 1, "New")];
    const server = [row("a", "triage", 0)];

    assert.deepEqual(
      mergeServerTasksWithOptimistic(server, local, previous),
      [row("a", "triage", 0), row("local", "triage", 1, "New")],
    );
  });

  it("adopts remote field updates while preserving unrelated optimistic sort", () => {
    const previous = [row("a", "triage", 0, "Old")];
    const local = [row("a", "triage", 5, "Old")];
    const server = [row("a", "triage", 0, "Renamed")];

    assert.deepEqual(
      mergeServerTasksWithOptimistic(server, local, previous),
      [row("a", "triage", 5, "Renamed")],
    );
  });
});
