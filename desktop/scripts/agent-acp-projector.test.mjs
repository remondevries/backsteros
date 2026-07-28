import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "backsteros-projector-"));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;

const {
  presentAcpToolActivity,
  projectAcpSessionUpdate,
  beginAcpProjectedTurn,
  projectAcpUiRequest,
  completeAcpProjectedUiRequest,
  projectCursorUpdateTodos,
} = await import("./agent-acp-projector.mjs");

test("presentAcpToolActivity: Grep shows query in path like T3", () => {
  const activity = presentAcpToolActivity(
    {
      sessionUpdate: "tool_call",
      toolCallId: "search-1",
      title: "Tool",
      kind: "search",
      status: "in_progress",
      rawInput: { pattern: "ios", path: "/repo/mobile" },
    },
    undefined,
  );
  assert.equal(activity.title, "Grepped");
  assert.equal(activity.detail, '"ios" in repo/mobile');
});

test("presentAcpToolActivity: Find/glob pattern from rawInput", () => {
  const activity = presentAcpToolActivity(
    {
      toolCallId: "find-1",
      title: "Find",
      kind: "search",
      rawInput: { glob_pattern: "**/*.swift" },
    },
    undefined,
  );
  assert.equal(activity.title, "Grepped");
  assert.equal(activity.detail, '"**/*.swift"');
});

test("presentAcpToolActivity: peels path-bearing Reading title into verb + detail", () => {
  const activity = presentAcpToolActivity(
    {
      toolCallId: "read-title",
      title: "Reading src/lib/agent/agent-acp-activity.ts",
      kind: "read",
      rawInput: {},
    },
    undefined,
  );
  assert.equal(activity.title, "Read");
  assert.equal(activity.detail, "lib/agent/agent-acp-activity.ts");
});

test("projectAcpSessionUpdate holds bare Read until locations arrive", () => {
  const taskId = "task-read-gate";
  const chatId = "dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee";
  beginAcpProjectedTurn(taskId, chatId);
  let turn = projectAcpSessionUpdate(taskId, chatId, {
    sessionUpdate: "tool_call",
    toolCallId: "read-1",
    title: "Read",
    kind: "read",
    status: "in_progress",
  });
  assert.ok(turn);
  assert.equal(turn.activities.length, 0);
  assert.ok(turn.pendingTools["read-1"]);

  turn = projectAcpSessionUpdate(taskId, chatId, {
    sessionUpdate: "tool_call_update",
    toolCallId: "read-1",
    locations: [{ path: "/repo/desktop/src/App.css" }],
    status: "in_progress",
  });
  assert.ok(turn);
  assert.equal(turn.activities.length, 1);
  assert.equal(turn.activities[0]?.title, "Read");
  assert.equal(turn.activities[0]?.detail, "desktop/src/App.css");
  assert.equal(turn.pendingTools["read-1"], undefined);
});

test("projectAcpSessionUpdate keeps detail across status-only completed (T3 merge)", () => {
  const taskId = "task-merge-detail";
  const chatId = "eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee";
  beginAcpProjectedTurn(taskId, chatId);
  projectAcpSessionUpdate(taskId, chatId, {
    sessionUpdate: "tool_call",
    toolCallId: "grep-1",
    title: "Grepping",
    kind: "search",
    status: "in_progress",
    rawInput: { pattern: "fade", path: "/repo/desktop" },
  });
  const turn = projectAcpSessionUpdate(taskId, chatId, {
    sessionUpdate: "tool_call_update",
    toolCallId: "grep-1",
    status: "completed",
  });
  assert.ok(turn);
  assert.equal(turn.activities[0]?.title, "Grepped");
  assert.equal(turn.activities[0]?.detail, '"fade" in repo/desktop');
  assert.equal(turn.activities[0]?.status, "completed");
});

test("presentAcpToolActivity: locations path for Grepping", () => {
  const activity = presentAcpToolActivity(
    {
      toolCallId: "grep-loc",
      title: "Grepping",
      kind: "search",
      locations: [{ path: "/repo/desktop/src/app.css" }],
    },
    undefined,
  );
  assert.equal(activity.title, "Grepped");
  assert.equal(activity.detail, "desktop/src/app.css");
});

test("presentAcpToolActivity: content text fallback (No files found)", () => {
  const activity = presentAcpToolActivity(
    {
      toolCallId: "empty-search",
      title: "Tool",
      kind: "search",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: "No files found" },
        },
      ],
    },
    undefined,
  );
  assert.equal(activity.title, "Grepped");
  assert.equal(activity.detail, "No files found");
});

test("projectAcpSessionUpdate keeps Grep detail across status-only update", () => {
  const taskId = "task-grep-detail";
  const chatId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
  beginAcpProjectedTurn(taskId, chatId);
  projectAcpSessionUpdate(taskId, chatId, {
    sessionUpdate: "tool_call",
    toolCallId: "search-1",
    title: "Tool",
    kind: "search",
    status: "in_progress",
    rawInput: { pattern: "ios", path: "/repo/mobile" },
  });
  const turn = projectAcpSessionUpdate(taskId, chatId, {
    sessionUpdate: "tool_call_update",
    toolCallId: "search-1",
    status: "completed",
  });
  assert.ok(turn);
  const row = turn.activities.find((a) => a.id === "search-1");
  assert.equal(row?.title, "Grepped");
  assert.equal(row?.detail, '"ios" in repo/mobile');
  assert.equal(row?.status, "completed");
});

test("projectAcpUiRequest creates in_progress info activity and completes on clear", () => {
  const taskId = "task-ask-ui";
  const chatId = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";
  beginAcpProjectedTurn(taskId, chatId);
  const turn = projectAcpUiRequest(taskId, chatId, {
    requestId: "ask-42",
    kind: "ask_question",
    title: "Which approach?",
    detail: "2 questions",
  });
  assert.ok(turn);
  const row = turn.activities.find((a) => a.id === "acp-ui-ask-42");
  assert.equal(row?.kind, "info");
  assert.equal(row?.title, "Which approach?");
  assert.equal(row?.detail, "2 questions");
  assert.equal(row?.status, "in_progress");

  const settled = completeAcpProjectedUiRequest(taskId, chatId, "ask-42");
  const done = settled?.activities.find((a) => a.id === "acp-ui-ask-42");
  assert.equal(done?.status, "completed");
});

test("projectCursorUpdateTodos merges by step text when merge=true", () => {
  const taskId = "task-todo-merge";
  const chatId = "dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb";
  beginAcpProjectedTurn(taskId, chatId);
  projectCursorUpdateTodos(taskId, chatId, {
    merge: false,
    todos: [
      { content: "Inspect", status: "in_progress" },
      { content: "Fix", status: "pending" },
    ],
  });
  const turn = projectCursorUpdateTodos(taskId, chatId, {
    merge: true,
    todos: [
      { content: "Inspect", status: "completed" },
      { content: "Fix", status: "in_progress" },
    ],
  });
  assert.ok(turn);
  assert.deepEqual(turn.planSteps, [
    { step: "Inspect", status: "completed" },
    { step: "Fix", status: "inProgress" },
  ]);
});
