/**
 * Local PTY bridge for BacksterOS Development.
 *
 * Default bind is 127.0.0.1. For Tailscale-trusted shells (iPad), set
 * `PTY_HOST=0.0.0.0` (or a Tailscale IP) and `PTY_AUTH_TOKEN` so HTTP/WS
 * require `Authorization: Bearer <token>` (WS may also pass `?token=`).
 * Do not expose this without a token on untrusted networks.
 *
 * Protocol (JSON text frames):
 *   client → server: { type: "input", data: string }
 *                    { type: "resize", cols: number, rows: number }
 *                    { type: "kill" }  — destroy the agent (not just detach)
 *   server → client: { type: "ready", sessionId, taskId?, kind?, reattached?: boolean,
 *                      lastActivity?: string }
 *                    { type: "output", data: string }  — shell PTY only
 *                    { type: "acp-event", ... }       — agent chat (ACP)
 *                    { type: "agent-hook", event: string }
 *                    { type: "exit", code: number | null }
 *                    { type: "error", message: string }
 *
 * WebSocket close only detaches the UI viewer. Durable agent sessions are
 * Cursor ACP (in-process); Chat UIs subscribe per taskId. Shell PTYs use
 * node-pty and stay alive across viewer detach.
 *
 * HTTP:
 *   POST /agent/ensure — ensure Cursor ACP session for a task
 *   POST /agent/stop — cancel ACP, forget session, notify chat subscribers
 *   POST /agent/prompt — Chat follow-up via Cursor ACP (`session/prompt`)
 *   POST /agent/acp/mode — Chat mode via ACP (`session/set_mode`)
 *   POST /agent/acp/cancel — cancel in-flight ACP turn
 *   POST /agent/create-chat — `agent create-chat`
 *   GET/DELETE /sessions — list / kill shell PTYs and ACP agent sessions
 *
 * Cursor Agent hooks POST to /agent-hook so the UI can mark working/idle.
 * Hook POSTs stay unauthenticated (local Cursor → loopback).
 */
import { createServer } from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pty from "node-pty";
import { WebSocketServer } from "ws";

import { ensureCursorAgentHooks } from "./ensure-cursor-agent-hooks.mjs";
import {
  appendChatTranscriptMessage,
  extractHookUserPrompt,
  loadChatTranscript,
  saveChatTranscript,
  upsertAssistantTurnTimeline,
} from "./agent-chat-transcript-store.mjs";
import { stripTransientAgentStreamError } from "./agent-stream-errors.mjs";
import {
  acpCancel,
  acpPrompt,
  acpSetMode,
  acpSetModel,
  acpSteer,
  ensureAcpSessionModel,
  normalizeCursorModeId,
  clearAcpBusy,
  ensureAcpSession,
  ensureAcpSessionCliLink,
  forgetAcpSession,
  getAcpSession,
  listAcpSessions,
  listPendingUiRequests,
  onAcpEvent,
  respondAcpUiRequest,
  setAcpAccessMode,
} from "./agent-acp-manager.mjs";
import {
  broadcastChat,
  chatSubscriberCount,
  closeChatSubscribersForTask,
  registerChatSubscriber,
  unregisterChatSubscriber,
} from "./agent-chat-bus.mjs";
import {
  beginAcpProjectedTurn,
  clearAcpProjectedTurn,
  completeAcpProjectedUiRequest,
  getAcpProjectedTurn,
  markAcpTurnCancelRequested,
  projectAcpSessionUpdate,
  projectAcpUiRequest,
  projectCursorCreatePlan,
  projectCursorUpdateTodos,
  sealAcpProjectedTurn,
  setAcpProjectedTurnCheckpoint,
} from "./agent-acp-projector.mjs";
import {
  createGitCheckpoint,
  deleteGitCheckpoints,
  restoreGitCheckpoint,
} from "./agent-git-checkpoints.mjs";

/**
 * @param {string} taskId
 * @param {ReturnType<typeof getAcpProjectedTurn>} turn
 * @param {"completed" | "interrupted" | "failed"} status
 */
function broadcastTurnState(taskId, turn, status) {
  if (!turn) return;
  broadcastChat(taskId, {
    type: "acp-event",
    event: "turn-state",
    turnId: turn.turnId,
    messageId: turn.messageId,
    sessionId: turn.chatId,
    status,
    completedAt: turn.turnCompletedAt ?? Date.now(),
  });
}

const HOST = process.env.PTY_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PTY_PORT ?? 3101);
/** Always loopback for Cursor hook callbacks (HOST may be 0.0.0.0). */
const HOOK_HOST = "127.0.0.1";
const AUTH_TOKEN = (process.env.PTY_AUTH_TOKEN ?? "").trim() || null;
const SHELL =
  process.env.PTY_SHELL ??
  process.env.SHELL ??
  (process.platform === "win32" ? "powershell.exe" : "/bin/zsh");
const DEFAULT_CWD = process.env.PTY_CWD ?? os.homedir();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Scan at most this many trailing bytes of a transcript for assistant text. */
const TRANSCRIPT_SCAN_BYTES = 512 * 1024;

/** Keep this much PTY output so UI reattach can replay history. */
const SCROLLBACK_MAX_CHARS = 200_000;

/** sessionId → Set of attached UI WebSockets (shell fan-out + agent hook broadcast). */
const sessionsById = new Map();

/**
 * Live shell PTY processes keyed by session id.
 * @type {Map<string, {
 *   pty: import("node-pty").IPty,
 *   cwd: string,
 *   kind?: "agent" | "shell",
 *   taskId?: string | null,
 *   label?: string | null,
 *   createdAt?: string,
 *   lastActivity?: "working" | "idle" | null,
 *   scrollback?: string,
 *   dataDisposable: { dispose: () => void },
 *   exitDisposable: { dispose: () => void },
 * }>}
 */
const ptysById = new Map();

/** @type {Map<string, "working" | "idle">} */
const lastActivityBySession = new Map();
/** Sessions that received sessionEnd since last agent start (survives UI detach). */
const sessionEndedBySession = new Map();

const WORKING_HOOK_EVENTS = new Set([
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  // afterAgentResponse is text-only: in CLI it often arrives *after* stop and
  // must not flip activity back to working (that restarts an In Progress turn).
]);

const IDLE_HOOK_EVENTS = new Set(["stop", "sessionEnd"]);

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function getSessionSockets(sessionId) {
  return sessionsById.get(sessionId) ?? null;
}

function sessionSocketCount(sessionId) {
  return getSessionSockets(sessionId)?.size ?? 0;
}

function addSessionSocket(sessionId, ws) {
  let set = sessionsById.get(sessionId);
  if (!set) {
    set = new Set();
    sessionsById.set(sessionId, set);
  }
  set.add(ws);
}

function removeSessionSocket(sessionId, ws) {
  const set = sessionsById.get(sessionId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) sessionsById.delete(sessionId);
}

function broadcast(sessionId, message) {
  const set = getSessionSockets(sessionId);
  if (!set) return;
  for (const socket of set) send(socket, message);
}

function closeSessionSockets(sessionId) {
  const set = getSessionSockets(sessionId);
  if (set) {
    for (const socket of [...set]) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    sessionsById.delete(sessionId);
  }
}

/**
 * @param {string} taskId
 * @param {string | null | undefined} eventSessionId
 */
function resolveAcpChatId(taskId, eventSessionId) {
  const fromSession = getAcpSession(taskId)?.sessionId ?? null;
  if (fromSession) return fromSession;
  const sid =
    typeof eventSessionId === "string" ? eventSessionId.trim().toLowerCase() : "";
  return sid || null;
}

/**
 * @param {string} sessionId — hook or UI session id (often ACP chat id)
 */
function resolveChatIdForHookSession(sessionId) {
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!sid) return null;
  for (const s of listAcpSessions()) {
    if (s.sessionId === sid) return s.sessionId;
  }
  return null;
}

/**
 * @param {string} sessionId
 */
function resolveTaskIdForHookSession(sessionId) {
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!sid) return null;
  for (const s of listAcpSessions()) {
    if (s.sessionId === sid) return s.taskId;
  }
  return null;
}

/**
 * @param {string} acpSessionId
 */
function findAcpTaskBySessionId(acpSessionId) {
  const sid =
    typeof acpSessionId === "string" ? acpSessionId.trim().toLowerCase() : "";
  if (!sid) return null;
  for (const s of listAcpSessions()) {
    if (s.sessionId === sid) return s.taskId;
  }
  return null;
}

/**
 * Stop durable ACP agent for a task and notify chat subscribers.
 * @param {string} taskId
 * @param {string} [reason]
 */
async function stopAgentTask(taskId, reason = "stop") {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (!id) return false;
  try {
    await acpCancel(id);
  } catch (error) {
    console.warn(
      "[acp] cancel on stop failed:",
      error instanceof Error ? error.message : error,
    );
  }
  clearAcpProjectedTurn(id);
  acpAssistantDraftByTask.delete(id);
  forgetAcpSession(id);
  broadcastChat(id, {
    type: "acp-event",
    event: "activity",
    activity: "idle",
    reason,
  });
  broadcastChat(id, { type: "exit", code: null, reason });
  closeChatSubscribersForTask(id);
  console.log(`[pty] agent stopped task=${id} reason=${reason}`);
  return true;
}

