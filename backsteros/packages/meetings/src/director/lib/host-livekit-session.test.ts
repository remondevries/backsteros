import assert from "node:assert/strict";
import test from "node:test";

import { disconnectHostRoom, enqueueHostLiveKitTask } from "./host-livekit-session";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("enqueueHostLiveKitTask runs tasks one at a time, in order", async () => {
  const events: string[] = [];
  const task = (name: string) => async () => {
    events.push(`start ${name}`);
    await tick();
    events.push(`end ${name}`);
    return name;
  };
  const results = await Promise.all([
    enqueueHostLiveKitTask(task("connect")),
    enqueueHostLiveKitTask(task("teardown")),
    enqueueHostLiveKitTask(task("reconnect")),
  ]);
  assert.deepEqual(results, ["connect", "teardown", "reconnect"]);
  assert.deepEqual(events, [
    "start connect",
    "end connect",
    "start teardown",
    "end teardown",
    "start reconnect",
    "end reconnect",
  ]);
});

test("a failed task rejects its caller without blocking the queue", async () => {
  const failed = enqueueHostLiveKitTask(async () => {
    await tick();
    throw new Error("connect failed");
  });
  const next = enqueueHostLiveKitTask(async () => "recovered");
  await assert.rejects(failed, /connect failed/);
  assert.equal(await next, "recovered");
});

test("disconnectHostRoom(null) is a no-op", async () => {
  await disconnectHostRoom(null);
});
