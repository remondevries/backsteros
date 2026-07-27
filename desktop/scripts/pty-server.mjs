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
 *   server → client: { type: "ready", shell, cwd, sessionId, reattached?: boolean,
 *                      herdrManaged?: boolean }
 *                    { type: "output", data: string }
 *                    { type: "agent-hook", event: string }
 *                    { type: "exit", code: number | null }
 *                    { type: "error", message: string }
 *
 * WebSocket close only detaches the UI viewer. Durable agent PTYs live in
 * Herdr (unmodified external binary): one named pane per task. Each UI
 * connects via `herdr agent attach`, so desktop + iPad share one TTY without
 * reinventing multi-attach on raw node-pty.
 *
 * HTTP:
 *   POST /agent/ensure — create or reuse the Herdr agent for a task
 *   POST /agent/prompt — Chat follow-up via Cursor ACP (`session/prompt`)
 *   POST /agent/acp/mode — Chat mode via ACP (`session/set_mode`)
 *   POST /agent/acp/cancel — cancel in-flight ACP turn
 *   POST /agent/create-chat — `agent create-chat`
 *   POST /herdr/system-shell — ensure Herdr TUI shell on workspace `backster-system`
 *   GET/DELETE /sessions — list / kill (Herdr pane close for agents)
 *
 * Cursor Agent hooks POST to /agent-hook so the UI can mark working/idle.
 * Herdr status is also polled as a backup. Hook POSTs stay unauthenticated
 * (local Cursor → loopback).
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
} from "./agent-chat-transcript-store.mjs";
import {
  acpCancel,
  acpPrompt,
  acpSetMode,
  normalizeCursorModeId,
  beginMcpIsolation,
  clearAcpBusy,
  endMcpIsolation,
  ensureAcpSession,
  ensureAcpSessionCliLink,
  forgetAcpSession,
  getAcpSession,
  listAcpSessions,
  onAcpEvent,
  respondAcpUiRequest,
} from "./agent-acp-manager.mjs";
import {
  HERDR_BIN,
  HERDR_SYSTEM_WORKSPACE_LABEL,
  herdrAgentGet,
  herdrAgentNameForTask,
  herdrAgentStart,
  herdrEnsureAgentPlacement,
  herdrEnsureSystemWorkspace,
  herdrIsAvailable,
  herdrPaneClose,
  herdrPaneSendKeys,
  herdrSanitizeLabel,
  herdrSessionIdForTask,
  mapHerdrStatusToActivity,
} from "./herdr-agent.mjs";

/** Stable shell session that runs the Herdr TUI focused on `backster-system`. */
const SYSTEM_HERDR_SESSION_ID = "herdr-system";

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
 * Live shell PTY processes keyed by session id. Agent durability lives in Herdr;
 * agent UI viewers are tracked separately in `agentViewersBySession`.
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

/**
 * Durable Herdr agent per task (1:1).
 * @type {Map<string, {
 *   taskId: string,
 *   name: string,
 *   sessionId: string,
 *   paneId: string | null,
 *   terminalId: string | null,
 *   cwd: string,
 *   chatId: string | null,
 *   label: string | null,
 *   tabLabel: string | null,
 *   workspaceId: string | null,
 *   tabId: string | null,
 *   createdAt: string,
 *   lastActivity: "working" | "attention" | "idle" | null,
 *   herdrStatus: string | null,
 *   runtime?: "agent-resume" | "shell" | null,
 *   hookEnv?: boolean,
 *   lastModeId?: string | null,
 * }>}
 */
const herdrByTaskId = new Map();

/**
 * Per-viewer `herdr agent attach` PTYs for a canonical agent sessionId.
 * @deprecated Replaced by shared attach in `herdrAttachBySession` — Herdr
 * attach is exclusive; multiple attaches kick each other off.
 * @type {Map<string, Set<{
 *   ws: import("ws").WebSocket,
 *   pty: import("node-pty").IPty,
 *   dataDisposable: { dispose: () => void },
 *   exitDisposable: { dispose: () => void },
 * }>>}
 */
const agentViewersBySession = new Map();

/**
 * One shared `herdr agent attach` pipe per agent session.
 * WebSocket viewers fan in/out via `sessionsById` (same as shell PTYs).
 * Herdr attach is exclusive — a second CLI attach exits with code 1 and
 * crashes the iPad Ghostty surface ("failed to launch…").
 * @type {Map<string, {
 *   pty: import("node-pty").IPty,
 *   name: string,
 *   scrollback: string,
 *   cols: number,
 *   rows: number,
 *   dataDisposable: { dispose: () => void },
 *   exitDisposable: { dispose: () => void },
 * }>}
 */
const herdrAttachBySession = new Map();

/** @type {Map<string, "working" | "idle">} */
const lastActivityBySession = new Map();
/** Sessions that received sessionEnd since last agent start (survives UI detach). */
const sessionEndedBySession = new Map();

let herdrAvailable = false;

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

function disposeHerdrAttach(sessionId) {
  const attach = herdrAttachBySession.get(sessionId);
  if (!attach) return;
  herdrAttachBySession.delete(sessionId);
  try {
    attach.dataDisposable.dispose();
  } catch {
    /* ignore */
  }
  try {
    attach.exitDisposable.dispose();
  } catch {
    /* ignore */
  }
  try {
    attach.pty.kill();
  } catch {
    /* ignore */
  }
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
  disposeHerdrAttach(sessionId);
  // Legacy per-viewer attaches (should be empty after fan-out refactor).
  disposeAgentViewers(sessionId, { closeSockets: false });
}