/** In-flight assistant text assembled from ACP agent_message_chunk updates. */
/** @type {Map<string, string>} */
const acpAssistantDraftByTask = new Map();

onAcpEvent((event) => {
  let taskId = typeof event.taskId === "string" ? event.taskId : null;
  if (
    !taskId &&
    (event.type === "permission" ||
      event.type === "ask-question" ||
      event.type === "permission-timeout" ||
      event.type === "ask-question-timeout" ||
      event.type === "ui-request-cleared" ||
      event.type === "cursor-update-todos" ||
      event.type === "cursor-create-plan")
  ) {
    // Fall back to the busy ACP session when Cursor omits sessionId.
    const busy = listAcpSessions().find((session) => session.busy);
    taskId = busy?.taskId ?? listAcpSessions()[0]?.taskId ?? null;
  }
  if (!taskId) return;

  const chatId = resolveAcpChatId(taskId, event.sessionId);

  if (event.type === "activity") {
    const activity = event.activity === "working" ? "working" : "idle";
    let projected = null;
    let isNewTurn = false;
    if (activity === "working" && chatId) {
      const prior = getAcpProjectedTurn(taskId);
      projected = beginAcpProjectedTurn(taskId, chatId);
      isNewTurn = Boolean(
        projected && (!prior || prior.turnId !== projected.turnId),
      );
    }
    broadcastChat(taskId, {
      type: "acp-event",
      event: "activity",
      activity,
      sessionId: event.sessionId ?? chatId ?? null,
      ...(projected?.messageId ? { messageId: projected.messageId } : {}),
      ...(projected?.turnId ? { turnId: projected.turnId } : {}),
    });
    // Only announce turn-begin when a new durable turn was minted.
    if (isNewTurn && projected) {
      broadcastChat(taskId, {
        type: "acp-event",
        event: "turn-begin",
        turnId: projected.turnId,
        messageId: projected.messageId,
        sessionId: event.sessionId ?? chatId ?? null,
        status: "running",
        startedAt: projected.workedStartedAt,
      });
    }
    broadcastChat(taskId, {
      type: "agent-hook",
      event: activity === "working" ? "preToolUse" : "stop",
      activity,
      source: "acp",
    });
    return;
  }

  if (event.type === "session-update") {
    const update = event.update;
    if (chatId) {
      projectAcpSessionUpdate(taskId, chatId, update);
    }
    if (update && typeof update === "object") {
      const u = /** @type {Record<string, unknown>} */ (update);
      if (
        u.sessionUpdate === "agent_message_chunk" &&
        u.content &&
        typeof u.content === "object"
      ) {
        const text = /** @type {{ text?: unknown }} */ (u.content).text;
        if (typeof text === "string" && text) {
          const prev = acpAssistantDraftByTask.get(taskId) || "";
          acpAssistantDraftByTask.set(taskId, prev + text);
        }
      }
    }
    broadcastChat(taskId, {
      type: "acp-event",
      event: "session-update",
      sessionId: event.sessionId ?? chatId ?? null,
      update,
    });
    return;
  }

  if (event.type === "prompt-complete") {
    const draft = stripTransientAgentStreamError(
      acpAssistantDraftByTask.get(taskId) || "",
    ).trim();
    acpAssistantDraftByTask.delete(taskId);
    const live = getAcpProjectedTurn(taskId);
    const status =
      live?.cancelRequested === true ? "interrupted" : "completed";
    const sealed = chatId
      ? sealAcpProjectedTurn(taskId, chatId, draft, { status })
      : null;
    broadcastChat(taskId, {
      type: "acp-event",
      event: "prompt-complete",
      sessionId: event.sessionId ?? chatId ?? null,
      text: draft || null,
      result: event.result ?? null,
      turnId: sealed?.turnId ?? live?.turnId ?? null,
    });
    broadcastTurnState(taskId, sealed ?? live, status);
    if (draft) {
      broadcastChat(taskId, {
        type: "agent-hook",
        event: "afterAgentResponse",
        text: draft,
        source: "acp",
        streaming: false,
      });
    }
    return;
  }

  if (event.type === "prompt-error") {
    acpAssistantDraftByTask.delete(taskId);
    const live = getAcpProjectedTurn(taskId);
    const errorText =
      typeof event.error === "string" ? event.error : "ACP prompt failed";
    const status =
      live?.cancelRequested === true || /cancel/i.test(errorText)
        ? "interrupted"
        : "failed";
    const sealed = chatId
      ? sealAcpProjectedTurn(taskId, chatId, "", { status })
      : null;
    if (!sealed && !chatId) {
      clearAcpProjectedTurn(taskId);
    }
    broadcastChat(taskId, {
      type: "acp-event",
      event: "prompt-error",
      sessionId: event.sessionId ?? chatId ?? null,
      error: errorText,
      turnId: sealed?.turnId ?? live?.turnId ?? null,
    });
    broadcastTurnState(taskId, sealed ?? live, status);
    return;
  }

  if (
    event.type === "permission" ||
    event.type === "ask-question" ||
    event.type === "permission-timeout" ||
    event.type === "ask-question-timeout" ||
    event.type === "ui-request-cleared"
  ) {
    const requestId =
      typeof event.requestId === "string" ? event.requestId : null;
    if (
      (event.type === "permission" || event.type === "ask-question") &&
      event.auto !== true &&
      requestId &&
      chatId
    ) {
      projectAcpUiRequest(taskId, chatId, {
        requestId,
        kind: event.type === "ask-question" ? "ask_question" : "permission",
        title: typeof event.title === "string" ? event.title : null,
        detail: typeof event.detail === "string" ? event.detail : null,
      });
    }
    if (
      (event.type === "permission-timeout" ||
        event.type === "ask-question-timeout" ||
        event.type === "ui-request-cleared") &&
      requestId &&
      chatId
    ) {
      completeAcpProjectedUiRequest(taskId, chatId, requestId);
    }
    broadcastChat(taskId, {
      type: "acp-event",
      event: event.type,
      requestId: event.requestId ?? null,
      auto: event.auto === true,
      title: event.title ?? null,
      detail: event.detail ?? null,
      options: event.options ?? [],
      questions: event.questions ?? [],
      sessionId: event.sessionId ?? chatId ?? null,
      reason: event.reason ?? null,
    });
    return;
  }

  if (event.type === "cursor-update-todos") {
    if (chatId) {
      projectCursorUpdateTodos(taskId, chatId, event.params ?? null);
    }
    broadcastChat(taskId, {
      type: "acp-event",
      event: event.type,
      sessionId: event.sessionId ?? chatId ?? null,
      params: event.params ?? null,
    });
    return;
  }

  if (event.type === "cursor-create-plan") {
    if (chatId) {
      projectCursorCreatePlan(taskId, chatId, event.params ?? null);
    }
    broadcastChat(taskId, {
      type: "acp-event",
      event: event.type,
      sessionId: event.sessionId ?? chatId ?? null,
      params: event.params ?? null,
    });
  }
});

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function resolveHookEventName(payload) {
  if (!payload || typeof payload !== "object") return null;
  const raw =
    payload.hook_event_name ??
    payload.hookEventName ??
    payload.hook_type ??
    payload.hookType ??
    payload.event ??
    null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  // Cursor docs use PascalCase matchers (Stop, AgentResponse); hooks.json
  // keys are camelCase. Normalize so both shapes hit WORKING/IDLE sets.
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const aliases = {
    stop: "stop",
    sessionend: "sessionEnd",
    sessionstart: "sessionStart",
    beforesubmitprompt: "beforeSubmitPrompt",
    afteragentresponse: "afterAgentResponse",
    afteragentthought: "afterAgentThought",
    pretooluse: "preToolUse",
    posttooluse: "postToolUse",
    posttoolusefailure: "postToolUseFailure",
    beforeshellexecution: "beforeShellExecution",
    aftershellexecution: "afterShellExecution",
    beforemcpexecution: "beforeMCPExecution",
    aftermcpexecution: "afterMCPExecution",
    beforereadfile: "beforeReadFile",
    afterfileedit: "afterFileEdit",
  };
  return aliases[lower] ?? trimmed;
}

function asNonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

/** True when the prompt is only a Cursor mode slash (`/ask`, `/plan`, …). */
function isModeSlashPrompt(text) {
  const trimmed = typeof text === "string" ? text.trim().toLowerCase() : "";
  return (
    trimmed === "/ask" ||
    trimmed === "/plan" ||
    trimmed === "/agent" ||
    trimmed === "/debug" ||
    trimmed === "/build"
  );
}

/**
 * Tool / thought fields for Chat turn chrome (ActivityList, PlanTodoList).
 * @param {Record<string, unknown>} payload
 * @param {string} event
 */
