import assert from "node:assert/strict";
import { test } from "node:test";

import { startEmailInboxEventsLoop } from "./email-inbox-events.ts";
import { startAgentPresenceEventsLoop } from "./agent/agent-presence-events.ts";

test("email and presence loops report disconnected after debounce and do not throw", async () => {
  const email: string[] = [];
  const presence: string[] = [];
  const emailAbort = new AbortController();
  const presenceAbort = new AbortController();
  startEmailInboxEventsLoop({
    client: {
      requestStream: async () => {
        throw new Error("local-core down");
      },
    },
    signal: emailAbort.signal,
    onUpdated: () => {},
    disconnectedDebounceMs: 20,
    onConnection: (status) => {
      email.push(status);
      if (status === "disconnected") emailAbort.abort();
    },
  });
  startAgentPresenceEventsLoop({
    client: {
      requestStream: async () => {
        throw new Error("local-core down");
      },
    },
    signal: presenceAbort.signal,
    onPresence: () => {},
    disconnectedDebounceMs: 20,
    onConnection: (status) => {
      presence.push(status);
      if (status === "disconnected") presenceAbort.abort();
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(email, ["connecting", "disconnected"]);
  assert.deepEqual(presence, ["connecting", "disconnected"]);
});

test("brief presence outage that recovers does not report disconnected", async () => {
  const presence: string[] = [];
  const abort = new AbortController();
  let calls = 0;
  startAgentPresenceEventsLoop({
    client: {
      requestStream: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'event: ready\ndata: {"ok":true}\n\n',
                  ),
                );
                // Soft end (idle-style) then next attempt fails briefly.
                setTimeout(() => controller.close(), 5);
              },
            }),
            { status: 200 },
          );
        }
        if (calls === 2) {
          throw new Error("blip");
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('event: ready\ndata: {"ok":true}\n\n'),
              );
              setTimeout(() => {
                abort.abort();
                controller.close();
              }, 5);
            },
          }),
          { status: 200 },
        );
      },
    },
    signal: abort.signal,
    onPresence: () => {},
    // Longer than first reconnect backoff (500ms) so recovery wins.
    disconnectedDebounceMs: 2_000,
    onConnection: (status) => {
      presence.push(status);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.ok(presence.includes("live"));
  assert.ok(!presence.includes("disconnected"));
  abort.abort();
});