function disposeAgentViewer(sessionId, viewer) {
  const set = agentViewersBySession.get(sessionId);
  if (set) {
    set.delete(viewer);
    if (set.size === 0) agentViewersBySession.delete(sessionId);
  }
  try {
    viewer.dataDisposable.dispose();
  } catch {
    /* ignore */
  }
  try {
    viewer.exitDisposable.dispose();
  } catch {
    /* ignore */
  }
  try {
    viewer.pty.kill();
  } catch {
    /* ignore */
  }
}

function disposeAgentViewers(sessionId, { closeSockets = false } = {}) {
  const set = agentViewersBySession.get(sessionId);
  if (set) {
    for (const viewer of [...set]) {
      disposeAgentViewer(sessionId, viewer);
      if (closeSockets) {
        try {
          viewer.ws.close();
        } catch {
          /* ignore */
        }
      }
    }
    agentViewersBySession.delete(sessionId);
  }
  disposeHerdrAttach(sessionId);
}

function findHerdrBySessionId(sessionId) {
  for (const entry of herdrByTaskId.values()) {
    if (entry.sessionId === sessionId) return entry;
  }
  return null;
}

function findHerdrByTaskId(taskId) {
  if (!taskId) return null;
  return herdrByTaskId.get(taskId) ?? null;
}

/**
 * Fan ACP events to every WebSocket viewer attached to this task's Herdr session.
 * @param {string} taskId
 * @param {Record<string, unknown>} message
 */
function broadcastToTask(taskId, message) {
  const herdr = findHerdrByTaskId(taskId);
  if (!herdr?.sessionId) return;
  broadcast(herdr.sessionId, message);
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

  if (event.type === "activity") {
    const activity = event.activity === "working" ? "working" : "idle";
    const herdr = findHerdrByTaskId(taskId);
    const sessionId = herdr?.sessionId || null;
    if (sessionId) {
      lastActivityBySession.set(sessionId, activity);
      if (herdr) herdr.lastActivity = activity;
    }
    broadcastToTask(taskId, {
      type: "acp-event",
      event: "activity",
      activity,
      sessionId: event.sessionId ?? null,
    });
    broadcastToTask(taskId, {
      type: "agent-hook",
      event: activity === "working" ? "preToolUse" : "stop",
      activity,
      source: "acp",
    });
    return;
  }

  if (event.type === "session-update") {
    const update = event.update;
    broadcastToTask(taskId, {
      type: "acp-event",
      event: "session-update",
      sessionId: event.sessionId ?? null,
      update,
    });

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
    return;
  }

  if (event.type === "prompt-complete") {
    const draft = (acpAssistantDraftByTask.get(taskId) || "").trim();
    acpAssistantDraftByTask.delete(taskId);
    const herdr = findHerdrByTaskId(taskId);
    const chatId = herdr?.chatId || getAcpSession(taskId)?.sessionId || null;
    if (chatId && draft) {
      appendChatTranscriptMessage(chatId, {
        role: "assistant",
        text: draft,
      });
    }
    broadcastToTask(taskId, {
      type: "acp-event",
      event: "prompt-complete",
      sessionId: event.sessionId ?? null,
      text: draft || null,
      result: event.result ?? null,
    });
    if (draft) {
      broadcastToTask(taskId, {
        type: "agent-hook",
        event: "afterAgentResponse",
        text: draft,
        source: "acp",
        streaming: false,
      });
    }
    // Reload Terminal TUI so it picks up ACP turns from the linked store.
    scheduleHerdrResumeRefresh(taskId);
    return;
  }

  if (event.type === "prompt-error") {
    acpAssistantDraftByTask.delete(taskId);
    broadcastToTask(taskId, {
      type: "acp-event",
      event: "prompt-error",
      sessionId: event.sessionId ?? null,
      error: event.error ?? "ACP prompt failed",
    });
    return;
  }

  if (
    event.type === "permission" ||
    event.type === "ask-question" ||
    event.type === "permission-timeout" ||
    event.type === "ask-question-timeout" ||
    event.type === "ui-request-cleared"
  ) {
    broadcastToTask(taskId, {
      type: "acp-event",
      event: event.type,
      requestId: event.requestId ?? null,
      auto: event.auto === true,
      title: event.title ?? null,
      detail: event.detail ?? null,
      options: event.options ?? [],
      questions: event.questions ?? [],
      sessionId: event.sessionId ?? null,
      reason: event.reason ?? null,
    });
    return;
  }

  if (
    event.type === "cursor-update-todos" ||
    event.type === "cursor-create-plan"
  ) {
    broadcastToTask(taskId, {
      type: "acp-event",
      event: event.type,
      sessionId: event.sessionId ?? null,
      params: event.params ?? null,
    });
  }
});

/**
 * Build argv for Cursor Agent inside a Herdr pane.
 * Chat owns turns via ACP; Terminal resumes the same session id after we link
 * the CLI chats path to the ACP store (`ensureAcpSessionCliLink`).
 * @param {string} chatId
 * @param {string | null | undefined} prompt
 * @param {string | null | undefined} model
 * @param {string | null | undefined} mode
 */