function extractHookTurnDetails(payload, event) {
  if (!payload || typeof payload !== "object") return {};
  let toolName =
    (typeof payload.tool_name === "string" && payload.tool_name.trim()) ||
    (typeof payload.toolName === "string" && payload.toolName.trim()) ||
    (typeof payload.tool === "string" && payload.tool.trim()) ||
    null;
  const toolUseId =
    (typeof payload.tool_use_id === "string" && payload.tool_use_id.trim()) ||
    (typeof payload.toolUseId === "string" && payload.toolUseId.trim()) ||
    (typeof payload.tool_call_id === "string" && payload.tool_call_id.trim()) ||
    null;

  // Specialized file hooks often omit tool_name — synthesize so Chat still
  // gets Read / Edit activity rows.
  if (!toolName && event === "beforeReadFile") toolName = "Read";
  if (!toolName && event === "afterFileEdit") toolName = "Write";
  if (!toolName && (event === "beforeShellExecution" || event === "afterShellExecution")) {
    toolName = "Shell";
  }
  if (!toolName && (event === "beforeMCPExecution" || event === "afterMCPExecution")) {
    const meta =
      payload.metadata && typeof payload.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (payload.metadata)
        : null;
    const mcpName =
      (typeof meta?.tool_name === "string" && meta.tool_name.trim()) ||
      (typeof payload.tool_name === "string" && payload.tool_name.trim()) ||
      "MCP";
    toolName = mcpName.startsWith("MCP") ? mcpName : `MCP:${mcpName}`;
  }

  let toolInput =
    payload.tool_input ??
    payload.toolInput ??
    payload.input ??
    payload.arguments ??
    null;

  // afterFileEdit / beforeReadFile: { file_path, edits?, content? }
  const filePath =
    (typeof payload.file_path === "string" && payload.file_path.trim()) ||
    (typeof payload.filePath === "string" && payload.filePath.trim()) ||
    null;
  if ((!toolInput || typeof toolInput !== "object") && (filePath || payload.edits || payload.command)) {
    toolInput = {
      ...(filePath ? { file_path: filePath } : {}),
      ...(Array.isArray(payload.edits) ? { edits: payload.edits } : {}),
      ...(typeof payload.command === "string" ? { command: payload.command } : {}),
    };
  }
  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    // Never forward full file bodies into the Chat WS fan-out.
    const record = /** @type {Record<string, unknown>} */ ({ ...toolInput });
    delete record.content;
    delete record.tool_output;
    delete record.result_json;
    toolInput = record;
  }

  let toolOutput =
    typeof payload.tool_output === "string"
      ? payload.tool_output
      : typeof payload.toolOutput === "string"
        ? payload.toolOutput
        : typeof payload.output === "string"
          ? payload.output
          : null;
  if (typeof toolOutput === "string" && toolOutput.length > 8000) {
    toolOutput = `${toolOutput.slice(0, 8000)}…`;
  }

  const errorMessage =
    typeof payload.error_message === "string"
      ? payload.error_message
      : typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : null;
  const durationMs = asNonNegativeInt(
    payload.duration_ms ?? payload.durationMs ?? payload.duration,
  );
  // afterAgentThought / afterAgentResponse use `text`; keep for thoughts.
  const text =
    event === "afterAgentThought" || event === "afterAgentResponse"
      ? typeof payload.text === "string"
        ? payload.text
        : typeof payload.thought === "string"
          ? payload.thought
          : null
      : null;

  return {
    ...(toolName ? { toolName } : {}),
    ...(toolUseId ? { toolUseId } : {}),
    ...(toolInput != null ? { toolInput } : {}),
    ...(toolOutput != null ? { toolOutput } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(durationMs != null ? { durationMs } : {}),
    ...(text != null && text.length > 0 ? { thoughtText: text } : {}),
  };
}

/**
 * Cursor stop hooks / stream-json usage may use snake_case or camelCase.
 * Prefer explicit usage object, then top-level fields.
 */
function extractHookUsage(payload) {
  if (!payload || typeof payload !== "object") return null;
  const usage =
    payload.usage && typeof payload.usage === "object"
      ? payload.usage
      : payload.token_usage && typeof payload.token_usage === "object"
        ? payload.token_usage
        : payload.tokenUsage && typeof payload.tokenUsage === "object"
          ? payload.tokenUsage
          : payload;

  const inputTokens = asNonNegativeInt(
    usage.inputTokens ?? usage.input_tokens,
  );
  const outputTokens = asNonNegativeInt(
    usage.outputTokens ?? usage.output_tokens,
  );
  const cacheReadTokens = asNonNegativeInt(
    usage.cacheReadTokens ?? usage.cache_read_tokens,
  );
  const cacheWriteTokens = asNonNegativeInt(
    usage.cacheWriteTokens ?? usage.cache_write_tokens,
  );
  const durationMs = asNonNegativeInt(
    payload.duration_ms ??
      payload.durationMs ??
      usage.duration_ms ??
      usage.durationMs ??
      usage.duration,
  );
  const status =
    typeof payload.status === "string"
      ? payload.status
      : typeof usage.status === "string"
        ? usage.status
        : null;
  const conversationId =
    (typeof payload.conversation_id === "string" && payload.conversation_id) ||
    (typeof payload.conversationId === "string" && payload.conversationId) ||
    null;

  if (
    inputTokens == null &&
    outputTokens == null &&
    cacheReadTokens == null &&
    cacheWriteTokens == null &&
    durationMs == null &&
    !status &&
    !conversationId
  ) {
    return null;
  }

  let totalTokens = asNonNegativeInt(
    usage.totalTokens ?? usage.total_tokens,
  );
  if (totalTokens == null) {
    const parts = [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens]
      .filter((value) => value != null);
    if (parts.length > 0) {
      totalTokens = parts.reduce((sum, value) => sum + value, 0);
    }
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    durationMs,
    status,
    conversationId,
  };
}

function extractAssistantContentText(content) {
  if (typeof content === "string" && content.trim()) return content.trim();
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (typeof part.text === "string" && part.text.trim()) {
      parts.push(part.text.trim());
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Pull assistant prose from one JSONL transcript line (Cursor / Claude shapes). */
function extractAssistantTextFromLine(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (!entry || typeof entry !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (entry);

  if (record.type === "assistant.message") {
    const data = record.data;
    if (data && typeof data === "object") {
      const text = extractAssistantContentText(
        /** @type {Record<string, unknown>} */ (data).content,
      );
      if (text) return text;
    }
  }

  const nested =
    record.message && typeof record.message === "object"
      ? /** @type {Record<string, unknown>} */ (record.message)
      : null;
  const role =
    record.role ??
    nested?.role ??
    (record.type === "assistant" ? "assistant" : undefined);
  if (role !== "assistant") return null;
  return extractAssistantContentText((nested ?? record).content);
}

function isUserTranscriptLine(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return false;
  }
  if (!entry || typeof entry !== "object") return false;
  const record = /** @type {Record<string, unknown>} */ (entry);
  if (record.type === "user.message") return true;
  const nested =
    record.message && typeof record.message === "object"
      ? /** @type {Record<string, unknown>} */ (record.message)
      : null;
  const role =
    record.role ??
    nested?.role ??
    (record.type === "user" ? "user" : undefined);
  return role === "user";
}

/**
 * Cursor CLI often skips `afterAgentResponse` — read the last assistant
 * message from the conversation transcript when the stop hook includes a path.
 * Prefer the last assistant message after the most recent user turn (final reply),
 * not earlier status/narration lines from the same turn.
 */
function readLastAssistantFromTranscript(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath.trim()) {
    return null;
  }
  try {
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const size = fs.fstatSync(fd).size;
      if (size <= 0) return null;
      const readSize = Math.min(size, TRANSCRIPT_SCAN_BYTES);
      const buffer = Buffer.alloc(readSize);
      fs.readSync(fd, buffer, 0, readSize, size - readSize);
      const text = buffer.toString("utf8");
      const lines = text.split(/\r?\n/);
      let lastUserIndex = -1;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]?.trim();
        if (!line) continue;
        if (isUserTranscriptLine(line)) lastUserIndex = i;
      }
      const start = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
      let lastAssistant = null;
      for (let i = start; i < lines.length; i += 1) {
        const line = lines[i]?.trim();
        if (!line) continue;
        const extracted = extractAssistantTextFromLine(line);
        if (extracted) lastAssistant = extracted;
      }
      if (lastAssistant) return lastAssistant;
      // Fallback: last assistant anywhere in the scanned window.
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i]?.trim();
        if (!line) continue;
        const extracted = extractAssistantTextFromLine(line);
        if (extracted) return extracted;
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** @type {Map<string, string>} */
const transcriptPathByConversationId = new Map();

function resolveTranscriptPath(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    (typeof payload.transcript_path === "string" && payload.transcript_path) ||
    (typeof payload.transcriptPath === "string" && payload.transcriptPath) ||
    null;
  if (direct?.trim()) return direct.trim();

  const conversationId =
    (typeof payload.conversation_id === "string" && payload.conversation_id) ||
    (typeof payload.conversationId === "string" && payload.conversationId) ||
    null;
  if (!conversationId?.trim()) return null;

  const cached = transcriptPathByConversationId.get(conversationId);
  if (cached) return cached;

  const projectsRoot = path.join(os.homedir(), ".cursor", "projects");
  try {
    for (const project of fs.readdirSync(projectsRoot)) {
      const candidate = path.join(
        projectsRoot,
        project,
        "agent-transcripts",
        conversationId,
        `${conversationId}.jsonl`,
      );
      if (fs.existsSync(candidate)) {
        transcriptPathByConversationId.set(conversationId, candidate);
        return candidate;
      }
    }
  } catch {
    // ignore lookup failures
  }
  return null;
}

