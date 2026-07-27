import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyAgentChatTurnUiState } from "./agent-acp-activity.ts";
import { applyAgentHookEventToTurn } from "./agent-hook-activity.ts";

describe("applyAgentHookEventToTurn", () => {
  it("maps preToolUse Read into activity list", () => {
    const next = applyAgentHookEventToTurn(emptyAgentChatTurnUiState(), {
      event: "preToolUse",
      toolName: "Read",
      toolUseId: "t1",
      toolInput: { file_path: "/tmp/proj/NOTES.md" },
    });
    assert.equal(next.phase, "tooling");
    assert.equal(next.activities.length, 1);
    assert.equal(next.activities[0]?.id, "t1");
    assert.equal(next.activities[0]?.kind, "tool");
    assert.equal(next.activities[0]?.toolKind, "read");
    assert.equal(next.activities[0]?.status, "in_progress");
    assert.match(next.activities[0]?.detail ?? "", /NOTES\.md/);
  });

  it("completes tools on postToolUse", () => {
    const started = applyAgentHookEventToTurn(emptyAgentChatTurnUiState(), {
      event: "preToolUse",
      toolName: "Shell",
      toolUseId: "s1",
      toolInput: { command: "ls" },
    });
    const next = applyAgentHookEventToTurn(started, {
      event: "postToolUse",
      toolName: "Shell",
      toolUseId: "s1",
      toolInput: { command: "ls" },
    });
    assert.equal(next.activities[0]?.status, "completed");
  });

  it("maps TodoWrite into plan steps", () => {
    const next = applyAgentHookEventToTurn(emptyAgentChatTurnUiState(), {
      event: "preToolUse",
      toolName: "TodoWrite",
      toolUseId: "todo1",
      toolInput: {
        todos: [
          { content: "Diagnose split", status: "completed" },
          { content: "Route prompts", status: "in_progress" },
          { content: "Keep ACP fallback", status: "pending" },
        ],
      },
    });
    assert.equal(next.planSteps.length, 3);
    assert.equal(next.planSteps[0]?.status, "completed");
    assert.equal(next.planSteps[1]?.status, "inProgress");
    assert.equal(next.planSteps[2]?.status, "pending");
  });

  it("maps afterFileEdit into a completed edit with path detail", () => {
    const next = applyAgentHookEventToTurn(emptyAgentChatTurnUiState(), {
      event: "afterFileEdit",
      toolName: "Write",
      toolUseId: "edit-1",
      toolInput: {
        file_path: "/tmp/proj/src/app.ts",
        edits: [
          { old_string: "const a = 1", new_string: "const a = 2" },
        ],
      },
    });
    assert.equal(next.phase, "tooling");
    assert.equal(next.activities.length, 1);
    assert.equal(next.activities[0]?.toolKind, "edit");
    assert.equal(next.activities[0]?.status, "completed");
    assert.match(next.activities[0]?.detail ?? "", /app\.ts/);
    assert.ok(next.activities[0]?.diff);
  });

  it("maps beforeReadFile into an in-progress read", () => {
    const next = applyAgentHookEventToTurn(emptyAgentChatTurnUiState(), {
      event: "beforeReadFile",
      toolName: "Read",
      toolUseId: "read-1",
      toolInput: { file_path: "/tmp/proj/README.md" },
    });
    assert.equal(next.activities[0]?.toolKind, "read");
    assert.equal(next.activities[0]?.status, "in_progress");
    assert.match(next.activities[0]?.detail ?? "", /README\.md/);
  });
});