function cursorAgentArgv(chatId, prompt, model, mode) {
  const id = chatId.trim();
  const text = typeof prompt === "string" ? prompt.trim() : "";
  const modelId =
    typeof model === "string" && model.trim() && model.trim() !== "auto"
      ? model.trim()
      : null;
  const modeId = normalizeCursorModeId(mode);
  /** @type {string[]} */
  const argv = ["agent", "--trust", "--force"];
  if (modelId) {
    argv.push("--model", modelId);
  }
  if (modeId && modeId !== "agent") {
    argv.push("--mode", modeId);
  }
  argv.push("--resume", id);
  if (text) argv.push(text);
  return argv;
}

/**
 * Ensure a Herdr agent pane exists for this task.
 * @param {{
 *   taskId: string,
 *   cwd: string,
 *   chatId: string,
 *   prompt?: string | null,
 *   model?: string | null,
 *   mode?: string | null,
 *   label?: string | null,
 *   tabLabel?: string | null,
 *   replace?: boolean,
 * }} options
 */
async function ensureHerdrAgentForTask(options) {
  const taskId = options.taskId.trim();
  const chatId = options.chatId.trim().toLowerCase();
  const cwd = options.cwd;
  const prompt = options.prompt?.trim() || null;
  const model = options.model?.trim() || null;
  const mode = options.mode?.trim() || null;
  const label = options.label?.trim() || null;
  const tabLabelRaw = options.tabLabel?.trim() || null;
  if (!taskId) throw new Error("taskId is required");
  if (!chatId) throw new Error("chatId is required");
  if (!cwd) throw new Error("cwd is required");
  if (!herdrAvailable) {
    throw new Error(
      `Herdr is not available (\`${HERDR_BIN}\`). Install from https://herdr.dev and run \`herdr integration install cursor\`.`,
    );
  }

  // So interactive `agent --resume` reads the ACP conversation store.
  try {
    ensureAcpSessionCliLink(chatId, cwd);
  } catch (error) {
    console.warn(
      "[pty] ACP→CLI session link failed:",
      error instanceof Error ? error.message : error,
    );
  }

  const name = herdrAgentNameForTask(taskId);
  const sessionId = herdrSessionIdForTask(taskId);
  let existing = await herdrAgentGet(name);
  const cached = herdrByTaskId.get(taskId);

  const chatChanged =
    Boolean(cached?.chatId) && cached.chatId !== chatId;
  const runtimeStale = cached?.runtime !== "agent-resume";
  // After pty restart (or an agent started outside the sidecar) we have no
  // BACKSTEROS_AGENT_* env — Chat hooks stay silent until we replace once.
  const missingHookEnv = Boolean(existing) && !cached?.hookEnv;
  const wantsReplace =
    options.replace === true ||
    Boolean(prompt) ||
    chatChanged ||
    (Boolean(existing) && runtimeStale) ||
    missingHookEnv;

  if (existing && wantsReplace) {
    await herdrPaneClose(existing.paneId || cached?.paneId || "");
    disposeAgentViewers(sessionId, { closeSockets: true });
    herdrByTaskId.delete(taskId);
    lastActivityBySession.delete(sessionId);
    sessionEndedBySession.delete(sessionId);
    existing = null;
  }

  if (existing) {
    const entry = {
      taskId,
      name: existing.name || name,
      sessionId,
      paneId: existing.paneId,
      terminalId: existing.terminalId,
      cwd: existing.cwd || cwd,
      chatId: cached?.chatId || chatId,
      label: label || cached?.label || null,
      tabLabel: tabLabelRaw || cached?.tabLabel || null,
      workspaceId: existing.workspaceId || cached?.workspaceId || null,
      tabId: existing.tabId || cached?.tabId || null,
      createdAt: cached?.createdAt || new Date().toISOString(),
      lastActivity:
        cached?.lastActivity ??
        mapHerdrStatusToActivity(existing.status) ??
        lastActivityBySession.get(sessionId) ??
        null,
      herdrStatus: existing.status,
      runtime: cached?.runtime || "agent-resume",
      hookEnv: cached?.hookEnv === true,
      lastModeId: cached?.lastModeId ?? null,
    };
    herdrByTaskId.set(taskId, entry);
    if (entry.lastActivity) {
      lastActivityBySession.set(sessionId, entry.lastActivity);
    }
    return { entry, started: false };
  }

  const workspaceLabel = herdrSanitizeLabel(label || "BacksterOS", "BacksterOS");
  const tabLabel = herdrSanitizeLabel(
    tabLabelRaw || taskId.slice(0, 8),
    "task",
  );
  const placement = await herdrEnsureAgentPlacement({
    workspaceLabel,
    tabLabel,
    cwd,
  });

  beginMcpIsolation();
  let started;
  try {
    started = await herdrAgentStart({
      name,
      cwd,
      workspaceId: placement.workspaceId,
      tabId: placement.tabId,
      argv: cursorAgentArgv(chatId, prompt, model, mode),
      env: {
        BACKSTEROS_PTY: "1",
        BACKSTEROS_AGENT_SESSION_ID: sessionId,
        BACKSTEROS_AGENT_HOOK_URL: `http://${HOOK_HOST}:${PORT}/agent-hook`,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
      },
    });
  } finally {
    // Give the child a moment to read mcp.json, then restore the user's servers.
    setTimeout(() => {
      try {
        endMcpIsolation();
      } catch {
        /* ignore */
      }
    }, 1500);
  }

  // Herdr creates a shell pane with the tab; close it so the tab is agent-only.
  if (
    placement.shellPaneId &&
    placement.shellPaneId !== started.paneId
  ) {
    await herdrPaneClose(placement.shellPaneId);
  }

  // Only mark working when a prompt was injected into argv. A bare
  // `agent --resume` (reattach, /clear, Start without bootstrap) is idle
  // until ACP/hooks report a real turn — otherwise Chat shows "Working…".
  const activity = prompt ? "working" : "idle";
  const entry = {
    taskId,
    name: started.name || name,
    sessionId,
    paneId: started.paneId,
    terminalId: started.terminalId,
    cwd: started.cwd || cwd,
    chatId,
    label: workspaceLabel,
    tabLabel,
    workspaceId: started.workspaceId || placement.workspaceId,
    tabId: started.tabId || placement.tabId,
    createdAt: new Date().toISOString(),
    lastActivity: activity,
    herdrStatus: started.status,
    runtime: "agent-resume",
    hookEnv: true,
    lastModeId: normalizeCursorModeId(mode) || null,
  };
  herdrByTaskId.set(taskId, entry);
  lastActivityBySession.set(sessionId, activity);
  sessionEndedBySession.delete(sessionId);
  if (prompt?.trim()) {
    appendChatTranscriptMessage(chatId, {
      role: "user",
      text: prompt.trim(),
    });
  }
  console.log(
    `[pty] herdr started name=${entry.name} task=${taskId} session=${sessionId} workspace=${entry.workspaceId ?? "-"} tab=${entry.tabId ?? "-"} (${workspaceLabel} / ${tabLabel}) pane=${entry.paneId ?? "-"} runtime=agent-resume`,
  );
  return { entry, started: true };
}