function extractHookAssistantText(payload, event) {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.message === "string" && payload.message) ||
    (typeof payload.assistant_text === "string" && payload.assistant_text) ||
    (typeof payload.assistantText === "string" && payload.assistantText) ||
    (typeof payload.content === "string" && payload.content) ||
    null;
  const transcriptPath = resolveTranscriptPath(payload);
  const fromTranscript = readLastAssistantFromTranscript(transcriptPath);

  // On turn end, prefer the transcript's final assistant message over hook
  // payload text (payload can be intermediate narration or a concat of updates).
  if (event === "stop" || event === "sessionEnd") {
    if (fromTranscript?.trim()) return fromTranscript.trim();
    if (direct?.trim()) return direct.trim();
    return null;
  }

  if (direct?.trim()) return direct.trim();
  return fromTranscript?.trim() || null;
}

function handleAgentHook(sessionId, payloadText) {
  let payload = null;
  try {
    payload = JSON.parse(payloadText || "{}");
  } catch {
    payload = {};
  }
  const event = resolveHookEventName(payload);
  if (!event) return false;

  let activity = null;
  if (IDLE_HOOK_EVENTS.has(event)) activity = "idle";
  else if (WORKING_HOOK_EVENTS.has(event)) activity = "working";
  // afterAgentResponse: leave activity null so the UI only stores text.

  if (activity === "working" || activity === "idle") {
    lastActivityBySession.set(sessionId, activity);
    const entry = ptysById.get(sessionId);
    if (entry) entry.lastActivity = activity;
  }
  if (event === "sessionEnd") {
    sessionEndedBySession.set(sessionId, true);
  } else if (
    WORKING_HOOK_EVENTS.has(event) ||
    event === "sessionStart" ||
    event === "beforeSubmitPrompt"
  ) {
    sessionEndedBySession.delete(sessionId);
  }

  const usage = extractHookUsage(payload);
  // CLI often omits afterAgentResponse; on stop pull text from the payload or
  // transcript so hold/review comments still get the assistant message.
  const text = extractHookAssistantText(payload, event);
  const turnDetails = extractHookTurnDetails(payload, event);

  // Shared Chat-tab history (desktop + iPad): record turns on the laptop.
  const chatId = resolveChatIdForHookSession(sessionId);
  const hookTaskId = resolveTaskIdForHookSession(sessionId);
  if (chatId) {
    if (event === "beforeSubmitPrompt") {
      const prompt = extractHookUserPrompt(payload);
      // Mode slash alone (`/ask`, `/plan`, …) is a TUI command, not a chat turn.
      if (prompt && !isModeSlashPrompt(prompt)) {
        appendChatTranscriptMessage(chatId, { role: "user", text: prompt });
      }
    } else if (
      (event === "afterAgentResponse" ||
        event === "stop" ||
        event === "sessionEnd") &&
      text?.trim()
    ) {
      // Fold into projector-owned assistant when present (never a 2nd bubble).
      appendChatTranscriptMessage(chatId, {
        role: "assistant",
        text: text.trim(),
      });
    }
  }

  if (sessionSocketCount(sessionId) === 0 && !hookTaskId) {
    // Detached UI — keep lastActivity / sessionEnded for reattach; still accept.
    // Tool chrome cannot render without a viewer, but log so we can diagnose
    // "hooks fire but Chat shows nothing" cases.
    if (turnDetails.toolName) {
      console.log(
        `[pty] hook ${event} tool=${turnDetails.toolName} session=${sessionId} (no viewers)`,
      );
    }
    return true;
  }

  if (turnDetails.toolName) {
    console.log(
      `[pty] hook ${event} tool=${turnDetails.toolName} session=${sessionId}`,
    );
  }

  const hookMessage = {
    type: "agent-hook",
    event,
    activity,
    ...(usage ? { usage } : {}),
    ...(text != null && text.length > 0 ? { text } : {}),
    ...turnDetails,
    // Prefer dedicated thoughtText for afterAgentThought when `text` is also set.
    ...(turnDetails.thoughtText && event === "afterAgentThought"
      ? { text: turnDetails.thoughtText }
      : {}),
  };

  if (hookTaskId) {
    broadcastChat(hookTaskId, hookMessage);
  }
  if (sessionSocketCount(sessionId) > 0) {
    broadcast(sessionId, hookMessage);
  }
  return true;
}

function applyLocalCors(req, res) {
  const origin = req.headers.origin;
  // Desktop UI is localhost:1420 / Tauri; PTY is 127.0.0.1 — different origins.
  // Native Expo WebViews often omit Origin; token auth covers those clients.
  if (
    typeof origin === "string" &&
    (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
      /^tauri:\/\//i.test(origin) ||
      /\.localhost$/i.test(new URL(origin).hostname) ||
      /^https?:\/\/.*\.exp\.direct(:\d+)?$/i.test(origin) ||
      /^https?:\/\/.*\.exp\.host(:\d+)?$/i.test(origin))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Backsteros-Session",
  );
}

