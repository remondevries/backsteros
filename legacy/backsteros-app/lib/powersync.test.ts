import assert from "node:assert/strict";
import test from "node:test";

import {
  BacksterPowerSyncConnector,
  mapCrudBatch,
  powerSyncMutationId,
} from "./powersync";

test("maps PowerSync CRUD batches without changing operation semantics", () => {
  assert.deepEqual(
    mapCrudBatch([
      { table: "tasks", op: "PATCH", id: "task-1", opData: { status: "completed" } },
      { table: "contacts", op: "DELETE", id: "contact-1" },
    ]),
    [
      { table: "tasks", op: "PATCH", id: "task-1", data: { status: "completed" } },
      { table: "contacts", op: "DELETE", id: "contact-1" },
    ],
  );
});

test("builds a stable retry id from device and persisted CRUD ids", () => {
  const crud = [{ clientId: 41 }, { clientId: 42 }];
  assert.equal(powerSyncMutationId("device-a", crud), "ps:device-a:41:42");
  assert.equal(powerSyncMutationId("device-a", crud), "ps:device-a:41:42");
});

test("connector refuses credentials after the Clerk session is cleared", async () => {
  const connector = new BacksterPowerSyncConnector(
    "https://api.example.test",
    async () => null,
    "device-a",
  );
  await assert.rejects(connector.fetchCredentials(), /Sign in to connect/);
});

test("connector refreshes credentials through the Clerk-authenticated API", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ endpoint: "https://sync.example.test", token: "short-lived" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const connector = new BacksterPowerSyncConnector(
    "https://api.example.test/api/v1",
    async () => "clerk-session",
    "device-a",
  );
  await connector.fetchCredentials();
  await connector.fetchCredentials();
  assert.deepEqual(calls, [
    "https://api.example.test/api/v1/powersync/token",
    "https://api.example.test/api/v1/powersync/token",
  ]);
});

test("connector uploads a batch once and completes it after acknowledgement", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  let completed = 0;
  const database = {
    getCrudBatch: async () => ({
      crud: [
        { table: "tasks", op: "PUT" as const, id: "task-1", clientId: 7, opData: { title: "Offline" } },
        { table: "tasks", op: "DELETE" as const, id: "task-2", clientId: 8 },
      ],
      complete: async () => {
        completed += 1;
      },
    }),
  };
  const connector = new BacksterPowerSyncConnector(
    "https://api.example.test/api/v1",
    async () => "clerk-session",
    "device-a",
  );

  await connector.uploadData(database as never);

  assert.equal(request?.method, "POST");
  assert.equal(new Headers(request?.headers).get("authorization"), "Bearer clerk-session");
  assert.deepEqual(JSON.parse(String(request?.body)), {
    device_id: "device-a",
    mutation_id: "ps:device-a:7:8",
    batch: [
      { table: "tasks", op: "PUT", id: "task-1", data: { title: "Offline" } },
      { table: "tasks", op: "DELETE", id: "task-2" },
    ],
  });
  assert.equal(completed, 1);
});

test("connector preserves a failed batch for retry", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("temporary failure", { status: 503 });
  let completed = false;
  const connector = new BacksterPowerSyncConnector(
    "https://api.example.test",
    async () => "clerk-session",
    "device-a",
  );
  const database = {
    getCrudBatch: async () => ({
      crud: [{ table: "projects", op: "PATCH" as const, id: "project-1", clientId: 9, opData: { name: "Retry" } }],
      complete: async () => {
        completed = true;
      },
    }),
  };

  await assert.rejects(connector.uploadData(database as never), /503.*temporary failure/);
  assert.equal(completed, false);
});
