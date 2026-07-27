/**
 * Map Cursor CLI agent-hook events (Herdr / PTY) onto the same turn UI state
 * that ACP `session/update` frames populate — tools, thoughts, todos.
 */

import {
  activitiesFromSegments,
  applyAcpSessionUpdateToTurn,
  applyCursorUpdateTodosToTurn,
  type AgentChatTurnUiState,
} from "./agent-acp-activity";

// Re-import segment upsert via a thin local helper that mirrors ACP thought
// replace semantics for full hook payloads.
function replaceThoughtInTurn(
  state: AgentChatTurnUiState,
  detail: string,
): AgentChatTurnUiState {
  // Clear any prior thought chunks, then upsert the full block as a work item.
  const withoutThought: AgentChatTurnUiState = {
    ...state,
    segments: state.segments
      .map((segment) => {
        if (segment.kind !== "work") return segment;
        return {
          ...segment,
          activities: segment.activities.filter(
            (item) => item.id !== "acp-thought-stream",
          ),
        };
      })
      .filter(
        (segment) =>
          segment.kind === "text" || segment.activities.length > 0,
      ),
  };
  withoutThought.activities = activitiesFromSegments(withoutThought.segments);

  // Seed an empty thought then "chunk" the full text once (upsert into work).
  const seeded = applyAcpSessionUpdateToTurn(withoutThought, {
    sessionUpdate: "agent_thought_chunk",
    content: { text: detail },
  });
  return {
    ...seeded,
    activities: seeded.activities.map((item) =>
      item.id === "acp-thought-stream"
        ? { ...item, status: "completed" as const }
        : item,
    ),
    segments: seeded.segments.map((segment) => {
      if (segment.kind !== "work") return segment;
      return {
        ...segment,
        activities: segment.activities.map((item) =>
          item.id === "acp-thought-stream"
            ? { ...item, status: "completed" as const }
            : item,
        ),
      };
    }),
    phase:
      state.phase === "responding" || state.phase === "tooling"
        ? state.phase
        : "thinking",
  };
}

export type AgentHookTurnMessage = {
  event?: string;
  activity?: string | null;
  text?: string | null;
  toolName?: string | null;
  toolUseId?: string | null;
  toolInput?: unknown;
  toolOutput?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
};

function mapToolNameToKind(toolName: string): string {
  const lower = toolName.trim().toLowerCase();
  if (!lower) return "other";
  if (lower === "read" || lower === "read_file" || lower.includes("read")) {
    return "read";
  }
  if (
    lower === "shell" ||
    lower === "bash" ||
    lower === "execute" ||
    lower.includes("shell")
  ) {
    return "execute";
  }
  if (
    lower === "grep" ||
    lower === "glob" ||
    lower === "search" ||
    lower.includes("grep") ||
    lower.includes("glob") ||
    lower.includes("search")
  ) {
    return "search";
  }
  if (
    lower === "edit" ||
    lower === "write" ||
    lower === "write_file" ||
    lower === "search_replace" ||
    lower === "apply_patch" ||
    lower.includes("edit") ||
    lower.includes("write")
  ) {
    return "edit";
  }
  if (lower.includes("todo")) return "other";
  if (lower.startsWith("mcp") || lower.includes("mcp")) return "other";
  return "other";
}

function isTodoTool(toolName: string): boolean {
  const lower = toolName.trim().toLowerCase();
  return (
    lower === "todowrite" ||
    lower === "todo_write" ||
    lower === "updatetodos" ||
    lower === "update_todos" ||
    lower.includes("todo")
  );
}

function todosFromToolInput(input: unknown): unknown[] | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (Array.isArray(record.todos)) return record.todos;
  if (Array.isArray(record.plan)) return record.plan;
  return null;
}

