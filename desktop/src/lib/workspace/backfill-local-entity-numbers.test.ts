import assert from "node:assert/strict";
import { test } from "node:test";

import { backfillLocalEntityNumbersFromApi } from "./backfill-local-entity-numbers.ts";

test("backfillLocalEntityNumbersFromApi patches SQLite when local number is missing", async () => {
  const patched: Array<{ id: string; values: Record<string, unknown> }> = [];
  const powerSync = {
    ready: true,
    patchMetadata: async (
      _table: string,
      id: string,
      values: Record<string, unknown>,
    ) => {
      patched.push({ id, values });
    },
  };

  const count = await backfillLocalEntityNumbersFromApi(
    powerSync as never,
    "tasks",
    [
      { id: "a", number: null },
      { id: "b", number: 2 },
      { id: "c", number: 0 },
    ],
    [
      { id: "a", number: 11 },
      { id: "b", number: 2 },
      { id: "c", number: 33 },
    ],
  );

  assert.equal(count, 2);
  assert.deepEqual(patched, [
    { id: "a", values: { number: 11 } },
    { id: "c", values: { number: 33 } },
  ]);
});

test("backfillLocalEntityNumbersFromApi no-ops when PowerSync is not ready", async () => {
  const count = await backfillLocalEntityNumbersFromApi(
    { ready: false } as never,
    "tasks",
    [{ id: "a", number: null }],
    [{ id: "a", number: 1 }],
  );
  assert.equal(count, 0);
});