function extractBearerToken(req, url) {
  const header = req.headers.authorization;
  if (typeof header === "string") {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  const queryToken = url?.searchParams.get("token")?.trim();
  return queryToken || null;
}

function isAuthorized(req, url) {
  if (!AUTH_TOKEN) return true;
  const provided = extractBearerToken(req, url);
  return Boolean(provided && provided === AUTH_TOKEN);
}

function rejectUnauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Unauthorized", code: "unauthorized" }));
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  try {
    applyLocalCors(req, res);
  } catch {
    /* ignore bad Origin */
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/agent-hook") {
    try {
      const body = await readRequestBody(req);
      const sessionId =
        req.headers["x-backsteros-session"] ||
        url.searchParams.get("sessionId") ||
        "";
      if (!sessionId || typeof sessionId !== "string") {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("missing session\n");
        return;
      }
      handleAgentHook(sessionId, body);
      res.writeHead(204);
      res.end();
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : "hook error\n");
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/agent/models") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout, stderr } = await execFileAsync(
        "agent",
        ["--list-models"],
        {
          timeout: 20_000,
          env: process.env,
          maxBuffer: 1024 * 1024,
        },
      );
      const text = `${stdout}\n${stderr}`;
      /** @type {{ id: string, displayName: string }[]} */
      const models = [];
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || /^available models$/i.test(trimmed)) continue;
        const match = /^(\S+)\s+-\s+(.+)$/.exec(trimmed);
        if (!match) continue;
        const id = match[1];
        const displayName = match[2].trim();
        if (!id || models.some((m) => m.id === id)) continue;
        models.push({ id, displayName });
      }
      if (!models.some((m) => m.id === "auto")) {
        models.unshift({ id: "auto", displayName: "Auto" });
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ models }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to list Cursor models.",
        }),
      );
      return;
    }
  }

  const timelineMatch = /^\/agent\/chats\/([^/]+)\/transcript\/timeline$/.exec(
    url.pathname,
  );
  if (timelineMatch) {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    const chatId = decodeURIComponent(timelineMatch[1] || "").trim();
    if (!chatId) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "chatId is required." }));
      return;
    }
    if (req.method === "POST") {
      try {
        const bodyText = await readRequestBody(req);
        let body = {};
        try {
          body = JSON.parse(bodyText || "{}");
        } catch {
          body = {};
        }
        const result = upsertAssistantTurnTimeline(chatId, {
          id: typeof body.id === "string" ? body.id : undefined,
          text: typeof body.text === "string" ? body.text : undefined,
          createdAt:
            typeof body.createdAt === "number" ? body.createdAt : undefined,
          activities: Array.isArray(body.activities)
            ? body.activities
            : undefined,
          segments: Array.isArray(body.segments) ? body.segments : undefined,
          planSteps: Array.isArray(body.planSteps) ? body.planSteps : undefined,
          proposedPlanMarkdown:
            typeof body.proposedPlanMarkdown === "string"
              ? body.proposedPlanMarkdown
              : body.proposedPlanMarkdown === null
                ? null
                : undefined,
          workedStartedAt:
            typeof body.workedStartedAt === "number"
              ? body.workedStartedAt
              : body.workedStartedAt === null
                ? null
                : undefined,
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            chatId: chatId.toLowerCase(),
            message: result.message,
            messages: result.messages,
          }),
        );
        return;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Failed to upsert transcript timeline.",
          }),
        );
        return;
      }
    }
  }

  const transcriptMatch = /^\/agent\/chats\/([^/]+)\/transcript$/.exec(
    url.pathname,
  );
  if (transcriptMatch) {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    const chatId = decodeURIComponent(transcriptMatch[1] || "").trim();
    if (!chatId) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "chatId is required." }));
      return;
    }

    if (req.method === "GET") {
      const messages = loadChatTranscript(chatId);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ chatId: chatId.toLowerCase(), messages }));
      return;
    }

    if (req.method === "PUT") {
      try {
        const bodyText = await readRequestBody(req);
        let body = {};
        try {
          body = JSON.parse(bodyText || "{}");
        } catch {
          body = {};
        }
        const list = Array.isArray(body.messages) ? body.messages : [];
        saveChatTranscript(chatId, list);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            chatId: chatId.toLowerCase(),
            messages: loadChatTranscript(chatId),
          }),
        );
        return;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Failed to save transcript.",
          }),
        );
        return;
      }
    }

    if (req.method === "POST") {
      try {
        const bodyText = await readRequestBody(req);
        let body = {};
        try {
          body = JSON.parse(bodyText || "{}");
        } catch {
          body = {};
        }
        const role = body.role === "assistant" ? "assistant" : "user";
        const text = typeof body.text === "string" ? body.text : "";
        const result = appendChatTranscriptMessage(chatId, {
          role,
          text,
          id: typeof body.id === "string" ? body.id : undefined,
          createdAt:
            typeof body.createdAt === "number" ? body.createdAt : undefined,
          // Preserve T3-style "Worked for…" timeline when the UI finalizes a turn.
          activities: Array.isArray(body.activities)
            ? body.activities
            : undefined,
          segments: Array.isArray(body.segments) ? body.segments : undefined,
          planSteps: Array.isArray(body.planSteps) ? body.planSteps : undefined,
          proposedPlanMarkdown:
            typeof body.proposedPlanMarkdown === "string"
              ? body.proposedPlanMarkdown
              : body.proposedPlanMarkdown === null
                ? null
                : undefined,
          workedStartedAt:
            typeof body.workedStartedAt === "number"
              ? body.workedStartedAt
              : body.workedStartedAt === null
                ? null
                : undefined,
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            chatId: chatId.toLowerCase(),
            appended: result.appended,
            messages: result.messages,
          }),
        );
        return;
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Failed to append transcript message.",
          }),
        );
        return;
      }
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/create-chat") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout, stderr } = await execFileAsync("agent", ["create-chat"], {
        timeout: 20_000,
        env: process.env,
        maxBuffer: 1024 * 1024,
      });
      const text = `${stdout}\n${stderr}`;
      const chatId = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            line,
          ),
        );
      if (!chatId) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "Could not parse chat id from `agent create-chat`.",
            detail: text.trim().slice(0, 500) || null,
          }),
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ chatId: chatId.toLowerCase() }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to create Cursor chat.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/acp/ensure") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const sessionId =
        typeof body.sessionId === "string"
          ? body.sessionId.trim().toLowerCase()
          : typeof body.chatId === "string"
            ? body.chatId.trim().toLowerCase()
            : "";
      let cwd = DEFAULT_CWD;
      const cwdRaw = typeof body.cwd === "string" ? body.cwd.trim() : "";
      if (cwdRaw === "~") cwd = os.homedir();
      else if (cwdRaw.startsWith("~/")) {
        cwd = path.join(os.homedir(), cwdRaw.slice(2));
      } else if (cwdRaw && path.isAbsolute(cwdRaw)) {
        cwd = cwdRaw;
      } else if (cwdRaw) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "cwd must be an absolute path." }));
        return;
      }
      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId is required." }));
        return;
      }

      const forceNew = body.forceNew === true || body.clear === true;

      const ensured = await ensureAcpSession({
        taskId,
        cwd,
        sessionId: forceNew ? null : sessionId || null,
        forceNew,
      });

      try {
        ensureAcpSessionCliLink(ensured.sessionId, ensured.cwd || cwd);
      } catch (error) {
        console.warn(
          "[pty] ACP→CLI link on ensure failed:",
          error instanceof Error ? error.message : error,
        );
      }

      const acp = getAcpSession(taskId);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          taskId,
          sessionId: ensured.sessionId,
          chatId: ensured.sessionId,
          cwd: ensured.cwd,
          created: ensured.created,
          resumed: ensured.resumed,
          modelId: acp?.modelId ?? null,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to ensure ACP session.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/prompt") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const prompt =
        typeof body.prompt === "string"
          ? body.prompt
          : typeof body.text === "string"
            ? body.text
            : "";
      const trimmed = prompt.trim();
      const hasImages = Array.isArray(body.images) && body.images.length > 0;
      if (!taskId || (!trimmed && !hasImages)) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId and prompt are required." }));
        return;
      }

      // Chat is ACP-only (T3-style).
      const cwd =
        (typeof body.cwd === "string" && body.cwd.trim()) || DEFAULT_CWD;
      const preferredSession =
        (typeof body.chatId === "string" && body.chatId.trim().toLowerCase()) ||
        (typeof body.sessionId === "string" &&
          body.sessionId.trim().toLowerCase()) ||
        getAcpSession(taskId)?.sessionId ||
        null;
      const modeId =
        normalizeCursorModeId(
          typeof body.mode === "string"
            ? body.mode
            : typeof body.modeId === "string"
              ? body.modeId
              : null,
        ) || null;
      const requestedModelId =
        typeof body.model === "string"
          ? body.model.trim()
          : typeof body.modelId === "string"
            ? body.modelId.trim()
            : null;

      const images = Array.isArray(body.images)
        ? body.images
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const mimeType =
                typeof entry.mimeType === "string" ? entry.mimeType.trim() : "";
              const data =
                typeof entry.data === "string"
                  ? entry.data.trim()
                  : typeof entry.dataBase64 === "string"
                    ? entry.dataBase64.trim()
                    : "";
              if (!mimeType.startsWith("image/") || !data) return null;
              return { mimeType, data };
            })
            .filter(Boolean)
        : [];

      const ensured = await ensureAcpSession({
        taskId,
        cwd,
        sessionId: preferredSession,
      });
      try {
        ensureAcpSessionCliLink(ensured.sessionId, ensured.cwd || cwd);
      } catch (error) {
        console.warn(
          "[pty] ACP→CLI link on prompt failed:",
          error instanceof Error ? error.message : error,
        );
      }

      const priorTurn = getAcpProjectedTurn(taskId);
      const projected = beginAcpProjectedTurn(taskId, ensured.sessionId);
      const isNewTurn = Boolean(
        projected && (!priorTurn || priorTurn.turnId !== projected.turnId),
      );

      // Do not clearAcpBusy here — that let stacked /agent/prompt calls bypass the
      // in-flight guard. Stale locks are healed inside acpPrompt when no RPC is pending.

      appendChatTranscriptMessage(ensured.sessionId, {
        role: "user",
        text: trimmed || (images.length > 0 ? "(image)" : ""),
        turnId: projected?.turnId ?? null,
      });
      acpAssistantDraftByTask.set(taskId, "");

      if (isNewTurn && projected) {
        broadcastChat(taskId, {
          type: "acp-event",
          event: "turn-begin",
          turnId: projected.turnId,
          messageId: projected.messageId,
          sessionId: ensured.sessionId,
          status: "running",
          startedAt: projected.workedStartedAt,
        });
        // Await snapshot so sealed turns keep checkpointId (soft timeout).
        const checkpointCwd = ensured.cwd || cwd;
        try {
          const checkpoint = await Promise.race([
            createGitCheckpoint(checkpointCwd, {
              turnId: projected.turnId,
            }),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("checkpoint timeout")), 2500);
            }),
          ]);
          setAcpProjectedTurnCheckpoint(taskId, checkpoint.checkpointId);
        } catch (error) {
          console.warn(
            "[pty] checkpoint capture failed:",
            error instanceof Error ? error.message : error,
          );
        }
      }

      // Pin model on first prompt; later prompts keep the session pin.
      let modelId = getAcpSession(taskId)?.modelId ?? null;
      try {
        const modelResult = await ensureAcpSessionModel({
          taskId,
          requestedModelId,
        });
        modelId = modelResult.modelId;
      } catch (error) {
        console.warn(
          "[pty] ACP model apply failed:",
          error instanceof Error ? error.message : error,
        );
      }

      broadcastChat(taskId, {
        type: "agent-hook",
        event: "beforeSubmitPrompt",
        activity: "working",
        source: "acp",
        text: trimmed || (images.length > 0 ? "(image)" : ""),
      });

      const result = await acpPrompt({
        taskId,
        prompt: trimmed,
        modeId,
        images,
      });

      console.log(
        `[pty] agent prompt via acp task=${taskId} session=${ensured.sessionId}`,
      );

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          taskId,
          sessionId: ensured.sessionId,
          chatId: ensured.sessionId,
          turnId: projected?.turnId ?? null,
          messageId: projected?.messageId ?? null,
          modelId,
          via: "acp",
          result: result ?? null,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to submit agent prompt.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/git/head") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const cwd =
        typeof body.cwd === "string" && body.cwd.trim()
          ? body.cwd.trim()
          : DEFAULT_CWD;
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd,
          timeout: 8_000,
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            ok: true,
            headSha: String(stdout || "").trim() || null,
          }),
        );
      } catch {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, headSha: null }));
      }
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to read git HEAD.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/git/revert") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const cwd =
        typeof body.cwd === "string" && body.cwd.trim()
          ? body.cwd.trim()
          : DEFAULT_CWD;
      const headSha =
        typeof body.headSha === "string" && body.headSha.trim()
          ? body.headSha.trim()
          : null;
      const paths = Array.isArray(body.paths)
        ? body.paths
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
        : [];
      const patches = Array.isArray(body.patches)
        ? body.patches
            .map((entry) => (typeof entry === "string" ? entry : ""))
            .filter((entry) => entry.trim())
        : [];

      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const restored = [];
      const errors = [];

      if (headSha && paths.length > 0) {
        try {
          await execFileAsync(
            "git",
            ["checkout", headSha, "--", ...paths],
            { cwd, timeout: 30_000 },
          );
          restored.push(...paths);
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : "git checkout failed",
          );
        }
      }

      if (restored.length === 0 && patches.length > 0) {
        const tmpDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "backsteros-revert-"),
        );
        try {
          for (let i = 0; i < patches.length; i += 1) {
            const patchPath = path.join(tmpDir, `patch-${i}.diff`);
            await fs.promises.writeFile(patchPath, patches[i], "utf8");
            try {
              await execFileAsync(
                "git",
                ["apply", "-R", "--whitespace=nowarn", patchPath],
                { cwd, timeout: 20_000 },
              );
            } catch (error) {
              errors.push(
                error instanceof Error
                  ? error.message
                  : `git apply -R failed for patch ${i}`,
              );
            }
          }
        } finally {
          await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(
            () => undefined,
          );
        }
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: errors.length === 0 || restored.length > 0,
          restored,
          errors,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to revert workspace files.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/acp/mode") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const modeId = normalizeCursorModeId(
        typeof body.mode === "string"
          ? body.mode
          : typeof body.modeId === "string"
            ? body.modeId
            : null,
      );
      const preferredSession =
        (typeof body.chatId === "string" && body.chatId.trim().toLowerCase()) ||
        (typeof body.sessionId === "string" &&
          body.sessionId.trim().toLowerCase()) ||
        null;
      let cwd = DEFAULT_CWD;
      const cwdRaw = typeof body.cwd === "string" ? body.cwd.trim() : "";
      if (cwdRaw === "~") cwd = os.homedir();
      else if (cwdRaw.startsWith("~/")) {
        cwd = path.join(os.homedir(), cwdRaw.slice(2));
      } else if (cwdRaw && path.isAbsolute(cwdRaw)) {
        cwd = cwdRaw;
      }

      if (!taskId || !modeId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "taskId and mode (build|plan|ask|agent) are required.",
          }),
        );
        return;
      }

      if (!getAcpSession(taskId)) {
        await ensureAcpSession({
          taskId,
          cwd,
          sessionId: preferredSession,
        });
      }

      // Chat mode is ACP-only (T3-style).
      const result = await acpSetMode({ taskId, modeId });

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          taskId,
          modeId: result.modeId,
          sessionId: result.sessionId,
          unchanged: result.unchanged === true,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to set agent mode.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/acp/model") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const modelId =
        typeof body.model === "string"
          ? body.model.trim()
          : typeof body.modelId === "string"
            ? body.modelId.trim()
            : "";
      const preferredSession =
        (typeof body.chatId === "string" && body.chatId.trim().toLowerCase()) ||
        (typeof body.sessionId === "string" &&
          body.sessionId.trim().toLowerCase()) ||
        null;
      let cwd = DEFAULT_CWD;
      const cwdRaw = typeof body.cwd === "string" ? body.cwd.trim() : "";
      if (cwdRaw === "~") cwd = os.homedir();
      else if (cwdRaw.startsWith("~/")) {
        cwd = path.join(os.homedir(), cwdRaw.slice(2));
      } else if (cwdRaw && path.isAbsolute(cwdRaw)) {
        cwd = cwdRaw;
      }

      if (!taskId || !modelId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "taskId and model are required.",
          }),
        );
        return;
      }

      if (!getAcpSession(taskId)) {
        await ensureAcpSession({
          taskId,
          cwd,
          sessionId: preferredSession,
        });
      }

      const result = await acpSetModel({ taskId, modelId });

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          taskId,
          modelId: result.modelId,
          sessionId: result.sessionId,
          unchanged: result.unchanged === true,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to set agent model.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/acp/cancel") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId is required." }));
        return;
      }
      markAcpTurnCancelRequested(taskId);
      const ok = await acpCancel(taskId);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, cancelled: ok, taskId }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to cancel ACP turn.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/steer") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const expectedTurnId =
        typeof body.expectedTurnId === "string"
          ? body.expectedTurnId.trim()
          : "";
      const trimmed =
        typeof body.prompt === "string" ? body.prompt.trim() : "";
      const images = Array.isArray(body.images)
        ? body.images
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const mimeType =
                typeof entry.mimeType === "string" ? entry.mimeType.trim() : "";
              const data =
                typeof entry.data === "string"
                  ? entry.data.trim()
                  : typeof entry.dataBase64 === "string"
                    ? entry.dataBase64.trim()
                    : "";
              if (!mimeType.startsWith("image/") || !data) return null;
              return { mimeType, data };
            })
            .filter(Boolean)
        : [];
      if (!taskId || !expectedTurnId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "taskId and expectedTurnId are required.",
          }),
        );
        return;
      }
      if (!trimmed && images.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "prompt is required." }));
        return;
      }
      const clientMessageId =
        typeof body.clientMessageId === "string"
          ? body.clientMessageId.trim()
          : "";
      const live = getAcpProjectedTurn(taskId);
      if (
        !live ||
        live.turnStatus !== "running" ||
        live.turnId !== expectedTurnId
      ) {
        res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            error: "No matching running turn to steer.",
            code: "turn_mismatch",
          }),
        );
        return;
      }
      // Idempotent retry: if this clientMessageId was already accepted, do not
      // re-prompt Cursor — just acknowledge.
      if (clientMessageId) {
        const existing = loadChatTranscript(live.chatId);
        if (existing.some((msg) => msg?.id === clientMessageId)) {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              taskId,
              turnId: live.turnId,
              messageId: live.messageId,
              clientMessageId,
              deduped: true,
            }),
          );
          return;
        }
      }

      // Accept steer first — only then persist the user row (idempotent by id).
      const result = await acpSteer({
        taskId,
        prompt: trimmed,
        images,
      });
      appendChatTranscriptMessage(live.chatId, {
        ...(clientMessageId ? { id: clientMessageId } : {}),
        role: "user",
        text: trimmed || "(image)",
        turnId: live.turnId,
      });
      broadcastChat(taskId, {
        type: "acp-event",
        event: "turn-steered",
        turnId: live.turnId,
        messageId: live.messageId,
        clientMessageId: clientMessageId || null,
        sessionId: live.chatId,
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          taskId,
          turnId: live.turnId,
          messageId: live.messageId,
          clientMessageId: clientMessageId || null,
          result: result ?? null,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Failed to steer turn.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/acp/access-mode") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const mode =
        body.mode === "full_access"
          ? "full_access"
          : body.mode === "auto_accept_edits"
            ? "auto_accept_edits"
            : "supervised";
      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId is required." }));
        return;
      }
      if (!getAcpSession(taskId)) {
        const cwd =
          typeof body.cwd === "string" && body.cwd.trim()
            ? body.cwd.trim()
            : DEFAULT_CWD;
        await ensureAcpSession({ taskId, cwd });
      }
      const result = setAcpAccessMode(taskId, mode);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to set access mode.",
        }),
      );
      return;
    }
  }

  if (
    req.method === "POST" &&
    url.pathname === "/agent/git/checkpoints/restore"
  ) {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const cwd =
        typeof body.cwd === "string" && body.cwd.trim()
          ? body.cwd.trim()
          : DEFAULT_CWD;
      const checkpointId =
        typeof body.checkpointId === "string" ? body.checkpointId.trim() : "";
      if (!checkpointId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "checkpointId is required." }));
        return;
      }
      const restored = await restoreGitCheckpoint(cwd, checkpointId);
      const deleteIds = Array.isArray(body.deleteCheckpointIds)
        ? body.deleteCheckpointIds
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
        : [];
      if (deleteIds.length > 0) {
        await deleteGitCheckpoints(cwd, deleteIds);
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, restored: true, ...restored }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          restored: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to restore checkpoint.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/acp/respond") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const requestId =
        typeof body.requestId === "string" ? body.requestId.trim() : "";
      const optionId =
        typeof body.optionId === "string" ? body.optionId.trim() : null;
      const preference =
        body.preference === "always" ||
        body.preference === "reject" ||
        body.preference === "once"
          ? body.preference
          : null;
      const skipped = body.skipped === true;
      const answers =
        body.answers && typeof body.answers === "object"
          ? body.answers
          : null;
      const result = respondAcpUiRequest({
        requestId,
        optionId,
        preference,
        skipped,
        answers,
      });
      if (!result.ok) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to respond to ACP UI request.",
        }),
      );
      return;
    }
  }


  if (req.method === "POST" && url.pathname === "/agent/stop") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId is required." }));
        return;
      }
      await stopAgentTask(taskId, "http-stop");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Failed to stop agent.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/agent/ensure") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const bodyText = await readRequestBody(req);
      let body = {};
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        body = {};
      }
      const taskId =
        typeof body.taskId === "string" ? body.taskId.trim() : "";
      const chatIdRaw =
        typeof body.chatId === "string" ? body.chatId.trim().toLowerCase() : "";
      const forceNew =
        body.forceNew === true ||
        body.replace === true ||
        body.clear === true;
      let cwd = DEFAULT_CWD;
      const cwdRaw = typeof body.cwd === "string" ? body.cwd.trim() : "";
      if (cwdRaw === "~") cwd = os.homedir();
      else if (cwdRaw.startsWith("~/")) {
        cwd = path.join(os.homedir(), cwdRaw.slice(2));
      } else if (cwdRaw && path.isAbsolute(cwdRaw)) {
        cwd = cwdRaw;
      } else if (cwdRaw) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "cwd must be an absolute path." }));
        return;
      }

      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId is required." }));
        return;
      }

      const ensured = await ensureAcpSession({
        taskId,
        cwd,
        sessionId: forceNew ? null : chatIdRaw || null,
        forceNew,
      });

      try {
        ensureAcpSessionCliLink(ensured.sessionId, ensured.cwd || cwd);
      } catch (error) {
        console.warn(
          "[pty] ACP→CLI link on ensure failed:",
          error instanceof Error ? error.message : error,
        );
      }

      const acp = getAcpSession(taskId);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          sessionId: ensured.sessionId,
          chatId: ensured.sessionId,
          taskId,
          started: ensured.created,
          lastActivity: acp?.busy ? "working" : "idle",
          modelId: acp?.modelId ?? null,
        }),
      );
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to ensure ACP agent session.",
        }),
      );
      return;
    }
  }


  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "backsteros-pty",
        authRequired: Boolean(AUTH_TOKEN),
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/sessions") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    const kindFilter = url.searchParams.get("kind")?.trim() || null;
    const sessions = [];
    for (const [sessionId, entry] of ptysById) {
      if (kindFilter && entry.kind !== kindFilter) continue;
      sessions.push(serializeSession(sessionId, entry));
    }
    for (const s of listAcpSessions()) {
      if (kindFilter && kindFilter !== "agent") continue;
      sessions.push({
        sessionId: s.sessionId,
        kind: "agent",
        taskId: s.taskId,
        cwd: s.cwd,
        lastActivity: s.busy ? "working" : "idle",
        uiAttached: chatSubscriberCount(s.taskId) > 0,
        createdAt: null,
      });
    }
    sessions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ sessions }));
    return;
  }

  const deleteMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    const sessionId = decodeURIComponent(deleteMatch[1] ?? "");
    const acpTaskId = findAcpTaskBySessionId(sessionId);
    if (acpTaskId) {
      await stopAgentTask(acpTaskId, "http-delete");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, sessionId }));
      return;
    }
    if (!sessionId || !ptysById.has(sessionId)) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Session not found." }));
      return;
    }
    const sockets = getSessionSockets(sessionId);
    destroyPty(sessionId, "http-delete");
    if (sockets) {
      for (const socket of [...sockets]) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
      sessionsById.delete(sessionId);
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, sessionId }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("BacksterOS PTY bridge — connect via WebSocket.\n");
});

