import assert from "node:assert/strict";
import test from "node:test";

import { mergeLocalAndApiByUpdatedAt } from "./prefer-local-or-api";

test("mergeLocalAndApiByUpdatedAt prefers API when local is empty", () => {
  const api = [
    { id: "a", title: "A", updatedAt: "2026-07-19T10:00:00.000Z" },
  ];
  assert.deepEqual(mergeLocalAndApiByUpdatedAt(null, api), api);
  assert.deepEqual(mergeLocalAndApiByUpdatedAt([], api), api);
});

test("mergeLocalAndApiByUpdatedAt keeps local when API is empty", () => {
  const local = [
    { id: "a", title: "A", updatedAt: "2026-07-19T10:00:00.000Z" },
  ];
  assert.deepEqual(mergeLocalAndApiByUpdatedAt(local, null), local);
  assert.deepEqual(mergeLocalAndApiByUpdatedAt(local, []), local);
});

test("mergeLocalAndApiByUpdatedAt upserts missing and newer API rows", () => {
  const local = [
    { id: "a", title: "Local A", updatedAt: "2026-07-19T10:00:00.000Z" },
    { id: "b", title: "Local B", updatedAt: "2026-07-19T11:00:00.000Z" },
  ];
  const api = [
    { id: "a", title: "API A newer", updatedAt: "2026-07-19T12:00:00.000Z" },
    { id: "c", title: "API C new", updatedAt: "2026-07-19T12:00:00.000Z" },
    { id: "b", title: "API B older", updatedAt: "2026-07-19T10:00:00.000Z" },
  ];
  const merged = mergeLocalAndApiByUpdatedAt(local, api);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((row) => row.id === "a")?.title, "API A newer");
  assert.equal(merged.find((row) => row.id === "b")?.title, "Local B");
  assert.equal(merged.find((row) => row.id === "c")?.title, "API C new");
});
