import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiClientError } from "@backsteros/api-client";

import {
  isRetryableEntityNumberLookupError,
  metadataTableFromEntityFetchPath,
  resolveEntityNumberAfterLocalCreate,
} from "./resolve-entity-number-after-local-create.ts";

test("metadataTableFromEntityFetchPath maps entity REST paths", () => {
  assert.equal(
    metadataTableFromEntityFetchPath("/api/v1/tasks/abc"),
    "tasks",
  );
  assert.equal(
    metadataTableFromEntityFetchPath("/api/v1/letters/xyz"),
    "letters",
  );
  assert.equal(
    metadataTableFromEntityFetchPath("/api/v1/meetings/m1"),
    "meetings",
  );
  assert.equal(
    metadataTableFromEntityFetchPath("/api/v1/contacts/c1"),
    "contacts",
  );
  assert.equal(
    metadataTableFromEntityFetchPath("/api/v1/organizations/o1"),
    "organizations",
  );
  assert.equal(metadataTableFromEntityFetchPath("/api/v1/unknown/x"), null);
  assert.equal(metadataTableFromEntityFetchPath("/other"), null);
});

test("isRetryableEntityNumberLookupError retries auth and not-found", () => {
  const headers = new Headers();
  assert.equal(
    isRetryableEntityNumberLookupError(
      new ApiClientError(401, { error: "unauthorized" }, headers),
    ),
    true,
  );
  assert.equal(
    isRetryableEntityNumberLookupError(
      new ApiClientError(404, { error: "missing" }, headers),
    ),
    true,
  );
  assert.equal(
    isRetryableEntityNumberLookupError(
      new ApiClientError(400, { error: "nope" }, headers),
    ),
    false,
  );
  assert.equal(isRetryableEntityNumberLookupError(new Error("network")), true);
});

test("resolveEntityNumberAfterLocalCreate polls through 401 then applies number", async () => {
  let calls = 0;
  const headers = new Headers();
  const client = {
    requestJson: async () => {
      calls += 1;
      if (calls < 3) {
        throw new ApiClientError(401, { error: "unauthorized" }, headers);
      }
      return { number: 42 };
    },
  };
  const patches: Array<Record<string, unknown>> = [];
  const rows: Array<{ id: string; number: number | null }> = [
    { id: "t1", number: null },
  ];
  const setRows = (
    updater: (
      current: typeof rows | null,
    ) => typeof rows | null,
  ) => {
    const next = updater(rows);
    if (next) {
      rows.splice(0, rows.length, ...next);
    }
  };
  const powerSync = {
    ready: true,
    connected: true,
    flushCrudUpload: async () => true,
    patchMetadata: async (
      _table: string,
      _id: string,
      values: Record<string, unknown>,
    ) => {
      patches.push(values);
    },
  };

  const number = await resolveEntityNumberAfterLocalCreate(
    client as never,
    powerSync as never,
    "/api/v1/tasks/t1",
    "t1",
    setRows as never,
  );

  assert.equal(number, 42);
  assert.equal(rows[0]?.number, 42);
  assert.deepEqual(patches, [{ number: 42 }]);
  assert.ok(calls >= 3);
});

test("resolveEntityNumberAfterLocalCreate still polls when flush fails", async () => {
  const client = {
    requestJson: async () => ({ number: 7 }),
  };
  const powerSync = {
    ready: true,
    connected: true,
    flushCrudUpload: async () => {
      throw new Error("upload busy");
    },
    patchMetadata: async () => {},
  };
  let applied: number | null = null;
  const number = await resolveEntityNumberAfterLocalCreate(
    client as never,
    powerSync as never,
    "/api/v1/tasks/t2",
    "t2",
    ((updater: (rows: Array<{ id: string; number: number | null }> | null) => Array<{ id: string; number: number | null }> | null) => {
      const next = updater([{ id: "t2", number: null }]);
      applied = next?.[0]?.number ?? null;
    }) as never,
  );
  assert.equal(number, 7);
  assert.equal(applied, 7);
});
