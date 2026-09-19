import assert from "node:assert/strict";
import { test } from "node:test";

import { startEmailInboxEventsLoop } from "./email-inbox-events.ts";
import { startAgentPresenceEventsLoop } from "./agent/agent-presence-events.ts";

test("email and presence loops report disconnected and do not throw", async () => {
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
    onConnection: (status) => {
      presence.push(status);
      if (status === "disconnected") presenceAbort.abort();
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(email, ["connecting", "disconnected"]);
  assert.deepEqual(presence, ["connecting", "disconnected"]);
});
