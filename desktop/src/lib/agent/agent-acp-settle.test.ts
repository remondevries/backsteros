import assert from "node:assert/strict";
import { test } from "node:test";

import {
  shouldFinalizeChatTurn,
  shouldReopenLiveTurnFromLateFrame,
} from "./agent-acp-settle.ts";

test("poll-idle never finalizes Chat", () => {
  assert.equal(
    shouldFinalizeChatTurn({ source: "poll-idle", activityBusy: false }),
    false,
  );
  assert.equal(
    shouldFinalizeChatTurn({ source: "poll-idle", activityBusy: true }),
    false,
  );
});

test("teardown skips finalize while activity busy", () => {
  assert.equal(
    shouldFinalizeChatTurn({ source: "teardown", activityBusy: true }),
    false,
  );
  assert.equal(
    shouldFinalizeChatTurn({ source: "teardown", activityBusy: false }),
    true,
  );
});

test("prompt-complete / stop / idle finalize Chat", () => {
  assert.equal(shouldFinalizeChatTurn({ source: "prompt-complete" }), true);
  assert.equal(shouldFinalizeChatTurn({ source: "stop" }), true);
  assert.equal(shouldFinalizeChatTurn({ source: "idle" }), true);
  assert.equal(shouldFinalizeChatTurn({ source: "exit" }), true);
});

test("reopen only when session busy and local turn inactive", () => {
  assert.equal(
    shouldReopenLiveTurnFromLateFrame({
      localTurnActive: false,
      sessionBusy: true,
    }),
    true,
  );
  assert.equal(
    shouldReopenLiveTurnFromLateFrame({
      localTurnActive: true,
      sessionBusy: true,
    }),
    false,
  );
  assert.equal(
    shouldReopenLiveTurnFromLateFrame({
      localTurnActive: false,
      sessionBusy: false,
    }),
    false,
  );
});