const wss = new WebSocketServer({ server: httpServer });

function serializeSession(sessionId, entry) {
  return {
    sessionId,
    kind: entry.kind ?? "shell",
    taskId: entry.taskId ?? null,
    label: entry.label ?? null,
    cwd: entry.cwd ?? null,
    createdAt: entry.createdAt ?? null,
    lastActivity:
      entry.lastActivity ?? lastActivityBySession.get(sessionId) ?? null,
    uiAttached: sessionSocketCount(sessionId) > 0,
  };
}

/**
 * Agent sessions are 1:1 with a task via in-process ACP, then legacy shell PTYs.
 */
function findAgentSessionForTask(taskId) {
  if (!taskId) return null;
  const acp = getAcpSession(taskId);
  if (acp?.sessionId) {
    return { sessionId: acp.sessionId, entry: acp, acp: true };
  }
  let best = null;
  for (const [id, entry] of ptysById) {
    if ((entry.kind ?? "shell") !== "agent") continue;
    if (entry.taskId !== taskId) continue;
    if (!best) {
      best = { sessionId: id, entry, acp: false };
      continue;
    }
    const bestAttached = sessionSocketCount(best.sessionId) > 0;
    const curAttached = sessionSocketCount(id) > 0;
    if (curAttached && !bestAttached) {
      best = { sessionId: id, entry, acp: false };
      continue;
    }
    if (curAttached === bestAttached) {
      if (String(entry.createdAt ?? "") > String(best.entry.createdAt ?? "")) {
        best = { sessionId: id, entry, acp: false };
      }
    }
  }
  return best;
}

