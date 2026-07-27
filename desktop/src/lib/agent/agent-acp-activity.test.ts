import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAcpSessionUpdate,
  applyAcpSessionUpdateToTurn,
  createOptimisticTurnUiState,
  emptyAgentChatTurnUiState,
  type AgentChatActivityItem,
} from "./agent-acp-activity.ts";

describe("applyAcpSessionUpdate", () => {
  it("merges tool_call and tool_call_update by toolCallId", () => {
    let items: AgentChatActivityItem[] = [];
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call",
      toolCallId: "t1",
      title: "Write",
      kind: "edit",
      status: "pending",
    });
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call_update",
      toolCallId: "t1",
      title: "Write NOTES.md",
      status: "completed",
      rawInput: { file_path: "/tmp/proj/NOTES.md" },
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, "Edited");
    assert.equal(items[0]?.detail, "tmp/proj/NOTES.md");
    assert.equal(items[0]?.status, "completed");
  });

  it("replaces generic Tool titles with kind verbs and keeps detail", () => {
    let items: AgentChatActivityItem[] = [];
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call",
      toolCallId: "search-1",
      title: "Tool",
      kind: "search",
      status: "in_progress",
      rawInput: { pattern: "ios", path: "/repo/mobile" },
    });
    assert.equal(items[0]?.title, "Grepped");
    assert.equal(items[0]?.detail, '"ios" in mobile');

    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call_update",
      toolCallId: "search-1",
      status: "completed",
    });
    assert.equal(items[0]?.title, "Grepped");
    assert.equal(items[0]?.detail, '"ios" in mobile');
    assert.equal(items[0]?.status, "completed");
    assert.equal(items[0]?.toolKind, "search");
  });

  it("extracts glob patterns and read basenames from varied rawInput shapes", () => {
    let items: AgentChatActivityItem[] = [];
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call",
      toolCallId: "glob-1",
      title: "Tool",
      kind: "search",
      rawInput: { glob_pattern: "**/*.swift" },
    });
    assert.equal(items[0]?.detail, '"**/*.swift"');

    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call",
      toolCallId: "read-1",
      title: "Tool",
      kind: "read",
      rawInput: JSON.stringify({ filePath: "/repo/STRUCTURE.md" }),
    });
    assert.equal(items[1]?.title, "Read");
    assert.equal(items[1]?.detail, "repo/STRUCTURE.md");
  });

  it("peels file paths out of Reading/Grepping titles when rawInput is empty", () => {
    let items: AgentChatActivityItem[] = [];
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call",
      toolCallId: "read-title",
      title: "Reading src/lib/agent/agent-acp-activity.ts",
      kind: "read",
      status: "in_progress",
      rawInput: {},
    });
    assert.equal(items[0]?.title, "Read");
    assert.equal(items[0]?.detail, "lib/agent/agent-acp-activity.ts");

    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "tool_call",
      toolCallId: "grep-loc",
      title: "Grepping",
      kind: "search",
      status: "in_progress",
      locations: [{ path: "/repo/desktop/src/app.css" }],
    });
    assert.equal(items[1]?.title, "Grepped");
    assert.equal(items[1]?.detail, "desktop/src/app.css");
  });

  it("accumulates thought chunks into one row", () => {
    let items: AgentChatActivityItem[] = [];
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "agent_thought_chunk",
      content: { text: "Checking " },
    });
    items = applyAcpSessionUpdate(items, {
      sessionUpdate: "agent_thought_chunk",
      content: { text: "tests…" },
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, "thought");
    assert.ok(items[0]?.detail?.includes("Checking"));
    assert.ok(items[0]?.detail?.includes("tests"));
  });
});

describe("applyAcpSessionUpdateToTurn", () => {
  it("starts optimistically and drops the seed when tools arrive", () => {
    let state = createOptimisticTurnUiState();
    assert.equal(state.phase, "starting");
    assert.equal(state.activities[0]?.title, "Thinking");

    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "tool_call",
      toolCallId: "t1",
      title: "Read",
      kind: "read",
      status: "in_progress",
      rawInput: { path: "/repo/src/app.ts" },
    });
    assert.equal(state.phase, "tooling");
    assert.equal(state.activities.length, 1);
    assert.equal(state.activities[0]?.id, "t1");
    assert.equal(state.activities[0]?.detail, "repo/src/app.ts");
  });

  it("streams assistant message chunks into the draft", () => {
    let state = emptyAgentChatTurnUiState();
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "agent_message_chunk",
      content: { text: "Hello " },
    });
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "agent_message_chunk",
      content: { text: "world" },
    });
    assert.equal(state.assistantDraft, "Hello world");
    assert.equal(state.phase, "responding");
    assert.equal(state.segments.length, 1);
    assert.equal(state.segments[0]?.kind, "text");
  });

  it("interleaves tools and text as separate segments", () => {
    let state = emptyAgentChatTurnUiState();
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "tool_call",
      toolCallId: "t1",
      title: "Read NOTES.md",
      kind: "read",
      status: "completed",
    });
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "agent_message_chunk",
      content: { text: "Found the file." },
    });
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "tool_call",
      toolCallId: "t2",
      title: "Edit NOTES.md",
      kind: "edit",
      status: "in_progress",
    });
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "agent_message_chunk",
      content: { text: " Updated." },
    });
    assert.equal(state.segments.length, 4);
    assert.equal(state.segments[0]?.kind, "work");
    assert.equal(state.segments[1]?.kind, "text");
    assert.equal(state.segments[2]?.kind, "work");
    assert.equal(state.segments[3]?.kind, "text");
    if (state.segments[1]?.kind === "text") {
      assert.equal(state.segments[1].text, "Found the file.");
    }
    if (state.segments[3]?.kind === "text") {
      assert.equal(state.segments[3].text, " Updated.");
    }
    assert.equal(state.assistantDraft, "Found the file.\n\n Updated.");
    assert.equal(state.activities.length, 2);
  });

  it("keeps thinking rows when the assistant starts streaming", () => {
    let state = createOptimisticTurnUiState();
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "agent_thought_chunk",
      content: { text: "Considering approach…" },
    });
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "agent_message_chunk",
      content: { text: "Here is the fix." },
    });
    assert.equal(state.phase, "responding");
    assert.equal(state.assistantDraft, "Here is the fix.");
    assert.ok(state.activities.some((item) => item.kind === "thought"));
    assert.equal(
      state.activities.find((item) => item.kind === "thought")?.status,
      "completed",
    );
  });

  it("captures edit diffs from tool_call_update content blocks", () => {
    let state = emptyAgentChatTurnUiState();
    state = applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "tool_call_update",
      toolCallId: "edit-1",
      title: "Write NOTES.md",
      kind: "edit",
      status: "completed",
      content: [
        {
          type: "diff",
          path: "/repo/NOTES.md",
          oldText: "hello\n",
          newText: "hello\nworld\n",
        },
      ],
    });
    const tool = state.activities[0];
    assert.equal(tool?.diff?.path, "/repo/NOTES.md");
    assert.ok((tool?.diff?.additions ?? 0) > 0);
    assert.equal(tool?.detail, "repo/NOTES.md");
    assert.ok(tool?.diff?.lines.some((line) => line.type === "add"));
  });
});
