import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChatThreadMessage,
  ChatThreadWithMessages,
  ChatUiMessage,
} from "@backsteros/contracts";

import {
  createCoalescedRunner,
  createLiveAgentThreadState,
  liveAgentThreadReducer,
  liveAgentThreadView,
  type LiveAgentThreadAction,
  type LiveAgentThreadState,
} from "./live-agent-thread-state.js";

const THREAD = "th_1";
const AGENT = "ag_sander";
const T0 = Date.parse("2026-10-30T21:00:00.000Z");

function at(offsetSec: number): string {
  return new Date(T0 + offsetSec * 1000).toISOString();
}

function msg(
  id: string,
  role: "user" | "assistant",
  offsetSec: number,
  body = id,
): ChatThreadMessage {
  return {
    id,
    threadId: THREAD,
    role,
    authorContactId: null,
    authorName: role === "assistant" ? "Sander" : "Remon",
    body,
    status: "done",
    createdAt: at(offsetSec),
    updatedAt: at(offsetSec),
  };
}

function thread(
  messages: ChatThreadMessage[],
  updatedSec: number,
  pendingSec: number | null = null,
): ChatThreadWithMessages {
  return {
    id: THREAD,
    workspaceId: "ws",
    agentId: AGENT,
    agentName: "Sander",
    pendingReplyAt: pendingSec == null ? null : at(pendingSec),
    createdAt: at(0),
    updatedAt: at(updatedSec),
    messages,
  };
}

function run(
  actions: LiveAgentThreadAction[],
  start: LiveAgentThreadState = createLiveAgentThreadState(AGENT, "Sander"),
): LiveAgentThreadState {
  return actions.reduce(liveAgentThreadReducer, start);
}

function ids(state: LiveAgentThreadState): string[] {
  return state.messages.map((message) => message.id);
}

const opened: LiveAgentThreadAction = {
  type: "opened",
  agentId: AGENT,
  thread: thread([msg("u1", "user", 1), msg("a1", "assistant", 2)], 2),
  nowMs: T0 + 2_000,
};

