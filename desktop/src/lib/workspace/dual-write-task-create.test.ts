import assert from "node:assert/strict";
import { test } from "node:test";

import { dualWriteTaskCreateAndApplyNumber } from "./dual-write-task-create.ts";

test("dualWriteTaskCreateAndApplyNumber posts with client id and patches SQLite", async () => {
  const patches: Array<Record<string, unknown>> = [];
  const rows: Array<{ id: string; number: number | null }> = [
    { id: "local-1", number: null },
  ];
  const client = {
    requestJson: async (_path: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string };
      assert.equal(body.id, "local-1");
      return { id: "local-1", number: 9, title: "Hello" };
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

  const number = await dualWriteTaskCreateAndApplyNumber(
    client as never,
    powerSync as never,
    {
      id: "local-1",
      body: { title: "Hello", inbox: true },
      setters: [
        ((updater) => {
          const next = updater(rows);
          if (next) rows.splice(0, rows.length, ...next);
        }) as never,
      ],
    },
  );

  assert.equal(number, 9);
  assert.equal(rows[0]?.number, 9);
  assert.deepEqual(patches, [{ number: 9 }]);
});