/** Drop duplicate legacy agent PTYs for the same task (keep `keepSessionId`). */
function dedupeAgentSessionsForTask(taskId, keepSessionId) {
  if (!taskId || !keepSessionId) return;
  for (const [id, entry] of [...ptysById.entries()]) {
    if (id === keepSessionId) continue;
    if ((entry.kind ?? "shell") !== "agent") continue;
    if (entry.taskId !== taskId) continue;
    const sockets = getSessionSockets(id);
    destroyPty(id, "task-affinity-dedupe");
    if (sockets) {
      for (const socket of [...sockets]) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
      sessionsById.delete(id);
    }
    console.log(
      `[pty] deduped duplicate agent session=${id} for task=${taskId} (kept ${keepSessionId})`,
    );
  }
}

function destroyPty(sessionId, reason = "kill") {
  const entry = ptysById.get(sessionId);
  if (!entry) return;
  ptysById.delete(sessionId);
  lastActivityBySession.delete(sessionId);
  sessionEndedBySession.delete(sessionId);
  try {
    entry.dataDisposable.dispose();
  } catch {
    /* ignore */
  }
  try {
    entry.exitDisposable.dispose();
  } catch {
    /* ignore */
  }
  try {
    entry.pty.kill();
  } catch {
    /* already dead */
  }
  console.log(`[pty] destroyed session=${sessionId} reason=${reason}`);
}

function appendScrollback(entry, data) {
  if (typeof data !== "string" || !data) return;
  const prev = typeof entry.scrollback === "string" ? entry.scrollback : "";
  const next = prev + data;
  entry.scrollback =
    next.length > SCROLLBACK_MAX_CHARS
      ? next.slice(-SCROLLBACK_MAX_CHARS)
      : next;
}

/**
 * Chat WebSocket viewer — subscribes to ACP/chat bus for a task (no PTY attach).
 * @param {import("ws").WebSocket} ws
 * @param {string} taskId
 * @param {string | null} chatIdParam
 * @param {string | null} sessionIdParam
 */
function bindAgentChatSubscriber(ws, taskId, chatIdParam, sessionIdParam) {
  const acp = getAcpSession(taskId);
  const chatId =
    chatIdParam || acp?.sessionId || sessionIdParam || null;
  registerChatSubscriber(taskId, ws);
  const viewers = chatSubscriberCount(taskId);
  console.log(
    `[acp] chat subscriber task=${taskId} chat=${chatId ?? "-"} viewers=${viewers}`,
  );
  const liveTurn = getAcpProjectedTurn(taskId);
  send(ws, {
    type: "ready",
    sessionId: chatId || sessionIdParam || taskId,
    taskId,
    kind: "agent",
    reattached: true,
    lastActivity: acp?.busy || liveTurn?.turnStatus === "running" ? "working" : "idle",
    viewers,
  });

  // Replay the in-flight projected turn so leave→return rebinds Working… to the
  // real turn start (and message id) instead of a stale transcript snapshot.
  if (liveTurn && liveTurn.turnStatus === "running") {
    send(ws, {
      type: "acp-event",
      event: "turn-begin",
      turnId: liveTurn.turnId,
      messageId: liveTurn.messageId,
      sessionId: liveTurn.chatId,
      status: "running",
      startedAt: liveTurn.workedStartedAt,
      reattached: true,
    });
  }

  // T3-style: replay open ask/permission so remount/reconnect still shows the panel.
  for (const pending of listPendingUiRequests(taskId)) {
    send(ws, {
      type: "acp-event",
      event: pending.kind === "ask_question" ? "ask-question" : "permission",
      requestId: pending.requestId,
      auto: false,
      title: pending.title,
      detail: pending.detail,
      options: pending.options,
      questions: pending.questions,
      sessionId: pending.sessionId ?? chatId ?? null,
    });
  }

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.type === "kill") {
      void stopAgentTask(taskId, "client-kill");
    }
  });

  ws.on("close", () => {
    unregisterChatSubscriber(taskId, ws);
    console.log(
      `[acp] chat detach task=${taskId} viewers=${chatSubscriberCount(taskId)}`,
    );
  });
}