describe("liveAgentThreadReducer", () => {
  it("keeps an SSE reply when a fetch that started earlier lands after it", () => {
    // Today's bug: 2.5s thinking poll started before the reply, finished after.
    const state = run([
      opened,
      {
        type: "pushMessage",
        threadId: THREAD,
        message: { id: "a2", body: "Got it", createdAt: at(10) },
      },
      {
        type: "snapshot",
        thread: thread([msg("u1", "user", 1), msg("a1", "assistant", 2)], 5, 5),
        nowMs: T0 + 11_000,
      },
    ]);
    assert.deepEqual(ids(state), ["u1", "a1", "a2"]);
    assert.equal(state.thinking.mode, "off");
  });

  it("does not revive thinking from a stale snapshot after idle", () => {
    const state = run([
      opened,
      {
        type: "pushStatus",
        threadId: THREAD,
        state: "working",
        label: "Searching…",
        at: at(5),
        nowMs: T0 + 5_000,
      },
      {
        type: "pushStatus",
        threadId: THREAD,
        state: "idle",
        label: null,
        at: at(8),
        nowMs: T0 + 8_000,
      },
      // Poll captured while working.
      { type: "snapshot", thread: thread([], 5, 5), nowMs: T0 + 9_000 },
    ]);
    assert.equal(state.thinking.mode, "off");
  });

  it("replaces the truncated SSE preview with the full body from a fetch", () => {
    const full = "x".repeat(300);
    const state = run([
      opened,
      {
        type: "pushMessage",
        threadId: THREAD,
        message: { id: "a2", body: `${"x".repeat(95)}…`, createdAt: at(10) },
      },
      {
        type: "snapshot",
        thread: thread(
          [msg("u1", "user", 1), msg("a1", "assistant", 2), msg("a2", "assistant", 10, full)],
          10,
        ),
        nowMs: T0 + 11_000,
      },
    ]);
    const a2 = state.messages.find((message) => message.id === "a2");
    assert.deepEqual(a2?.parts, [{ type: "text", text: full, markdown: true }]);
  });

  it("drops messages missing from a snapshot that is newer than them", () => {
    const state = run([
      opened,
      {
        type: "snapshot",
        thread: thread([msg("u1", "user", 1), msg("u3", "user", 30)], 30),
        nowMs: T0 + 30_000,
      },
    ]);
    assert.deepEqual(ids(state), ["u1", "u3"]);
  });

  it("never resurrects a locally deleted message from an older snapshot", () => {
    const state = run([
      opened,
      { type: "deleteStarted", ids: ["a1"] },
      { type: "snapshot", thread: opened.type === "opened" ? opened.thread : thread([], 0), nowMs: T0 + 3_000 },
      {
        type: "pushMessage",
        threadId: THREAD,
        message: { id: "a1", body: "a1", createdAt: at(2) },
      },
    ]);
    assert.deepEqual(ids(state), ["u1"]);
  });

  it("restores messages when a delete fails", () => {
    const before = run([opened]);
    const restore = before.messages.filter((message) => message.id === "a1");
    const state = run(
      [
        { type: "deleteStarted", ids: ["a1"] },
        { type: "deleteFailed", restore },
      ],
      before,
    );
    assert.deepEqual(ids(state), ["u1", "a1"]);
    assert.equal(state.tombstones.has("a1"), false);
  });

  it("keeps a reply that arrives while a send is in flight", () => {
    const optimistic: ChatUiMessage = {
      id: "local-1",
      role: "user",
      status: "pending",
      createdAt: at(9),
      parts: [{ type: "text", text: "hi" }],
    };
    const state = run([
      opened,
      { type: "sendStarted", message: optimistic },
      {
        type: "pushStatus",
        threadId: THREAD,
        state: "working",
        label: "Reading",
        at: at(11),
        nowMs: T0 + 11_000,
      },
      {
        type: "pushMessage",
        threadId: THREAD,
        message: { id: "a2", body: "reply", createdAt: at(12) },
      },
      {
        type: "sendSucceeded",
        pendingId: "local-1",
        message: msg("u2", "user", 10, "hi"),
        thinking: true,
        webhookError: null,
        nowMs: T0 + 13_000,
      },
    ]);
    assert.deepEqual(ids(state), ["u1", "a1", "u2", "a2"]);
    // Reply already landed — send success must not turn thinking back on.
    assert.equal(state.thinking.mode, "off");
  });

  it("shows provisional thinking after send until a newer reply arrives", () => {
    const sent = run([
      opened,
      {
        type: "sendSucceeded",
        pendingId: "none",
        message: msg("u2", "user", 10, "hi"),
        thinking: true,
        webhookError: null,
        nowMs: T0 + 10_000,
      },
      // Snapshot right after send: no pendingReplyAt yet.
      {
        type: "snapshot",
        thread: thread([msg("u1", "user", 1), msg("a1", "assistant", 2), msg("u2", "user", 10)], 10),
        nowMs: T0 + 11_000,
      },
    ]);
    assert.equal(sent.thinking.mode, "provisional");
    const replied = run(
      [
        {
          type: "snapshot",
          thread: thread(
            [msg("u1", "user", 1), msg("a1", "assistant", 2), msg("u2", "user", 10), msg("a2", "assistant", 15)],
            15,
          ),
          nowMs: T0 + 16_000,
        },
      ],
      sent,
    );
    assert.equal(replied.thinking.mode, "off");
    assert.deepEqual(ids(replied), ["u1", "a1", "u2", "a2"]);
  });

  it("ignores out-of-order status events", () => {
    const state = run([
      opened,
      {
        type: "pushStatus",
        threadId: THREAD,
        state: "idle",
        label: null,
        at: at(9),
        nowMs: T0 + 9_000,
      },
      {
        type: "pushStatus",
        threadId: THREAD,
        state: "working",
        label: "late",
        at: at(7),
        nowMs: T0 + 9_500,
      },
    ]);
    assert.equal(state.thinking.mode, "off");
  });

  it("ignores events for other threads and opens for other agents", () => {
    const state = run([
      opened,
      {
        type: "pushMessage",
        threadId: "other",
        message: { id: "x", body: "x", createdAt: at(50) },
      },
      {
        type: "opened",
        agentId: "ag_other",
        thread: { ...thread([msg("z", "user", 60)], 60), id: "th_other" },
        nowMs: T0 + 60_000,
      },
    ]);
    assert.deepEqual(ids(state), ["u1", "a1"]);
  });

  it("returns the same state for an unchanged snapshot (no re-render)", () => {
    const state = run([opened]);
    const next = liveAgentThreadReducer(state, {
      type: "snapshot",
      thread: thread([msg("u1", "user", 1), msg("a1", "assistant", 2)], 2),
      nowMs: T0 + 3_000,
    });
    assert.equal(next, state);
  });

  it("renders the step label as the last line while working", () => {
    const state = run([
      opened,
      {
        type: "pushStatus",
        threadId: THREAD,
        state: "working",
        label: "Drafting reply",
        at: at(5),
        nowMs: T0 + 5_000,
      },
    ]);
    const view = liveAgentThreadView(state);
    assert.deepEqual(view.at(-1)?.parts, [
      { type: "status-line", text: "Drafting reply" },
    ]);
    assert.equal(view.at(-1)?.status, "streaming");
  });
});

describe("createCoalescedRunner", () => {
  it("runs at most one in flight plus one trailing call", async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    const runner = createCoalescedRunner(async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });
    const first = runner();
    void runner();
    void runner();
    void runner();
    assert.equal(calls, 1);
    (release as (() => void) | null)?.();
    await first;
    assert.equal(calls, 2);
  });
});
