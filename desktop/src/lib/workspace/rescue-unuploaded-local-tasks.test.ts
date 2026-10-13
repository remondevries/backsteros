import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiClientError } from "@backsteros/api-client";

import { rescueUnuploadedLocalTasks } from "./rescue-unuploaded-local-tasks.ts";

test("rescueUnuploadedLocalTasks applies number when REST already has the row", async () => {
  const patches: Array<Record<string, unknown>> = [];
  const rows: Array<{ id: string; number: number | null; title: string }> = [
    { id: "local-1", number: null, title: "Washing car" },
  ];
  const client = {
    requestJson: async (path: string) => {
      assert.match(path, /\/api\/v1\/tasks\/local-1$/);
      return { id: "local-1", number: 5, title: "Washing car" };
    },
  };
  const powerSync = {
    ready: true,
    patchMetadata: async (
      _table: string,
      _id: string,
      values: Record<string, unknown>,
    ) => {
      patches.push(values);
    },
  };

  const rescued = await rescueUnuploadedLocalTasks(
    client as never,
    powerSync as never,
    rows,
    [
      ((updater) => {
        const next = updater(rows);
        if (next) rows.splice(0, rows.length, ...next);
      }) as never,
    ],
  );

  assert.equal(rescued, 1);
  assert.equal(rows[0]?.number, 5);
  assert.deepEqual(patches, [{ number: 5 }]);
});

test("rescueUnuploadedLocalTasks dual-writes when REST 404s", async () => {
  const patches: Array<Record<string, unknown>> = [];
  const rows: Array<{ id: string; number: number | null; title: string }> = [
    { id: "orphan-1", number: null, title: "Clean up email box" },
  ];
  let posted = false;
  const client = {
    requestJson: async (path: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        posted = true;
        const body = JSON.parse(String(init.body ?? "{}")) as { id?: string };
        assert.equal(body.id, "orphan-1");
        return { id: "orphan-1", number: 16, title: "Clean up email box" };
      }
        throw new ApiClientError(404, { error: "missing", code: "not_found" }, new Headers());
    },
  };
  const powerSync = {
    ready: true,
    patchMetadata: async (
      _table: string,
      _id: string,
      values: Record<string, unknown>,
    ) => {
      patches.push(values);
    },
  };

  const rescued = await rescueUnuploadedLocalTasks(
    client as never,
    powerSync as never,
    rows,
    [
      ((updater) => {
        const next = updater(rows);
        if (next) rows.splice(0, rows.length, ...next);
      }) as never,
    ],
  );

  assert.equal(posted, true);
  assert.equal(rescued, 1);
  assert.equal(rows[0]?.number, 16);
  assert.deepEqual(patches, [{ number: 16 }]);
});
