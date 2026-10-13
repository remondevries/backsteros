import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

const {
  listPendingUiRequests,
  __testEnqueuePendingUiRequest,
  __testClearPendingUiRequests,
  __testRegisterSession,
  __testClearSessions,
  __testTakeLastRpcResponse,
  __testPermissionOutcome,
  resolveTaskAndSessionForUiRequest,
  respondAcpUiRequest,
  onAcpEvent,
} = await import("./agent-acp-manager.mjs");

afterEach(() => {
  __testClearPendingUiRequests();
  __testClearSessions();
});

test("listPendingUiRequests returns summarized ask for a task", () => {
  __testEnqueuePendingUiRequest({
    requestId: "ask-1",
    kind: "ask_question",
    taskId: "task-a",
    sessionId: "sess-1",
    params: {
      questions: [{ id: "q1", prompt: "Continue?", options: [] }],
    },
  });
  __testEnqueuePendingUiRequest({
    requestId: "ask-other",
    kind: "ask_question",
    taskId: "task-b",
    params: {
      questions: [{ id: "q9", prompt: "Other", options: [{ id: "x", label: "X" }] }],
    },
  });

  const pending = listPendingUiRequests("task-a");
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.requestId, "ask-1");
  assert.equal(pending[0]?.kind, "ask_question");
  assert.equal(pending[0]?.title, "Continue?");
  assert.deepEqual(pending[0]?.options, [{ id: "ok", label: "OK" }]);
  assert.equal(listPendingUiRequests("task-b").length, 1);
  assert.equal(listPendingUiRequests("missing").length, 0);
});

test("resolveTaskAndSessionForUiRequest prefers params then busy session", () => {
  __testRegisterSession({
    taskId: "task-busy",
    sessionId: "sess-busy",
    busy: true,
  });
  __testRegisterSession({
    taskId: "task-idle",
    sessionId: "sess-idle",
    busy: false,
  });

  const fromParams = resolveTaskAndSessionForUiRequest({
    sessionId: "sess-idle",
  });
  assert.equal(fromParams.source, "params");
  assert.equal(fromParams.taskId, "task-idle");
  assert.equal(fromParams.sessionId, "sess-idle");

  const fromBusy = resolveTaskAndSessionForUiRequest({
    toolCallId: "tc-1",
    questions: [],
  });
  assert.equal(fromBusy.source, "busy");
  assert.equal(fromBusy.taskId, "task-busy");
  assert.equal(fromBusy.sessionId, "sess-busy");
});

test("resolveTaskAndSessionForUiRequest falls back to sole session", () => {
  __testRegisterSession({
    taskId: "only",
    sessionId: "sess-only",
    busy: false,
  });
  const resolved = resolveTaskAndSessionForUiRequest({ questions: [] });
  assert.equal(resolved.source, "sole");
  assert.equal(resolved.taskId, "only");
});

test("respondAcpUiRequest emits ui-request-cleared", () => {
  /** @type {Record<string, unknown>[]} */
  const events = [];
  const stop = onAcpEvent((event) => {
    events.push(event);
  });
  __testEnqueuePendingUiRequest({
    requestId: "ask-clear",
    kind: "ask_question",
    taskId: "task-clear",
    params: {
      questions: [
        {
          id: "q1",
          prompt: "Ok?",
          options: [{ id: "yes", label: "Yes" }],
        },
      ],
    },
  });

  const result = respondAcpUiRequest({
    requestId: "ask-clear",
    skipped: true,
  });
  assert.equal(result.ok, true);
  assert.equal(listPendingUiRequests("task-clear").length, 0);
  const cleared = events.find((e) => e.type === "ui-request-cleared");
  assert.ok(cleared);
  assert.equal(cleared?.requestId, "ask-clear");
  assert.equal(cleared?.taskId, "task-clear");
  assert.equal(cleared?.reason, "skipped");
  stop();
});

test("respondAcpUiRequest maps label records to Cursor docs selectedOptionIds", () => {
  __testTakeLastRpcResponse();
  __testEnqueuePendingUiRequest({
    requestId: "ask-answers",
    kind: "ask_question",
    taskId: "task-answers",
    params: {
      questions: [
        {
          id: "q1",
          prompt: "Pick",
          options: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ],
        },
      ],
    },
  });
  const result = respondAcpUiRequest({
    requestId: "ask-answers",
    answers: { q1: "Alpha" },
  });
  assert.equal(result.ok, true);
  assert.equal(listPendingUiRequests("task-answers").length, 0);
  assert.deepEqual(__testTakeLastRpcResponse()?.result, {
    outcome: {
      outcome: "answered",
      answers: [{ questionId: "q1", selectedOptionIds: ["a"] }],
    },
  });
});

test("respondAcpUiRequest accepts docs answer array of option ids", () => {
  __testTakeLastRpcResponse();
  __testEnqueuePendingUiRequest({
    requestId: "ask-ids",
    kind: "ask_question",
    taskId: "task-ids",
    params: {
      questions: [
        {
          id: "q1",
          prompt: "Pick",
          options: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ],
        },
      ],
    },
  });
  const result = respondAcpUiRequest({
    requestId: "ask-ids",
    answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(__testTakeLastRpcResponse()?.result, {
    outcome: {
      outcome: "answered",
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    },
  });
});

test("permissionOutcome prefers ACP kind over name regex", () => {
  const result = __testPermissionOutcome(
    {
      options: [
        { optionId: "opaque-allow", name: "Continue", kind: "allow_once" },
        { optionId: "opaque-reject", name: "Stop", kind: "reject_once" },
      ],
    },
    "once",
  );
  assert.deepEqual(result, {
    outcome: { outcome: "selected", optionId: "opaque-allow" },
  });
  const reject = __testPermissionOutcome(
    {
      options: [
        { optionId: "opaque-allow", name: "Continue", kind: "allow_always" },
        { optionId: "opaque-reject", name: "Stop", kind: "reject_once" },
      ],
    },
    "reject",
  );
  assert.deepEqual(reject, {
    outcome: { outcome: "selected", optionId: "opaque-reject" },
  });
});