/**
 * Restart the Herdr Cursor TUI with `agent --resume` so it reloads ACP history.
 * @param {string} taskId
 */
async function refreshHerdrAgentResume(taskId) {
  const id = taskId.trim();
  if (!id) return null;
  const entry = findHerdrByTaskId(id);
  const acp = getAcpSession(id);
  const chatId = entry?.chatId || acp?.sessionId || null;
  const cwd = entry?.cwd || acp?.cwd || null;
  if (!chatId || !cwd) return null;
  const result = await ensureHerdrAgentForTask({
    taskId: id,
    chatId,
    cwd,
    prompt: null,
    label: entry?.label || null,
    tabLabel: entry?.tabLabel || null,
    replace: true,
  });
  broadcastToTask(id, {
    type: "herdr-restarted",
    sessionId: result.entry.sessionId,
    chatId,
  });
  return result;
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const herdrResumeRefreshTimers = new Map();

/**
 * Debounce TUI reloads after ACP turns so rapid prompts do not thrash Herdr.
 * @param {string} taskId
 */
function scheduleHerdrResumeRefresh(taskId) {
  const id = taskId.trim();
  if (!id) return;
  const prev = herdrResumeRefreshTimers.get(id);
  if (prev) clearTimeout(prev);
  herdrResumeRefreshTimers.set(
    id,
    setTimeout(() => {
      herdrResumeRefreshTimers.delete(id);
      void refreshHerdrAgentResume(id).catch((error) => {
        console.warn(
          "[pty] herdr resume refresh after ACP turn failed:",
          error instanceof Error ? error.message : error,
        );
      });
    }, 1200),
  );
}

async function destroyHerdrAgent(taskId, reason = "kill") {
  const entry = herdrByTaskId.get(taskId);
  if (!entry) return false;
  herdrByTaskId.delete(taskId);
  lastActivityBySession.delete(entry.sessionId);
  sessionEndedBySession.delete(entry.sessionId);
  forgetAcpSession(taskId);
  disposeAgentViewers(entry.sessionId, { closeSockets: true });
  closeSessionSockets(entry.sessionId);
  if (entry.paneId) {
    await herdrPaneClose(entry.paneId);
  } else {
    const live = await herdrAgentGet(entry.name);
    if (live?.paneId) await herdrPaneClose(live.paneId);
  }
  console.log(
    `[pty] herdr destroyed task=${taskId} session=${entry.sessionId} reason=${reason}`,
  );
  return true;
}

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
    const herdr = findHerdrBySessionId(sessionId);
    if (herdr) herdr.lastActivity = activity;
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
  const herdr = findHerdrBySessionId(sessionId);
  const chatId = herdr?.chatId || null;
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
      appendChatTranscriptMessage(chatId, {
        role: "assistant",
        text: text.trim(),
      });
    }
  }

  if (sessionSocketCount(sessionId) === 0) {
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

  broadcast(sessionId, {
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
  });
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

      // Keep Herdr chatId aligned when the pane already exists.
      const herdr = findHerdrByTaskId(taskId);
      if (herdr) herdr.chatId = ensured.sessionId;

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

      // Chat is ACP-only (T3-style). Herdr remains a Terminal viewer of the
      // shared session — never type Chat prompts into the TUI.
      const herdr = findHerdrByTaskId(taskId);
      const cwd =
        (typeof body.cwd === "string" && body.cwd.trim()) ||
        herdr?.cwd ||
        DEFAULT_CWD;
      const preferredSession =
        (typeof body.chatId === "string" && body.chatId.trim().toLowerCase()) ||
        (typeof body.sessionId === "string" &&
          body.sessionId.trim().toLowerCase()) ||
        herdr?.chatId ||
        null;
      const modeId =
        normalizeCursorModeId(
          typeof body.mode === "string"
            ? body.mode
            : typeof body.modeId === "string"
              ? body.modeId
              : null,
        ) || null;

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

      const liveHerdr = findHerdrByTaskId(taskId);
      if (liveHerdr) {
        liveHerdr.chatId = ensured.sessionId;
        // Keep Terminal Working… aligned while ACP runs the turn.
        lastActivityBySession.set(liveHerdr.sessionId, "working");
        liveHerdr.lastActivity = "working";
        broadcast(liveHerdr.sessionId, {
          type: "agent-hook",
          event: "beforeSubmitPrompt",
          activity: "working",
          source: "acp",
          text: trimmed || (images.length > 0 ? "(image)" : ""),
        });
      }

      // Belt-and-suspenders: never block Chat on a stale busy lock.
      clearAcpBusy(taskId);

      appendChatTranscriptMessage(ensured.sessionId, {
        role: "user",
        text: trimmed || (images.length > 0 ? "(image)" : ""),
      });
      acpAssistantDraftByTask.set(taskId, "");

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
            error: "taskId and mode (build|plan|ask|debug|agent) are required.",
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

      // Chat mode is ACP-only (T3-style). Do not slash into the Herdr TUI.
      const result = await acpSetMode({ taskId, modeId });
      const herdr = findHerdrByTaskId(taskId);
      if (herdr) {
        // Cache for diagnostics / Terminal chrome only — not used to drive Chat.
        herdr.lastModeId = result.modeId;
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          taskId,
          modeId: result.modeId,
          sessionId: result.sessionId,
          unchanged: result.unchanged === true,
          herdrApplied: false,
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
      clearAcpBusy(taskId);
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
      const answers = Array.isArray(body.answers) ? body.answers : null;
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

  if (req.method === "POST" && url.pathname === "/agent/keys") {
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
      const keys = Array.isArray(body.keys)
        ? body.keys.map((key) => String(key ?? "").trim()).filter(Boolean)
        : [];
      if (!taskId || keys.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "taskId and keys are required." }));
        return;
      }

      let entry = findHerdrByTaskId(taskId);
      if (!entry?.paneId) {
        const name = herdrAgentNameForTask(taskId);
        const live = await herdrAgentGet(name);
        if (!live?.paneId) {
          res.writeHead(404, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              error:
                "No live Herdr agent for this task. Start the agent first.",
            }),
          );
          return;
        }
        entry = { paneId: live.paneId, name: live.name || name };
      }

      await herdrPaneSendKeys(entry.paneId, keys);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, taskId, paneId: entry.paneId }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to send keys to agent pane.",
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
      const chatId =
        typeof body.chatId === "string" ? body.chatId.trim().toLowerCase() : "";
      const label =
        typeof body.label === "string" ? body.label.trim() : null;
      const tabLabel =
        typeof body.tabLabel === "string" ? body.tabLabel.trim() : null;
      const prompt =
        typeof body.prompt === "string" ? body.prompt : null;
      const model =
        typeof body.model === "string" ? body.model.trim() : null;
      const mode =
        typeof body.mode === "string"
          ? body.mode.trim()
          : typeof body.modeId === "string"
            ? body.modeId.trim()
            : null;
      const replace = body.replace === true;
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

      if (!taskId || !chatId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({ error: "taskId and chatId are required." }),
        );
        return;
      }

      const { entry, started } = await ensureHerdrAgentForTask({
        taskId,
        cwd,
        chatId,
        prompt,
        model,
        mode,
        label,
        tabLabel,
        replace,
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          sessionId: entry.sessionId,
          taskId: entry.taskId,
          herdrName: entry.name,
          paneId: entry.paneId,
          started,
          herdrManaged: true,
          lastActivity: entry.lastActivity,
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
              : "Failed to ensure Herdr agent.",
        }),
      );
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/herdr/system-shell") {
    if (!isAuthorized(req, url)) {
      rejectUnauthorized(res);
      return;
    }
    try {
      const result = await ensureSystemHerdrShell();
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
              : "Failed to ensure Herdr system shell.",
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
    for (const entry of herdrByTaskId.values()) {
      if (kindFilter && kindFilter !== "agent") continue;
      sessions.push(serializeHerdrSession(entry));
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
    const herdr = findHerdrBySessionId(sessionId);
    if (herdr) {
      await destroyHerdrAgent(herdr.taskId, "http-delete");
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
    herdrManaged: false,
  };
}

/**
 * Env for a top-level Herdr *client* attach. The PTY sidecar is often launched
 * from inside a Herdr pane (`pnpm pty` in backster-system), which inherits
 * HERDR_ENV / HERDR_PANE_ID / … — spawning `herdr` with those set makes the
 * child think it is already nested and show an empty/wrong space.
 * @returns {Record<string, string>}
 */
function buildHerdrClientEnv() {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    // Pane-nesting markers — must not leak into the client attach.
    if (
      key === "HERDR_ENV" ||
      key === "HERDR_PANE_ID" ||
      key === "HERDR_TAB_ID" ||
      key === "HERDR_WORKSPACE_ID" ||
      key === "HERDR_TERMINAL_ID"
    ) {
      continue;
    }
    env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.FORCE_COLOR = "3";
  env.BACKSTEROS_PTY = "1";
  env.BACKSTEROS_HERDR_SYSTEM = "1";
  delete env.NO_COLOR;
  delete env.NODE_DISABLE_COLORS;
  return env;
}

function destroySystemHerdrShell(reason = "replace") {
  const existing = ptysById.get(SYSTEM_HERDR_SESSION_ID);
  if (!existing) return;
  console.log(
    `[pty] herdr system-shell destroy session=${SYSTEM_HERDR_SESSION_ID} reason=${reason}`,
  );
  try {
    existing.dataDisposable?.dispose?.();
  } catch {
    /* ignore */
  }
  try {
    existing.exitDisposable?.dispose?.();
  } catch {
    /* ignore */
  }
  try {
    existing.pty.kill();
  } catch {
    /* ignore */
  }
  closeSessionSockets(SYSTEM_HERDR_SESSION_ID);
  ptysById.delete(SYSTEM_HERDR_SESSION_ID);
  lastActivityBySession.delete(SYSTEM_HERDR_SESSION_ID);
  sessionEndedBySession.delete(SYSTEM_HERDR_SESSION_ID);
}

/**
 * Ensure a reusable shell PTY running the Herdr TUI, focused on the
 * `backster-system` workspace (tabs / panes for laptop setup).
 * @returns {Promise<{
 *   sessionId: string,
 *   workspaceId: string,
 *   workspaceLabel: string,
 *   created: boolean,
 * }>}
 */
async function ensureSystemHerdrShell() {
  if (!herdrAvailable) {
    throw new Error(
      `Herdr is not available (${HERDR_BIN}). Install from https://herdr.dev and run \`herdr integration install cursor\`.`,
    );
  }

  const workspace = await herdrEnsureSystemWorkspace(DEFAULT_CWD);
  const existing = ptysById.get(SYSTEM_HERDR_SESSION_ID);
  // Only reuse clients spawned with a cleaned env (see buildHerdrClientEnv).
  if (existing?.herdrClientClean) {
    console.log(
      `[pty] herdr system-shell reuse session=${SYSTEM_HERDR_SESSION_ID} workspace=${workspace.workspaceId}`,
    );
    return {
      sessionId: SYSTEM_HERDR_SESSION_ID,
      workspaceId: workspace.workspaceId,
      workspaceLabel: HERDR_SYSTEM_WORKSPACE_LABEL,
      created: false,
    };
  }
  if (existing) {
    destroySystemHerdrShell("unclean-env");
  }

  const cols = 80;
  const rows = 24;
  const env = buildHerdrClientEnv();

  let ptyProcess;
  try {
    // Attach to the running default session as a real client (not nested in a pane).
    // Workspace focus already ran above so backster-system is the active space.
    ptyProcess = pty.spawn(
      HERDR_BIN,
      ["session", "attach", "default"],
      {
        name: "xterm-256color",
        cols,
        rows,
        cwd: DEFAULT_CWD,
        env,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to spawn Herdr client.";
    throw new Error(message);
  }

  const sessionId = SYSTEM_HERDR_SESSION_ID;
  /** @type {{
   *   pty: import("node-pty").IPty,
   *   cwd: string,
   *   kind: "shell",
   *   taskId: null,
   *   label: string,
   *   createdAt: string,
   *   lastActivity: null,
   *   scrollback: string,
   *   herdrClientClean: boolean,
   *   dataDisposable: { dispose: () => void },
   *   exitDisposable: { dispose: () => void },
   * }} */
  const entry = {
    pty: ptyProcess,
    cwd: DEFAULT_CWD,
    kind: "shell",
    taskId: null,
    label: HERDR_SYSTEM_WORKSPACE_LABEL,
    createdAt: new Date().toISOString(),
    lastActivity: null,
    scrollback: "",
    herdrClientClean: true,
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
      console.log(
        `[pty] herdr system-shell exited session=${sessionId} code=${exitCode}`,
      );
    }),
  };

  ptysById.set(sessionId, entry);
  console.log(
    `[pty] herdr system-shell spawned session=${sessionId} workspace=${workspace.workspaceId} (${HERDR_SYSTEM_WORKSPACE_LABEL}) clean-env`,
  );

  return {
    sessionId,
    workspaceId: workspace.workspaceId,
    workspaceLabel: HERDR_SYSTEM_WORKSPACE_LABEL,
    created: true,
  };
}

function serializeHerdrSession(entry) {
  return {
    sessionId: entry.sessionId,
    kind: "agent",
    taskId: entry.taskId,
    label: entry.label,
    cwd: entry.cwd,
    createdAt: entry.createdAt,
    lastActivity:
      entry.lastActivity ?? lastActivityBySession.get(entry.sessionId) ?? null,
    uiAttached: sessionSocketCount(entry.sessionId) > 0,
    herdrManaged: true,
    herdrName: entry.name,
    herdrStatus: entry.herdrStatus,
  };
}

/**
 * Agent sessions are 1:1 with a task via Herdr. Prefer the in-memory Herdr
 * registry, then any leftover shell-era PTY entry.
 */
function findAgentSessionForTask(taskId) {
  if (!taskId) return null;
  const herdr = findHerdrByTaskId(taskId);
  if (herdr) {
    return { sessionId: herdr.sessionId, entry: herdr, herdr: true };
  }
  let best = null;
  for (const [id, entry] of ptysById) {
    if ((entry.kind ?? "shell") !== "agent") continue;
    if (entry.taskId !== taskId) continue;
    if (!best) {
      best = { sessionId: id, entry, herdr: false };
      continue;
    }
    const bestAttached = sessionSocketCount(best.sessionId) > 0;
    const curAttached = sessionSocketCount(id) > 0;
    if (curAttached && !bestAttached) {
      best = { sessionId: id, entry, herdr: false };
      continue;
    }
    if (curAttached === bestAttached) {
      if (String(entry.createdAt ?? "") > String(best.entry.createdAt ?? "")) {
        best = { sessionId: id, entry, herdr: false };
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

function ensureHerdrAttach(herdrEntry, { cols, rows }) {
  const sessionId = herdrEntry.sessionId;
  const existing = herdrAttachBySession.get(sessionId);
  if (existing) return existing;

  const nextCols = Math.max(2, cols);
  const nextRows = Math.max(1, rows);
  let attachPty;
  try {
    attachPty = pty.spawn(HERDR_BIN, ["agent", "attach", herdrEntry.name], {
      name: "xterm-256color",
      cols: nextCols,
      rows: nextRows,
      cwd: herdrEntry.cwd || DEFAULT_CWD,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
        BACKSTEROS_PTY: "1",
        BACKSTEROS_AGENT_SESSION_ID: sessionId,
        BACKSTEROS_AGENT_HOOK_URL: `http://${HOOK_HOST}:${PORT}/agent-hook`,
      },
    });
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to attach Herdr agent.");
  }

  /** @type {{
   *   pty: import("node-pty").IPty,
   *   name: string,
   *   scrollback: string,
   *   cols: number,
   *   rows: number,
   *   dataDisposable: { dispose: () => void },
   *   exitDisposable: { dispose: () => void },
   * }} */
  const attach = {
    pty: attachPty,
    name: herdrEntry.name,
    scrollback: "",
    cols: nextCols,
    rows: nextRows,
    dataDisposable: attachPty.onData((data) => {
      appendScrollback(attach, data);
      broadcast(sessionId, { type: "output", data });
    }),
    exitDisposable: attachPty.onExit(({ exitCode }) => {
      herdrAttachBySession.delete(sessionId);
      broadcast(sessionId, { type: "exit", code: exitCode ?? null });
      // Detach UIs only — Herdr agent pane stays alive for a later reattach.
      const sockets = getSessionSockets(sessionId);
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
      console.log(
        `[pty] herdr shared attach exited session=${sessionId} code=${exitCode}`,
      );
    }),
  };
  herdrAttachBySession.set(sessionId, attach);
  console.log(
    `[pty] herdr shared attach started session=${sessionId} name=${herdrEntry.name}`,
  );
  return attach;
}

function bindAgentViewer(ws, herdrEntry, { reattached, cols, rows, started }) {
  const sessionId = herdrEntry.sessionId;
  let attach;
  try {
    attach = ensureHerdrAttach(herdrEntry, { cols, rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to attach Herdr agent.";
    send(ws, { type: "error", message });
    ws.close();
    return;
  }

  addSessionSocket(sessionId, ws);
  const viewers = sessionSocketCount(sessionId);
  const joiningExisting = viewers > 1;
  console.log(
    `[pty] herdr viewer session=${sessionId} name=${herdrEntry.name} viewers=${viewers}${reattached || joiningExisting ? " (reattach)" : ""}${started ? " (started)" : ""}`,
  );

  const sessionEnded = Boolean(sessionEndedBySession.get(sessionId));
  const lastActivity =
    herdrEntry.lastActivity ?? lastActivityBySession.get(sessionId) ?? null;
  send(ws, {
    type: "ready",
    shell: HERDR_BIN,
    cwd: herdrEntry.cwd,
    sessionId,
    reattached: reattached || !started || joiningExisting,
    herdrManaged: true,
    viewers,
    ...(lastActivity ? { lastActivity } : {}),
    ...(sessionEnded ? { agentSessionEnded: true } : {}),
  });
  // Replay so a second viewer (iPad/desktop) isn't blank.
  if (attach.scrollback) {
    send(ws, { type: "output", data: attach.scrollback });
  }
  if (sessionEnded) {
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
      void destroyHerdrAgent(herdrEntry.taskId, "client-kill");
      return;
    }

    const live = herdrAttachBySession.get(sessionId);
    if (!live) return;

    if (message?.type === "input" && typeof message.data === "string") {
      try {
        live.pty.write(message.data);
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
      live.cols = nextCols;
      live.rows = nextRows;
      try {
        live.pty.resize(nextCols, nextRows);
      } catch {
        /* ignore */
      }
    }
  });

  ws.on("close", () => {
    removeSessionSocket(sessionId, ws);
    const remaining = sessionSocketCount(sessionId);
    console.log(
      `[pty] herdr detach session=${sessionId} viewers=${remaining} (agent kept alive)`,
    );
    // Drop the exclusive attach when nobody is watching — next open respawns it.
    if (remaining === 0) {
      disposeHerdrAttach(sessionId);
    }
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
    herdrManaged: false,
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
        if (!herdrAvailable) {
          send(ws, {
            type: "error",
            message: `Herdr is not available (${HERDR_BIN}). Install from https://herdr.dev.`,
          });
          ws.close();
          return;
        }

        let herdrEntry = findHerdrByTaskId(taskId);
        let started = false;
        if (!herdrEntry) {
          const live = await herdrAgentGet(herdrAgentNameForTask(taskId));
          if (live) {
            herdrEntry = {
              taskId,
              name: live.name || herdrAgentNameForTask(taskId),
              sessionId: herdrSessionIdForTask(taskId),
              paneId: live.paneId,
              terminalId: live.terminalId,
              cwd: live.cwd || cwd,
              chatId,
              label,
              tabLabel,
              workspaceId: live.workspaceId,
              tabId: live.tabId,
              createdAt: new Date().toISOString(),
              lastActivity: mapHerdrStatusToActivity(live.status),
              herdrStatus: live.status,
            };
            herdrByTaskId.set(taskId, herdrEntry);
          } else if (chatId) {
            const ensured = await ensureHerdrAgentForTask({
              taskId,
              cwd,
              chatId,
              prompt,
              label,
              tabLabel,
            });
            herdrEntry = ensured.entry;
            started = ensured.started;
          } else {
            send(ws, {
              type: "error",
              message:
                "No Herdr agent for this task. Call POST /agent/ensure (or Start Agent) first.",
            });
            ws.close();
            return;
          }
        }

        sessionId = herdrEntry.sessionId;
        dedupeAgentSessionsForTask(taskId, sessionId);
        bindAgentViewer(ws, herdrEntry, {
          reattached: !started,
          cols,
          rows,
          started,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to attach agent.";
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
        ? " (often PTY exhaustion — restart `pnpm pty` / the development console)"
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

async function pollHerdrStatuses() {
  if (!herdrAvailable || herdrByTaskId.size === 0) return;
  for (const entry of [...herdrByTaskId.values()]) {
    try {
      const live = await herdrAgentGet(entry.name);
      if (!live) {
        // Pane gone — clear registry; viewers will exit on their own.
        herdrByTaskId.delete(entry.taskId);
        lastActivityBySession.delete(entry.sessionId);
        continue;
      }
      entry.paneId = live.paneId ?? entry.paneId;
      entry.terminalId = live.terminalId ?? entry.terminalId;
      entry.herdrStatus = live.status;
      const activity = mapHerdrStatusToActivity(live.status);
      if (!activity) continue;
      // Chat owns turns via ACP; Herdr is often idle/unknown while ACP is busy.
      // Never let Herdr idle stomp ACP working (lastActivity + UI pulses).
      if (activity === "idle") {
        const acp = getAcpSession(entry.taskId);
        if (acp?.busy) continue;
      }
      const previous =
        entry.lastActivity ?? lastActivityBySession.get(entry.sessionId) ?? null;
      if (previous === activity) continue;
      entry.lastActivity = activity;
      lastActivityBySession.set(entry.sessionId, activity);
      if (activity === "idle") {
        // Don't force sessionEnd — Cursor hooks still own turn completion text.
      }
      broadcast(entry.sessionId, {
        type: "agent-hook",
        event:
          activity === "attention"
            ? "herdr-blocked"
            : activity === "working"
              ? "preToolUse"
              : "stop",
        activity,
        source: "herdr",
      });
    } catch {
      /* ignore poll errors */
    }
  }
}

try {
  ensureCursorAgentHooks();
} catch (error) {
  console.warn(
    "[pty] Cursor hook install failed:",
    error instanceof Error ? error.message : error,
  );
}

herdrAvailable = await herdrIsAvailable();

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
          `Port ${port} is already in use. Stop the other \`pnpm pty\` / \`pty:tailscale\` process before starting another — desktop and iPad must share one sidecar.`,
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
  console.log(`[pty] agent ensure POST http://${HOST}:${PORT}/agent/ensure`);
  console.log(`[pty] agent models GET http://${HOST}:${PORT}/agent/models`);
  console.log(
    `[pty] agent transcript GET/PUT/POST http://${HOST}:${PORT}/agent/chats/:chatId/transcript`,
  );
  console.log(`[pty] agent prompt POST http://${HOST}:${PORT}/agent/prompt (ACP-only Chat)`);
  console.log(`[pty] agent acp ensure POST http://${HOST}:${PORT}/agent/acp/ensure`);
  console.log(`[pty] agent acp mode POST http://${HOST}:${PORT}/agent/acp/mode`);
  console.log(`[pty] agent acp cancel POST http://${HOST}:${PORT}/agent/acp/cancel`);
  console.log(`[pty] agent acp respond POST http://${HOST}:${PORT}/agent/acp/respond`);
  console.log(`[pty] agent keys POST http://${HOST}:${PORT}/agent/keys`);
  console.log(
    `[pty] herdr system-shell POST http://${HOST}:${PORT}/herdr/system-shell`,
  );
  if (herdrAvailable) {
    console.log(`[pty] Herdr agent multiplexer enabled (${HERDR_BIN})`);
    setInterval(() => {
      void pollHerdrStatuses();
    }, 1500);
  } else {
    console.warn(
      `[pty] WARNING: Herdr not found (${HERDR_BIN}) — agent sessions require Herdr. Install from https://herdr.dev`,
    );
  }
  if (AUTH_TOKEN) {
    console.log("[pty] auth required (PTY_AUTH_TOKEN) for HTTP/WS clients");
  } else if (HOST !== "127.0.0.1" && HOST !== "localhost") {
    console.warn(
      "[pty] WARNING: bound beyond loopback without PTY_AUTH_TOKEN — set a token for Tailscale use",
    );
  }
  console.log("[pty] detach-on-close enabled — Herdr agents survive UI navigation");
});