function bindSocketToPty(ws, sessionId, entry, { reattached, cols, rows }) {
  addSessionSocket(sessionId, ws);
  const viewers = sessionSocketCount(sessionId);
  console.log(
    `[pty] attach session=${sessionId} viewers=${viewers}${reattached ? " (reattach)" : ""}`,
  );

  try {
    entry.pty.resize(
      Math.max(2, cols),
      Math.max(1, rows),
    );
  } catch {
    /* ignore resize races */
  }

  const sessionEnded = Boolean(sessionEndedBySession.get(sessionId));
  send(ws, {
    type: "ready",
    shell: SHELL,
    cwd: entry.cwd,
    sessionId,
    reattached,
    viewers,
    ...(reattached && lastActivityBySession.has(sessionId)
      ? { lastActivity: lastActivityBySession.get(sessionId) }
      : {}),
    ...(reattached && sessionEnded ? { agentSessionEnded: true } : {}),
  });
  // Replay buffered output so a fresh terminal isn't blank after leave→return.
  if (reattached && typeof entry.scrollback === "string" && entry.scrollback) {
    send(ws, { type: "output", data: entry.scrollback });
  }
  // Consumed by the reattached client — don't keep forcing View forever.
  if (reattached && sessionEnded) {
    sessionEndedBySession.delete(sessionId);
  }

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message?.type === "kill") {
      destroyPty(sessionId, "client-kill");
      closeSessionSockets(sessionId);
      return;
    }

    if (message?.type === "input" && typeof message.data === "string") {
      try {
        entry.pty.write(message.data);
      } catch {
        /* ignore */
      }
      return;
    }

    if (
      message?.type === "resize" &&
      Number.isFinite(message.cols) &&
      Number.isFinite(message.rows)
    ) {
      const nextCols = Math.max(2, Math.floor(message.cols));
      const nextRows = Math.max(1, Math.floor(message.rows));
      try {
        entry.pty.resize(nextCols, nextRows);
      } catch {
        /* ignore resize races after exit */
      }
    }
  });

  ws.on("close", () => {
    removeSessionSocket(sessionId, ws);
    const remaining = sessionSocketCount(sessionId);
    console.log(
      `[pty] detach session=${sessionId} viewers=${remaining} (process kept alive)`,
    );
    // Do NOT kill the PTY — other viewers / later reattach keep the agent alive.
  });
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  if (!isAuthorized(req, url)) {
    send(ws, { type: "error", message: "Unauthorized" });
    ws.close(1008, "Unauthorized");
    return;
  }
  const cwdParam = url.searchParams.get("cwd")?.trim() || null;
  let cwd = DEFAULT_CWD;
  if (cwdParam) {
    if (cwdParam === "~") {
      cwd = os.homedir();
    } else if (cwdParam.startsWith("~/")) {
      cwd = path.join(os.homedir(), cwdParam.slice(2));
    } else if (path.isAbsolute(cwdParam)) {
      cwd = cwdParam;
    }
  }
  let sessionId =
    url.searchParams.get("sessionId")?.trim() ||
    `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const kindRaw = url.searchParams.get("kind")?.trim().toLowerCase() || "shell";
  const kind = kindRaw === "agent" ? "agent" : "shell";
  const taskId = url.searchParams.get("taskId")?.trim() || null;
  const label = url.searchParams.get("label")?.trim() || null;
  const tabLabel = url.searchParams.get("tabLabel")?.trim() || null;
  const chatId = url.searchParams.get("chatId")?.trim().toLowerCase() || null;
  const promptParam = url.searchParams.get("prompt");
  const prompt =
    typeof promptParam === "string" && promptParam.length > 0
      ? promptParam
      : null;

  let cols = Number(url.searchParams.get("cols") ?? 80);
  let rows = Number(url.searchParams.get("rows") ?? 24);
  if (!Number.isFinite(cols) || cols < 2) cols = 80;
  if (!Number.isFinite(rows) || rows < 1) rows = 24;

  if (kind === "agent") {
    void (async () => {
      try {
        if (!taskId) {
          send(ws, {
            type: "error",
            message: "Agent WebSocket requires taskId.",
          });
          ws.close();
          return;
        }

        const resolvedChatId =
          chatId || getAcpSession(taskId)?.sessionId || null;
        bindAgentChatSubscriber(ws, taskId, resolvedChatId, sessionId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to attach agent chat.";
        send(ws, { type: "error", message });
        ws.close();
      }
    })();
    return;
  }

  let existing = ptysById.get(sessionId);

  if (existing) {
    if (kind) existing.kind = kind;
    if (taskId) existing.taskId = taskId;
    if (label) existing.label = label;
    console.log(`[pty] reattach session=${sessionId}`);
    bindSocketToPty(ws, sessionId, existing, {
      reattached: true,
      cols,
      rows,
    });
    return;
  }

  let ptyProcess;
  try {
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3",
      BACKSTEROS_PTY: "1",
      BACKSTEROS_AGENT_SESSION_ID: sessionId,
      BACKSTEROS_AGENT_HOOK_URL: `http://${HOOK_HOST}:${PORT}/agent-hook`,
    };
    // Inherited CI/tooling flags can force monochrome output in the agent.
    delete env.NO_COLOR;
    delete env.NODE_DISABLE_COLORS;

    ptyProcess = pty.spawn(SHELL, ["-l"], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to spawn shell.";
    const hint =
      /posix_spawnp failed/i.test(message)
        ? " (often PTY exhaustion — restart `pnpm --filter @backsteros/desktop pty` / the development console)"
        : "";
    send(ws, { type: "error", message: `${message}${hint}` });
    ws.close();
    return;
  }

  /** @type {{
   *   pty: import("node-pty").IPty,
   *   cwd: string,
   *   kind: "agent" | "shell",
   *   taskId: string | null,
   *   label: string | null,
   *   createdAt: string,
   *   lastActivity: "working" | "idle" | null,
   *   dataDisposable: { dispose: () => void },
   *   exitDisposable: { dispose: () => void },
   * }} */
  const entry = {
    pty: ptyProcess,
    cwd,
    kind,
    taskId,
    label,
    createdAt: new Date().toISOString(),
    lastActivity: null,
    scrollback: "",
    dataDisposable: ptyProcess.onData((data) => {
      appendScrollback(entry, data);
      broadcast(sessionId, { type: "output", data });
    }),
    exitDisposable: ptyProcess.onExit(({ exitCode }) => {
      broadcast(sessionId, { type: "exit", code: exitCode ?? null });
      closeSessionSockets(sessionId);
      ptysById.delete(sessionId);
      lastActivityBySession.delete(sessionId);
      sessionEndedBySession.delete(sessionId);
      console.log(`[pty] process exited session=${sessionId} code=${exitCode}`);
    }),
  };

  ptysById.set(sessionId, entry);
  console.log(
    `[pty] spawned session=${sessionId} kind=${kind} task=${taskId ?? "-"} cwd=${cwd}`,
  );

  bindSocketToPty(ws, sessionId, entry, {
    reattached: false,
    cols,
    rows,
  });
});

try {
  ensureCursorAgentHooks();
} catch (error) {
  console.warn(
    "[pty] Cursor hook install failed:",
    error instanceof Error ? error.message : error,
  );
}

/**
 * macOS allows both `0.0.0.0:PORT` and `127.0.0.1:PORT` to bind at once.
 * Desktop hits loopback; iPad hits Tailscale — two sidecars split session
 * state and break attach/list. Refuse to start if anything already answers.
 * @param {number} port
 */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      reject(
        new Error(
          `Port ${port} is already in use. Stop the other \`pnpm --filter @backsteros/desktop pty\` / \`pty:tailscale\` process before starting another — desktop and iPad must share one sidecar.`,
        ),
      );
    });
    socket.on("error", (err) => {
      if (err && /** @type {NodeJS.ErrnoException} */ (err).code === "ECONNREFUSED") {
        resolve();
        return;
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

try {
  await assertPortFree(PORT);
} catch (error) {
  console.error(`[pty] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

httpServer.listen(PORT, HOST, () => {
  console.log(
    `[pty] listening on ws://${HOST}:${PORT} (shell=${SHELL}, cwd=${DEFAULT_CWD})`,
  );
  console.log(`[pty] agent hooks POST http://${HOOK_HOST}:${PORT}/agent-hook`);
  console.log(`[pty] sessions GET/DELETE http://${HOST}:${PORT}/sessions`);
  console.log(`[pty] agent ensure POST http://${HOST}:${PORT}/agent/ensure (ACP)`);
  console.log(`[pty] agent stop POST http://${HOST}:${PORT}/agent/stop`);
  console.log(`[pty] agent models GET http://${HOST}:${PORT}/agent/models`);
  console.log(
    `[pty] agent transcript GET/PUT/POST http://${HOST}:${PORT}/agent/chats/:chatId/transcript`,
  );
  console.log(
    `[pty] agent transcript timeline POST http://${HOST}:${PORT}/agent/chats/:chatId/transcript/timeline`,
  );
  console.log(`[pty] agent prompt POST http://${HOST}:${PORT}/agent/prompt (ACP-only Chat)`);
  console.log(`[pty] agent acp ensure POST http://${HOST}:${PORT}/agent/acp/ensure`);
  console.log(`[pty] agent acp mode POST http://${HOST}:${PORT}/agent/acp/mode`);
  console.log(`[pty] agent acp model POST http://${HOST}:${PORT}/agent/acp/model`);
  console.log(`[pty] agent acp cancel POST http://${HOST}:${PORT}/agent/acp/cancel`);
  console.log(`[pty] agent acp respond POST http://${HOST}:${PORT}/agent/acp/respond`);
  console.log(
    "[pty] ACP agent sessions in-process — Chat WebSocket kind=agent uses taskId subscribers",
  );
  if (AUTH_TOKEN) {
    console.log("[pty] auth required (PTY_AUTH_TOKEN) for HTTP/WS clients");
  } else if (HOST !== "127.0.0.1" && HOST !== "localhost") {
    console.warn(
      "[pty] WARNING: bound beyond loopback without PTY_AUTH_TOKEN — set a token for Tailscale use",
    );
  }
  console.log("[pty] detach-on-close enabled — shell PTYs survive UI navigation");
});
