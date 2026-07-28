import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "backsteros-transcript-"));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;

const {
  appendChatTranscriptMessage,
  loadChatTranscript,
  saveChatTranscript,
  upsertAssistantTurnTimeline,
} = await import("./agent-chat-transcript-store.mjs");

const CHAT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function seedUser(text = "Go") {
  saveChatTranscript(CHAT_ID, []);
  appendChatTranscriptMessage(CHAT_ID, {
    id: "user-1",
    role: "user",
    text,
    createdAt: 1,
  });
}

test("upsertAssistantTurnTimeline creates in-progress turn with empty text", () => {
  seedUser();
  const first = upsertAssistantTurnTimeline(CHAT_ID, {
    id: "assist-1",
    text: "",
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Reading file",
        status: "in_progress",
        toolKind: "read",
      },
    ],
    segments: [
      {
        id: "work-1",
        kind: "work",
        activities: [
          {
            id: "t1",
            kind: "tool",
            title: "Reading file",
            status: "in_progress",
            toolKind: "read",
          },
        ],
      },
    ],
    workedStartedAt: 1000,
  });

  assert.equal(first.message?.id, "assist-1");
  assert.equal(first.message?.text, "");
  assert.equal(first.message?.activities?.length, 1);
  assert.equal(first.message?.segments?.length, 1);
  assert.equal(loadChatTranscript(CHAT_ID).length, 2);
  assert.equal(loadChatTranscript(CHAT_ID)[0]?.role, "user");
});

test("upsertAssistantTurnTimeline refuses assistant without trailing user", () => {
  saveChatTranscript(CHAT_ID, []);
  const result = upsertAssistantTurnTimeline(CHAT_ID, {
    id: "assist-orphan",
    text: "",
    activities: [
      {
        id: "t1",
        kind: "info",
        title: "Thinking",
        status: "in_progress",
      },
    ],
  });
  assert.equal(result.message, null);
  assert.equal(loadChatTranscript(CHAT_ID).length, 0);
});

test("upsertAssistantTurnTimeline merges text without dropping activities", () => {
  seedUser();
  upsertAssistantTurnTimeline(CHAT_ID, {
    id: "assist-2",
    text: "",
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Edited file",
        status: "completed",
        toolKind: "edit",
      },
    ],
  });
  const sealed = upsertAssistantTurnTimeline(CHAT_ID, {
    id: "assist-2",
    text: "Done editing.",
  });

  assert.equal(sealed.message?.text, "Done editing.");
  assert.equal(sealed.message?.activities?.length, 1);
  assert.equal(sealed.message?.activities?.[0]?.id, "t1");
});

test("append of bare assistant text cannot drop richer activities", () => {
  seedUser();
  upsertAssistantTurnTimeline(CHAT_ID, {
    id: "assist-3",
    text: "Shipped.",
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Reading file",
        status: "completed",
        toolKind: "read",
      },
    ],
  });
  const result = appendChatTranscriptMessage(CHAT_ID, {
    role: "assistant",
    text: "Shipped.",
    id: "assist-3",
  });

  assert.equal(result.appended, false);
  assert.equal(result.messages[1]?.activities?.length, 1);
});

test("segments round-trip through save/load", () => {
  seedUser();
  upsertAssistantTurnTimeline(CHAT_ID, {
    id: "assist-4",
    text: "Hello",
    segments: [
      {
        id: "work-1",
        kind: "work",
        activities: [
          {
            id: "t1",
            kind: "tool",
            title: "Reading file",
            status: "completed",
            toolKind: "read",
          },
        ],
      },
      { id: "text-1", kind: "text", text: "Hello" },
    ],
  });
  const loaded = loadChatTranscript(CHAT_ID);
  assert.equal(loaded[1]?.segments?.length, 2);
  assert.equal(loaded[1]?.segments?.[0]?.kind, "work");
  assert.equal(loaded[1]?.segments?.[1]?.kind, "text");
});
