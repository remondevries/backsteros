import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyLiveTurnTimelineToMessages,
  findRehydratableLiveAssistant,
  foldAssistantTextIntoLastMessage,
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

test("applyLiveTurnTimelineToMessages does not prepend assistant before user", () => {
  const patch = liveTurnToTimelinePatch(sampleTurn(), {
    messageId: "a1",
    createdAt: 1,
  })!;
  const empty = applyLiveTurnTimelineToMessages([], patch);
  assert.equal(empty.messages.length, 0);

  const priorAssistant: AgentChatMessage = {
    id: "a0",
    role: "assistant",
    text: "Earlier reply",
    createdAt: 5,
  };
  const raced = applyLiveTurnTimelineToMessages([priorAssistant], patch);
  assert.equal(raced.messages.length, 1);
  assert.equal(raced.messages[0]?.id, "a0");
});

test("applyLiveTurnTimelineToMessages keeps assistant createdAt after user", () => {
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Go",
    createdAt: 100,
  };
  const patch = liveTurnToTimelinePatch(sampleTurn(), {
    messageId: "a1",
    createdAt: 50,
  })!;
  const applied = applyLiveTurnTimelineToMessages([user], patch);
  assert.equal(applied.messages[1]?.createdAt, 101);
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

test("findRehydratableLiveAssistant ignores sealed assistant answers", () => {
  const sealed: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "All done.",
    createdAt: 10,
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
  assert.equal(findRehydratableLiveAssistant([sealed]), null);
});

test("findRehydratableLiveAssistant ignores text replies with stuck in_progress tools", () => {
  const sealed: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "Done despite race.",
    createdAt: 10,
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Reading file",
        status: "in_progress",
        toolKind: "read",
      },
    ],
  };
  assert.equal(findRehydratableLiveAssistant([sealed]), null);
});

test("findRehydratableLiveAssistant keeps text replies with inProgress plan steps", () => {
  const midBootstrap: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "I'll inspect the layout.",
    createdAt: 10,
    planSteps: [
      { step: "Explore layout", status: "inProgress" },
      { step: "Keep sidebar", status: "pending" },
    ],
  };
  assert.equal(findRehydratableLiveAssistant([midBootstrap])?.id, "a1");
});

test("findRehydratableLiveAssistant ignores completed turns with stuck plan steps", () => {
  const sealed: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "Done.",
    createdAt: 10,
    turnStatus: "completed",
    turnOutcome: "completed",
    planSteps: [{ step: "Explore", status: "inProgress" }],
    workedStartedAt: 1,
  };
  assert.equal(findRehydratableLiveAssistant([sealed]), null);
});

test("applyLiveTurnTimelineToMessages prefers later workedStartedAt", () => {
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Go",
    createdAt: 100,
  };
  const staleOpen: AgentChatMessage = {
    id: "a-old",
    role: "assistant",
    text: "",
    createdAt: 101,
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Reading",
        status: "in_progress",
        toolKind: "read",
      },
    ],
    workedStartedAt: 1,
  };
  const patch = liveTurnToTimelinePatch(sampleTurn(), {
    messageId: "a-new",
    workedStartedAt: 50_000,
  })!;
  const applied = applyLiveTurnTimelineToMessages([user, staleOpen], patch);
  assert.equal(applied.messages[1]?.workedStartedAt, 50_000);
});

test("foldAssistantTextIntoLastMessage updates sealed text without new rows", () => {
  const messages: AgentChatMessage[] = [
    { id: "u1", role: "user", text: "Go", createdAt: 1 },
    {
      id: "a1",
      role: "assistant",
      text: "Partial",
      createdAt: 2,
      activities: [
        { id: "t1", kind: "tool", title: "Read", status: "completed" },
      ],
    },
  ];
  const folded = foldAssistantTextIntoLastMessage(
    messages,
    "Partial\n\nDone.",
  );
  assert.equal(folded.length, 2);
  assert.equal(folded[1]?.text, "Partial\n\nDone.");
  assert.equal(folded[1]?.id, "a1");
});

test("foldAssistantTextIntoLastMessage is a no-op for identical text", () => {
  const messages: AgentChatMessage[] = [
    { id: "a1", role: "assistant", text: "Done.", createdAt: 1 },
  ];
  const folded = foldAssistantTextIntoLastMessage(messages, "Done.");
  assert.equal(folded, messages);
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

test("applyLiveTurnTimelineToMessages keeps same-length plan status updates", () => {
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Do the list",
    createdAt: 1,
  };
  const firstPatch = liveTurnToTimelinePatch(
    {
      ...sampleTurn(),
      planSteps: [
        { step: "A", status: "inProgress" },
        { step: "B", status: "pending" },
      ],
    },
    { messageId: "a1" },
  )!;
  const first = applyLiveTurnTimelineToMessages([user], firstPatch);
  const secondPatch = liveTurnToTimelinePatch(
    {
      ...sampleTurn(),
      assistantDraft: "Done.",
      planSteps: [
        { step: "A", status: "completed" },
        { step: "B", status: "completed" },
      ],
    },
    { messageId: "a1", seal: true },
  )!;
  const second = applyLiveTurnTimelineToMessages(first.messages, secondPatch);
  assert.deepEqual(second.messages[1]?.planSteps, [
    { step: "A", status: "completed" },
    { step: "B", status: "completed" },
  ]);
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
