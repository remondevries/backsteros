import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyLiveTurnTimelineToMessages,
  findRehydratableLiveAssistant,
  liveTurnToTimelinePatch,
  rehydrateTurnUiFromMessage,
  shouldSuppressSettledAssistantForLiveTurn,
} from "./agent-chat-live-timeline.ts";
import type { AgentChatTurnUiState } from "./agent-acp-activity.ts";
import type { AgentChatMessage } from "./agent-chat-transcript.ts";
import { mergeAgentChatTranscripts } from "./agent-chat-transcript.ts";

function sampleTurn(): AgentChatTurnUiState {
  return {
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
    assistantDraft: "",
    phase: "tooling",
    planSteps: [],
    proposedPlanMarkdown: null,
  };
}

test("liveTurnToTimelinePatch keeps tools with empty draft text", () => {
  const patch = liveTurnToTimelinePatch(sampleTurn(), {
    messageId: "m1",
    workedStartedAt: 42,
  });
  assert.ok(patch);
  assert.equal(patch?.id, "m1");
  assert.equal(patch?.text, "");
  assert.equal(patch?.activities?.length, 1);
  assert.equal(patch?.workedStartedAt, 42);
});

test("applyLiveTurnTimelineToMessages upserts then merges text", () => {
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Read it",
    createdAt: 1,
  };
  const patch = liveTurnToTimelinePatch(sampleTurn(), { messageId: "a1" })!;
  const first = applyLiveTurnTimelineToMessages([user], patch);
  assert.equal(first.messages.length, 2);
  assert.equal(first.messageId, "a1");
  assert.equal(first.messages[1]?.activities?.length, 1);

  const sealed = liveTurnToTimelinePatch(
    { ...sampleTurn(), assistantDraft: "Here is the file." },
    { messageId: "a1", seal: true },
  )!;
  const second = applyLiveTurnTimelineToMessages(first.messages, sealed);
  assert.equal(second.messages.length, 2);
  assert.equal(second.messages[1]?.text, "Here is the file.");
  assert.equal(second.messages[1]?.activities?.length, 1);
});

test("rehydrateTurnUiFromMessage restores tooling phase", () => {
  const message: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "",
    createdAt: 10,
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Editing file",
        status: "in_progress",
        toolKind: "edit",
      },
    ],
    workedStartedAt: 5,
  };
  const turn = rehydrateTurnUiFromMessage(message);
  assert.equal(turn.phase, "tooling");
  assert.equal(turn.activities.length, 1);
  assert.equal(findRehydratableLiveAssistant([message])?.id, "a1");
});

test("shouldSuppressSettledAssistantForLiveTurn only while working", () => {
  const message: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "",
    createdAt: 1,
    activities: [
      { id: "t1", kind: "tool", title: "Reading file", status: "completed" },
    ],
  };
  assert.equal(
    shouldSuppressSettledAssistantForLiveTurn(message, "a1", true),
    true,
  );
  assert.equal(
    shouldSuppressSettledAssistantForLiveTurn(message, "a1", false),
    false,
  );
  assert.equal(
    shouldSuppressSettledAssistantForLiveTurn(message, "other", true),
    false,
  );
});

test("merge keeps activities when remote is text-only", () => {
  const rich: AgentChatMessage = {
    id: "a-local",
    role: "assistant",
    text: "Done.",
    createdAt: 200,
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Edited file",
        status: "completed",
        toolKind: "edit",
      },
    ],
  };
  const bare: AgentChatMessage = {
    id: "a-remote",
    role: "assistant",
    text: "Done.",
    createdAt: 210,
  };
  const merged = mergeAgentChatTranscripts([bare], [rich]);
  assert.equal(merged[0]?.activities?.length, 1);
});