function presentToolTitle(toolName: string): string {
  const trimmed = toolName.trim();
  if (!trimmed) return "Tool";
  // Cursor often sends PascalCase tool names (Read, Shell, TodoWrite).
  if (/^[A-Z][a-zA-Z0-9]+$/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const TOOL_START_EVENTS = new Set([
  "preToolUse",
  "beforeShellExecution",
  "beforeMCPExecution",
  "beforeReadFile",
]);

const TOOL_END_EVENTS = new Set([
  "postToolUse",
  "afterShellExecution",
  "afterMCPExecution",
  "afterFileEdit",
]);

const TOOL_FAIL_EVENTS = new Set(["postToolUseFailure"]);

function filePathFromInput(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "targetFile",
  ]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Build ACP-style diff content blocks from Cursor afterFileEdit `edits`. */
function diffContentFromHookInput(input: unknown): unknown[] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const path = filePathFromInput(input);
  const edits = Array.isArray(record.edits) ? record.edits : null;
  if (!path || !edits || edits.length === 0) return undefined;

  let oldText = "";
  let newText = "";
  for (const edit of edits) {
    if (!edit || typeof edit !== "object") continue;
    const entry = edit as Record<string, unknown>;
    const oldString =
      typeof entry.old_string === "string"
        ? entry.old_string
        : typeof entry.oldString === "string"
          ? entry.oldString
          : "";
    const newString =
      typeof entry.new_string === "string"
        ? entry.new_string
        : typeof entry.newString === "string"
          ? entry.newString
          : "";
    if (oldString) oldText += `${oldString}\n`;
    if (newString) newText += `${newString}\n`;
  }
  if (!oldText && !newText) return undefined;
  return [
    {
      type: "diff",
      path,
      oldText,
      newText,
    },
  ];
}

/**
 * Apply one Cursor agent-hook frame to the live Chat turn chrome.
 */
export function applyAgentHookEventToTurn(
  state: AgentChatTurnUiState,
  message: AgentHookTurnMessage,
): AgentChatTurnUiState {
  const event = typeof message.event === "string" ? message.event : "";
  if (!event) return state;

  if (event === "afterAgentThought") {
    const text =
      typeof message.text === "string" && message.text.trim()
        ? message.text.trim()
        : "";
    if (!text) return state;
    // Hook delivers the full thought block (not a delta) — replace, don't append.
    const trimmed =
      text.length > 4000 ? `…${text.slice(-3997)}` : text;
    return replaceThoughtInTurn(state, trimmed);
  }

  const toolName =
    typeof message.toolName === "string" ? message.toolName.trim() : "";
  const toolUseId =
    typeof message.toolUseId === "string" && message.toolUseId.trim()
      ? message.toolUseId.trim()
      : toolName
        ? `hook-${toolName}-${filePathFromInput(message.toolInput) || state.activities.length}`
        : null;

  if (toolName && isTodoTool(toolName)) {
    const todos = todosFromToolInput(message.toolInput);
    if (todos) {
      const merge =
        message.toolInput &&
        typeof message.toolInput === "object" &&
        (message.toolInput as { merge?: unknown }).merge === true;
      return applyCursorUpdateTodosToTurn(state, {
        toolCallId: toolUseId ?? undefined,
        todos,
        merge,
      });
    }
  }

  const diffContent = diffContentFromHookInput(message.toolInput);

  if (toolName && toolUseId && TOOL_START_EVENTS.has(event)) {
    return applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "tool_call",
      toolCallId: toolUseId,
      title: presentToolTitle(toolName),
      kind: mapToolNameToKind(toolName),
      status: "in_progress",
      rawInput: message.toolInput ?? undefined,
      ...(diffContent ? { content: diffContent } : {}),
    });
  }

  if (toolName && toolUseId && TOOL_END_EVENTS.has(event)) {
    // afterFileEdit often arrives without a matching preToolUse — upsert as
    // a completed edit so the ActivityList still shows the file chrome.
    const sessionUpdate =
      event === "afterFileEdit" &&
      !state.activities.some((item) => item.id === toolUseId)
        ? "tool_call"
        : "tool_call_update";
    return applyAcpSessionUpdateToTurn(state, {
      sessionUpdate,
      toolCallId: toolUseId,
      title: presentToolTitle(toolName),
      kind: mapToolNameToKind(toolName),
      status: "completed",
      rawInput: message.toolInput ?? undefined,
      ...(diffContent ? { content: diffContent } : {}),
    });
  }

  if (toolName && toolUseId && TOOL_FAIL_EVENTS.has(event)) {
    return applyAcpSessionUpdateToTurn(state, {
      sessionUpdate: "tool_call_update",
      toolCallId: toolUseId,
      title: presentToolTitle(toolName),
      kind: mapToolNameToKind(toolName),
      status: "failed",
      rawInput: message.toolInput ?? undefined,
      content: message.errorMessage
        ? [{ type: "text", text: String(message.errorMessage) }]
        : undefined,
    });
  }

  // beforeSubmitPrompt / preToolUse without details — keep optimistic chrome.
  if (event === "beforeSubmitPrompt" && state.phase === "idle") {
    return {
      ...state,
      phase: "starting",
    };
  }

  return state;
}

export function agentHookEventAffectsTurnUi(
  message: AgentHookTurnMessage,
): boolean {
  const event = typeof message.event === "string" ? message.event : "";
  if (!event) return false;
  if (event === "afterAgentThought" || event === "beforeSubmitPrompt") {
    return true;
  }
  return (
    TOOL_START_EVENTS.has(event) ||
    TOOL_END_EVENTS.has(event) ||
    TOOL_FAIL_EVENTS.has(event)
  );
}
