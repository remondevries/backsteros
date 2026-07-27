/**
 * Cursor ACP (Agent Client Protocol) manager for BacksterOS Chat.
 *
 * Spawns a long-lived `agent acp` process and speaks JSON-RPC over stdio.
 * Chat turns use structured session/prompt + session/update — not PTY keystrokes.
 *
 * Terminal/Herdr remains separate for the interactive TUI viewer.
 *
 * MCP note: Cursor CLI loads ~/.cursor/mcp.json at process start and can hit
 * "Too many MCP tools". We briefly swap in an empty mcp.json for ACP spawn +
 * auth, then restore the user's file so the IDE keeps its MCP servers.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const AGENT_BIN = process.env.CURSOR_AGENT_BIN?.trim() || "agent";
/** Bump when spawn/isolation behavior changes so old ACP processes are restarted. */
const ACP_RUNTIME_VERSION = 2;

const USER_MCP_PATH = path.join(os.homedir(), ".cursor", "mcp.json");
const USER_MCP_BACKUP_PATH = path.join(
  os.homedir(),
  ".cursor",
  "mcp.json.backsteros-acp-bak",
);
const EMPTY_MCP_PATH = path.join(os.homedir(), ".backsteros", "mcp-empty.json");

const PROVIDER_FATAL_RE =
  /Too many MCP tools|NonRetriableError|Provider Error/i;

/** @typedef {{
 *   taskId: string,
 *   sessionId: string,
 *   cwd: string,
 *   busy: boolean,
 *   modeId: "agent" | "ask" | "plan" | "debug" | null,
 * }} AcpTaskSession */

/** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
let child = null;
/** @type {import("node:readline").Interface | null} */
let stdoutRl = null;
let nextId = 1;
/** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: unknown) => void, method: string, sessionId?: string }>} */
const pending = new Map();
/** @type {Map<string, number>} sessionId → pending session/prompt request id */
const promptRequestBySession = new Map();
/** @type {Map<string, string>} sessionId → streamed assistant text for current turn */
const assistantDraftBySession = new Map();
let starting = null;
let authenticated = false;
let runtimeVersion = 0;
let mcpIsolationActive = false;

/** @type {Map<string, AcpTaskSession>} taskId → session */
const sessionsByTaskId = new Map();
/** @type {Map<string, string>} sessionId → taskId */
const taskIdBySessionId = new Map();

/** @type {Set<(event: Record<string, unknown>) => void>} */
const listeners = new Set();

/**
 * Pending interactive ACP requests (permissions / ask_question) waiting on UI.
 * @type {Map<string, {
 *   rpcId: number,
 *   kind: "permission" | "ask_question",
 *   taskId: string | null,
 *   sessionId: string | null,
 *   params: unknown,
 *   timer: ReturnType<typeof setTimeout>,
 * }>}
 */
const pendingUiRequests = new Map();

/** How long to wait for Chat UI before auto-resolving. */
const UI_REQUEST_TIMEOUT_MS = 120_000;

function ensureEmptyMcpFile() {
  fs.mkdirSync(path.dirname(EMPTY_MCP_PATH), { recursive: true });
  fs.writeFileSync(EMPTY_MCP_PATH, `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);
}

/**
 * Briefly replace ~/.cursor/mcp.json with an empty config so `agent` /
 * `agent acp` do not load every MCP tool (provider tool-cap errors).
 */
export function beginMcpIsolation() {
  if (mcpIsolationActive) return;
  if (process.env.BACKSTEROS_ACP_KEEP_MCP === "1") return;
  try {
    ensureEmptyMcpFile();
    fs.mkdirSync(path.dirname(USER_MCP_PATH), { recursive: true });
    if (fs.existsSync(USER_MCP_PATH) && !fs.existsSync(USER_MCP_BACKUP_PATH)) {
      fs.copyFileSync(USER_MCP_PATH, USER_MCP_BACKUP_PATH);
    }
    fs.copyFileSync(EMPTY_MCP_PATH, USER_MCP_PATH);
    mcpIsolationActive = true;
    console.log("[acp] MCP isolation on (empty ~/.cursor/mcp.json for spawn)");
  } catch (error) {
    console.warn(
      "[acp] could not isolate mcp.json:",
      error instanceof Error ? error.message : error,
    );
  }
}

export function endMcpIsolation() {
  if (!mcpIsolationActive && !fs.existsSync(USER_MCP_BACKUP_PATH)) return;
  try {
    if (fs.existsSync(USER_MCP_BACKUP_PATH)) {
      fs.copyFileSync(USER_MCP_BACKUP_PATH, USER_MCP_PATH);
      fs.unlinkSync(USER_MCP_BACKUP_PATH);
      console.log("[acp] MCP isolation off (restored ~/.cursor/mcp.json)");
    }
  } catch (error) {
    console.warn(
      "[acp] could not restore mcp.json — check",
      USER_MCP_BACKUP_PATH,
      error instanceof Error ? error.message : error,
    );
  }
  mcpIsolationActive = false;
}

/**
 * Cursor CLI chat bucket for a workspace: md5(absolute cwd).
 * @param {string} cwd
 */
export function cursorWorkspaceChatHash(cwd) {
  return crypto.createHash("md5").update(path.resolve(cwd)).digest("hex");
}

/**
 * Point `~/.cursor/chats/<cwdHash>/<sessionId>` at the ACP session store so
 * interactive `agent --resume <sessionId>` loads the same conversation Chat
 * owns via ACP (`~/.cursor/acp-sessions/<sessionId>`).
 *
 * Without this link, `--resume` opens/forks an empty CLI chat under the same id.
 *
 * @param {string} sessionId
 * @param {string} cwd
 */
export function ensureAcpSessionCliLink(sessionId, cwd) {
  const id = sessionId.trim().toLowerCase();
  const absCwd = path.resolve(cwd.trim());
  if (!id) throw new Error("sessionId is required");
  if (!absCwd) throw new Error("cwd is required");

  const hash = cursorWorkspaceChatHash(absCwd);
  const acpDir = path.join(os.homedir(), ".cursor", "acp-sessions", id);
  const chatParent = path.join(os.homedir(), ".cursor", "chats", hash);
  const chatDir = path.join(chatParent, id);

  fs.mkdirSync(acpDir, { recursive: true });
  fs.mkdirSync(chatParent, { recursive: true });

  let existing = null;
  try {
    existing = fs.lstatSync(chatDir);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
      throw error;
    }
  }

  if (existing?.isSymbolicLink()) {
    const target = fs.readlinkSync(chatDir);
    const resolved = path.resolve(path.dirname(chatDir), target);
    if (resolved === path.resolve(acpDir) || target === acpDir) {
      return { linked: true, already: true, chatDir, acpDir, hash };
    }
    fs.unlinkSync(chatDir);
  } else if (existing?.isDirectory() || existing?.isFile()) {
    // Prior empty CLI fork from `agent --resume` without the ACP link.
    fs.rmSync(chatDir, { recursive: true, force: true });
  }

  fs.symlinkSync(acpDir, chatDir, "dir");
  console.log(
    `[acp] linked CLI resume path chats/${hash}/${id} → acp-sessions/${id}`,
  );
  return { linked: true, already: false, chatDir, acpDir, hash };
}

function installMcpIsolationExitHooks() {
  const restore = () => {
    try {
      endMcpIsolation();
    } catch {
      /* ignore */
    }
  };
  process.once("exit", restore);
  process.once("SIGINT", () => {
    restore();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    restore();
    process.exit(143);
  });
}

installMcpIsolationExitHooks();

/**
 * @param {Record<string, unknown>} event
 */
function emit(event) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn(
        "[acp] listener error:",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

/**
 * @param {(event: Record<string, unknown>) => void} listener
 * @returns {() => void}
 */
export function onAcpEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} method
 * @param {unknown} params
 * @param {number} [timeoutMs]
 * @param {{ sessionId?: string }} [options]
 */
function sendRequest(method, params, timeoutMs = 120_000, options = {}) {
  if (!child?.stdin.writable) {
    return Promise.reject(new Error("ACP process is not running."));
  }
  const id = nextId++;
  const sessionId = options.sessionId?.trim().toLowerCase() || undefined;
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      if (sessionId) promptRequestBySession.delete(sessionId);
      reject(new Error(`ACP timeout waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, {
      method,
      sessionId,
      resolve: (value) => {
        clearTimeout(timer);
        if (sessionId) promptRequestBySession.delete(sessionId);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        if (sessionId) promptRequestBySession.delete(sessionId);
        reject(error);
      },
    });
    if (method === "session/prompt" && sessionId) {
      promptRequestBySession.set(sessionId, id);
      assistantDraftBySession.set(sessionId, "");
    }
  });
}

/**
 * JSON-RPC notification (no `id`, no response). Used for `session/cancel`.
 * @param {string} method
 * @param {unknown} params
 */
function sendNotification(method, params) {
  if (!child?.stdin.writable) {
    throw new Error("ACP process is not running.");
  }
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`,
  );
}

/**
 * @param {number} id
 * @param {unknown} result
 */
function sendResponse(id, result) {
  if (!child?.stdin.writable) return;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

/**
 * Cancel pending permission / ask_question RPCs for a session (ACP requires
 * `cancelled` outcomes when the client sends session/cancel).
 * @param {string} sessionId
 * @param {string} [reason]
 */
function cancelPendingUiRequestsForSession(sessionId, reason = "cancelled") {
  const sid = sessionId.trim().toLowerCase();
  if (!sid) return;
  for (const [requestId, pendingReq] of [...pendingUiRequests.entries()]) {
    if ((pendingReq.sessionId || "").toLowerCase() !== sid) continue;
    clearTimeout(pendingReq.timer);
    pendingUiRequests.delete(requestId);
    try {
      sendResponse(pendingReq.rpcId, {
        outcome: { outcome: "cancelled" },
      });
    } catch {
      /* ignore */
    }
    emit({
      type: "ui-request-cleared",
      requestId,
      taskId: pendingReq.taskId,
      sessionId: pendingReq.sessionId,
      reason,
    });
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatRpcError(error) {
  if (!error || typeof error !== "object") return String(error ?? "ACP error");
  const e = /** @type {{ message?: unknown, data?: unknown, code?: unknown }} */ (
    error
  );
  const message =
    typeof e.message === "string"
      ? e.message
      : typeof e.data === "string"
        ? e.data
        : JSON.stringify(error);
  return message;
}

/**
 * Pick an allow/reject option from ACP permission options.
 * @param {unknown} params
 * @param {"always" | "once" | "reject"} [preference]
 */
function permissionOutcome(params, preference = "once") {
  const p = params && typeof params === "object" ? params : {};
  const options =
    /** @type {{ optionId?: string, id?: string, name?: string }[]} */ (
      /** @type {{ options?: unknown, permissionOptions?: unknown }} */ (p)
        .options ||
        /** @type {{ permissionOptions?: unknown }} */ (p).permissionOptions ||
        []
    );
  const allowAlways = options.find((o) =>
    /allow-always|allow_always|always/i.test(
      `${o.optionId ?? ""} ${o.id ?? ""} ${o.name ?? ""}`,
    ),
  );
  const allowOnce = options.find((o) =>
    /allow-once|allow_once|(^|[^a-z])allow([^a-z]|$)/i.test(
      `${o.optionId ?? ""} ${o.id ?? ""} ${o.name ?? ""}`,
    ),
  );
  const reject = options.find((o) =>
    /reject|deny|cancel/i.test(
      `${o.optionId ?? ""} ${o.id ?? ""} ${o.name ?? ""}`,
    ),
  );

  if (preference === "reject") {
    const chosen = reject || options.find((o) => !allowAlways && !allowOnce);
    const optionId = chosen?.optionId || chosen?.id || "reject";
    return { outcome: { outcome: "selected", optionId } };
  }
  if (preference === "always") {
    const chosen = allowAlways || allowOnce || options[0];
    const optionId = chosen?.optionId || chosen?.id || "allow-always";
    return { outcome: { outcome: "selected", optionId } };
  }
  const chosen = allowOnce || allowAlways || options[0];
  const optionId = chosen?.optionId || chosen?.id || "allow-once";
  return { outcome: { outcome: "selected", optionId } };
}

/**
 * @param {unknown} params
 * @returns {boolean}
 */
function permissionLooksLikeRead(params) {
  const p = params && typeof params === "object" ? params : {};
  const toolCall =
    /** @type {{ toolCall?: unknown, tool_call?: unknown }} */ (p).toolCall ||
    /** @type {{ tool_call?: unknown }} */ (p).tool_call ||
    null;
  const kindRaw =
    toolCall && typeof toolCall === "object"
      ? /** @type {{ kind?: unknown, toolKind?: unknown }} */ (toolCall).kind ||
        /** @type {{ toolKind?: unknown }} */ (toolCall).toolKind
      : /** @type {{ kind?: unknown }} */ (p).kind;
  const kind = typeof kindRaw === "string" ? kindRaw.toLowerCase() : "";
  const title =
    toolCall && typeof toolCall === "object"
      ? String(
          /** @type {{ title?: unknown, name?: unknown }} */ (toolCall).title ||
            /** @type {{ name?: unknown }} */ (toolCall).name ||
            "",
        )
      : "";
  return /read|search|grep|glob|list|fetch|look/i.test(`${kind} ${title}`);
}

/**
 * Build a synthetic tool_call_update from a permission request so the chat UI
 * can show file paths even when earlier session/update frames omitted rawInput.
 * @param {unknown} params
 * @returns {Record<string, unknown> | null}
 */
function toolCallUpdateFromPermission(params) {
  const p = params && typeof params === "object" ? params : {};
  const toolCall =
    /** @type {{ toolCall?: unknown, tool_call?: unknown }} */ (p).toolCall ||
    /** @type {{ tool_call?: unknown }} */ (p).tool_call ||
    null;
  if (!toolCall || typeof toolCall !== "object") return null;
  const tc = /** @type {Record<string, unknown>} */ (toolCall);
  const toolCallId = String(
    tc.toolCallId || tc.tool_call_id || tc.id || "",
  ).trim();
  if (!toolCallId) return null;

  /** @type {Record<string, unknown>} */
  const update = {
    sessionUpdate: "tool_call_update",
    toolCallId,
  };
  if (typeof tc.title === "string" && tc.title.trim()) {
    update.title = tc.title.trim();
  }
  if (typeof tc.kind === "string" && tc.kind.trim()) {
    update.kind = tc.kind.trim();
  } else if (typeof tc.toolKind === "string" && tc.toolKind.trim()) {
    update.kind = tc.toolKind.trim();
  }
  if (Array.isArray(tc.locations) && tc.locations.length > 0) {
    update.locations = tc.locations;
  }
  if (tc.rawInput !== undefined && tc.rawInput !== null) {
    update.rawInput = tc.rawInput;
  } else if (tc.input !== undefined && tc.input !== null) {
    update.rawInput = tc.input;
  } else if (tc.arguments !== undefined && tc.arguments !== null) {
    update.rawInput = tc.arguments;
  }
  if (
    !update.title &&
    !update.kind &&
    !update.locations &&
    update.rawInput === undefined
  ) {
    return null;
  }
  return update;
}

/**
 * @param {unknown} params
 */
function summarizePermission(params) {
  const p = params && typeof params === "object" ? params : {};
  const toolCall =
    /** @type {{ toolCall?: unknown, tool_call?: unknown }} */ (p).toolCall ||
    /** @type {{ tool_call?: unknown }} */ (p).tool_call ||
    null;
  const title =
    toolCall && typeof toolCall === "object"
      ? String(
          /** @type {{ title?: unknown, name?: unknown }} */ (toolCall).title ||
            /** @type {{ name?: unknown }} */ (toolCall).name ||
            "Tool permission",
        )
      : "Tool permission";
  const kind =
    toolCall && typeof toolCall === "object"
      ? String(
          /** @type {{ kind?: unknown, toolKind?: unknown }} */ (toolCall).kind ||
            /** @type {{ toolKind?: unknown }} */ (toolCall).toolKind ||
            "",
        )
      : "";
  const detailParts = [];
  if (kind) detailParts.push(kind);
  const locations =
    toolCall && typeof toolCall === "object"
      ? /** @type {{ locations?: unknown }} */ (toolCall).locations
      : null;
  if (Array.isArray(locations) && locations.length > 0) {
    const paths = locations
      .map((loc) =>
        loc && typeof loc === "object"
          ? String(/** @type {{ path?: unknown }} */ (loc).path || "")
          : "",
      )
      .filter(Boolean);
    if (paths.length) detailParts.push(paths.slice(0, 3).join(", "));
  }
  const options =
    /** @type {{ optionId?: string, id?: string, name?: string, label?: string }[]} */ (
      /** @type {{ options?: unknown, permissionOptions?: unknown }} */ (p)
        .options ||
        /** @type {{ permissionOptions?: unknown }} */ (p).permissionOptions ||
        []
    ).map((o) => ({
      id: String(o.optionId || o.id || ""),
      label: String(o.name || o.label || o.optionId || o.id || "Option"),
    }));
  return {
    title,
    detail: detailParts.join(" · ") || null,
    options: options.filter((o) => o.id),
  };
}

/**
 * @param {unknown} params
 */
function summarizeAskQuestion(params) {
  const p = params && typeof params === "object" ? params : {};
  const questions = Array.isArray(
    /** @type {{ questions?: unknown }} */ (p).questions,
  )
    ? /** @type {unknown[]} */ (
        /** @type {{ questions?: unknown }} */ (p).questions
      )
    : [];
  const first =
    questions[0] && typeof questions[0] === "object"
      ? /** @type {Record<string, unknown>} */ (questions[0])
      : null;
  const title = String(
    first?.prompt || first?.question || first?.text || "Agent question",
  );
  const optionsRaw = Array.isArray(first?.options) ? first.options : [];
  const options = optionsRaw
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const opt = /** @type {Record<string, unknown>} */ (o);
      const id = String(opt.id || opt.optionId || opt.value || "");
      if (!id) return null;
      return {
        id,
        label: String(opt.label || opt.name || opt.text || id),
      };
    })
    .filter(Boolean);
  return {
    title,
    detail:
      questions.length > 1 ? `${questions.length} questions` : null,
    options,
    questions: questions.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return {
          id: `q-${index}`,
          prompt: "Question",
          options: [],
          multiSelect: false,
        };
      }
      const q = /** @type {Record<string, unknown>} */ (entry);
      const optionsRaw = Array.isArray(q.options) ? q.options : [];
      return {
        id: String(q.id ?? q.questionId ?? `q-${index}`),
        prompt: String(q.prompt ?? q.question ?? q.text ?? "Question"),
        multiSelect: q.multiSelect === true || q.allow_multiple === true,
        options: optionsRaw
          .map((o) => {
            if (!o || typeof o !== "object") return null;
            const opt = /** @type {Record<string, unknown>} */ (o);
            const id = String(opt.id || opt.optionId || opt.value || "");
            if (!id) return null;
            return {
              id,
              label: String(opt.label || opt.name || opt.text || id),
            };
          })
          .filter(Boolean),
      };
    }),
  };
}

/**
 * @param {string} requestId
 * @param {"permission" | "ask_question"} kind
 * @param {number} rpcId
 * @param {string | null} taskId
 * @param {string | null} sessionId
 * @param {unknown} params
 * @param {() => unknown} timeoutResult
 */
function enqueueUiRequest(
  requestId,
  kind,
  rpcId,
  taskId,
  sessionId,
  params,
  timeoutResult,
) {
  const timer = setTimeout(() => {
    const pendingReq = pendingUiRequests.get(requestId);
    if (!pendingReq) return;
    pendingUiRequests.delete(requestId);
    sendResponse(pendingReq.rpcId, timeoutResult());
    emit({
      type:
        kind === "permission" ? "permission-timeout" : "ask-question-timeout",
      requestId,
      taskId: pendingReq.taskId,
      sessionId: pendingReq.sessionId,
    });
  }, UI_REQUEST_TIMEOUT_MS);

  pendingUiRequests.set(requestId, {
    rpcId,
    kind,
    taskId,
    sessionId,
    params,
    timer,
  });
}

/**
 * Resolve a pending permission / ask_question from Chat UI.
 * @param {{
 *   requestId: string,
 *   optionId?: string | null,
 *   preference?: "once" | "always" | "reject" | null,
 *   skipped?: boolean,
 *   answers?: { questionId: string, selectedOptionIds: string[] }[] | null,
 * }} options
 */
export function respondAcpUiRequest(options) {
  const requestId = options.requestId?.trim();
  if (!requestId) {
    return { ok: false, error: "requestId is required." };
  }
  const pendingReq = pendingUiRequests.get(requestId);
  if (!pendingReq) {
    return { ok: false, error: "No pending request for that id." };
  }
  clearTimeout(pendingReq.timer);
  pendingUiRequests.delete(requestId);

  if (pendingReq.kind === "permission") {
    const optionId = options.optionId?.trim();
    if (optionId) {
      sendResponse(pendingReq.rpcId, {
        outcome: { outcome: "selected", optionId },
      });
    } else {
      const preference =
        options.preference === "always" || options.preference === "reject"
          ? options.preference
          : "once";
      sendResponse(
        pendingReq.rpcId,
        permissionOutcome(pendingReq.params, preference),
      );
    }
    return { ok: true, kind: pendingReq.kind, requestId };
  }

  if (options.skipped) {
    sendResponse(pendingReq.rpcId, {
      outcome: { outcome: "skipped", reason: "Skipped in BacksterOS Chat" },
    });
  } else if (Array.isArray(options.answers) && options.answers.length > 0) {
    sendResponse(pendingReq.rpcId, {
      outcome: {
        outcome: "answered",
        answers: options.answers.map((answer) => ({
          questionId: String(answer.questionId ?? ""),
          selectedOptionIds: Array.isArray(answer.selectedOptionIds)
            ? answer.selectedOptionIds.map((id) => String(id))
            : [],
        })),
      },
    });
  } else {
    const optionId = options.optionId?.trim();
    const summary = summarizeAskQuestion(pendingReq.params);
    const first =
      Array.isArray(summary.questions) && summary.questions[0]
        ? /** @type {Record<string, unknown>} */ (summary.questions[0])
        : null;
    const questionId = String(first?.id || "0");
    sendResponse(pendingReq.rpcId, {
      outcome: {
        outcome: "answered",
        answers: [
          {
            questionId,
            selectedOptionIds: optionId ? [optionId] : [],
          },
        ],
      },
    });
  }
  return { ok: true, kind: pendingReq.kind, requestId };
}

function clearPendingUiRequests(reason) {
  for (const [requestId, pendingReq] of pendingUiRequests) {
    clearTimeout(pendingReq.timer);
    pendingUiRequests.delete(requestId);
    try {
      if (pendingReq.kind === "permission") {
        sendResponse(
          pendingReq.rpcId,
          permissionOutcome(pendingReq.params, "reject"),
        );
      } else {
        sendResponse(pendingReq.rpcId, {
          outcome: {
            outcome: "skipped",
            reason: reason || "ACP process ended",
          },
        });
      }
    } catch {
      /* ignore */
    }
    emit({
      type: "ui-request-cleared",
      requestId,
      taskId: pendingReq.taskId,
      sessionId: pendingReq.sessionId,
      reason,
    });
  }
}

/**
 * @param {unknown} msg
 */
function handleStdoutMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  const m = /** @type {Record<string, unknown>} */ (msg);

  if (
    m.id != null &&
    typeof m.id === "number" &&
    (m.result !== undefined || m.error !== undefined)
  ) {
    const waiter = pending.get(m.id);
    if (!waiter) return;
    pending.delete(m.id);
    if (m.error) waiter.reject(m.error);
    else waiter.resolve(m.result);
    return;
  }

  const method = typeof m.method === "string" ? m.method : "";
  const params = m.params;
  const rpcId = typeof m.id === "number" ? m.id : null;

  if (method === "session/update") {
    const sessionId =
      params && typeof params === "object" && "sessionId" in params
        ? String(/** @type {{ sessionId?: unknown }} */ (params).sessionId ?? "")
            .trim()
            .toLowerCase()
        : "";
    const update =
      params && typeof params === "object" && "update" in params
        ? /** @type {{ update?: unknown }} */ (params).update
        : params;
    const taskId = sessionId ? taskIdBySessionId.get(sessionId) || null : null;

    if (update && typeof update === "object" && sessionId) {
      const u = /** @type {Record<string, unknown>} */ (update);
      if (
        u.sessionUpdate === "agent_message_chunk" &&
        u.content &&
        typeof u.content === "object"
      ) {
        const text = /** @type {{ text?: unknown }} */ (u.content).text;
        if (typeof text === "string" && text) {
          const prev = assistantDraftBySession.get(sessionId) || "";
          const next = prev + text;
          assistantDraftBySession.set(sessionId, next);
          if (PROVIDER_FATAL_RE.test(next)) {
            const reqId = promptRequestBySession.get(sessionId);
            const waiter = reqId != null ? pending.get(reqId) : null;
            if (waiter) {
              pending.delete(reqId);
              promptRequestBySession.delete(sessionId);
              waiter.reject(new Error(next.trim().slice(0, 500)));
              try {
                sendNotification("session/cancel", { sessionId });
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
      if (
        u.sessionUpdate === "current_mode_update" ||
        u.sessionUpdate === "currentModeUpdate"
      ) {
        const modeRaw =
          typeof u.modeId === "string"
            ? u.modeId
            : typeof u.currentModeId === "string"
              ? u.currentModeId
              : "";
        const modeId = normalizeCursorModeId(modeRaw);
        if (modeId) {
          if (taskId) {
            const session = sessionsByTaskId.get(taskId);
            if (session && session.sessionId === sessionId) {
              session.modeId = modeId;
            }
          }
          emit({
            type: "mode-changed",
            taskId,
            sessionId,
            modeId,
            source: "agent",
          });
        }
      }
    }

    emit({
      type: "session-update",
      taskId,
      sessionId: sessionId || null,
      update,
    });
    return;
  }

  if (method === "session/request_permission" && rpcId != null) {
    const sessionId =
      params && typeof params === "object" && "sessionId" in params
        ? String(/** @type {{ sessionId?: unknown }} */ (params).sessionId ?? "")
            .trim()
            .toLowerCase()
        : "";
    const taskId = sessionId ? taskIdBySessionId.get(sessionId) || null : null;
    const summary = summarizePermission(params);

    // Keep chat moving for read/search tools; prompt for write/exec/etc.
    if (permissionLooksLikeRead(params)) {
      // Cursor often omits rawInput on the initial tool_call frame; the
      // permission payload usually has locations / input — forward those so
      // the chat activity row can show which file is being read/grepped.
      const enriched = toolCallUpdateFromPermission(params);
      if (enriched) {
        emit({
          type: "session-update",
          taskId,
          sessionId: sessionId || null,
          update: enriched,
        });
      }
      emit({
        type: "permission",
        requestId: null,
        auto: true,
        taskId,
        sessionId: sessionId || null,
        title: summary.title,
        detail: summary.detail,
        options: summary.options,
        params,
      });
      sendResponse(rpcId, permissionOutcome(params, "once"));
      return;
    }

    const requestId = `perm-${rpcId}-${Date.now().toString(36)}`;
    enqueueUiRequest(
      requestId,
      "permission",
      rpcId,
      taskId,
      sessionId || null,
      params,
      () => permissionOutcome(params, "once"),
    );
    emit({
      type: "permission",
      requestId,
      auto: false,
      taskId,
      sessionId: sessionId || null,
      title: summary.title,
      detail: summary.detail,
      options: summary.options,
      params,
    });
    return;
  }

  if (method.startsWith("cursor/")) {
    const sessionId =
      params && typeof params === "object" && "sessionId" in params
        ? String(
            /** @type {{ sessionId?: unknown }} */ (params).sessionId ?? "",
          )
            .trim()
            .toLowerCase()
        : "";
    const taskId = sessionId
      ? taskIdBySessionId.get(sessionId) || null
      : null;

    emit({
      type: "cursor-extension",
      method,
      params,
      taskId,
      sessionId: sessionId || null,
    });

    if (method === "cursor/ask_question" && rpcId != null) {
      const summary = summarizeAskQuestion(params);
      const requestId = `ask-${rpcId}-${Date.now().toString(36)}`;
      enqueueUiRequest(
        requestId,
        "ask_question",
        rpcId,
        taskId,
        sessionId || null,
        params,
        () => ({
          outcome: {
            outcome: "skipped",
            reason: "Timed out waiting for BacksterOS Chat",
          },
        }),
      );
      emit({
        type: "ask-question",
        requestId,
        taskId,
        sessionId: sessionId || null,
        title: summary.title,
        detail: summary.detail,
        options: summary.options,
        questions: summary.questions,
        params,
      });
      return;
    }

    if (method === "cursor/create_plan") {
      // t3 accepts create_plan and surfaces plan markdown in the UI.
      if (rpcId != null) {
        sendResponse(rpcId, { accepted: true });
      }
      emit({
        type: "cursor-create-plan",
        taskId,
        sessionId: sessionId || null,
        params,
      });
      return;
    }

    if (method === "cursor/update_todos") {
      // Notification in Cursor ACP — no response required; still ACK if requested.
      if (rpcId != null) {
        sendResponse(rpcId, {});
      }
      emit({
        type: "cursor-update-todos",
        taskId,
        sessionId: sessionId || null,
        params,
      });
      return;
    }

    // Unknown cursor/* extension — cancel requests so the agent can continue.
    if (rpcId != null) {
      sendResponse(rpcId, { outcome: { outcome: "cancelled" } });
    }
    return;
  }

  if (method) {
    emit({ type: "notification", method, params });
  }
}

function resetProcessState(reason) {
  console.warn(`[acp] process reset (${reason})`);
  clearPendingUiRequests(reason);
  for (const [id, waiter] of pending) {
    pending.delete(id);
    waiter.reject(new Error(`ACP process ended during ${waiter.method}`));
  }
  promptRequestBySession.clear();
  assistantDraftBySession.clear();
  authenticated = false;
  runtimeVersion = 0;
  child = null;
  endMcpIsolation();
  if (stdoutRl) {
    try {
      stdoutRl.close();
    } catch {
      /* ignore */
    }
    stdoutRl = null;
  }
  emit({ type: "process-exit", reason });
}

/**
 * Ensure the long-lived `agent acp` process is up and authenticated.
 */
export async function ensureAcpProcess() {
  if (
    child &&
    !child.killed &&
    child.stdin.writable &&
    authenticated &&
    runtimeVersion === ACP_RUNTIME_VERSION
  ) {
    return true;
  }
  if (starting) return starting;

  starting = (async () => {
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      child = null;
      authenticated = false;
      runtimeVersion = 0;
    }

    beginMcpIsolation();
    let isolationReleased = false;
    const releaseIsolation = () => {
      if (isolationReleased) return;
      isolationReleased = true;
      endMcpIsolation();
    };

    try {
      const proc = spawn(AGENT_BIN, ["acp"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
        cwd: process.env.HOME || process.cwd(),
      });
      child = proc;

      stdoutRl = readline.createInterface({ input: proc.stdout });
      stdoutRl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          handleStdoutMessage(JSON.parse(trimmed));
        } catch {
          console.warn("[acp] non-JSON stdout:", trimmed.slice(0, 200));
        }
      });

      proc.stderr.on("data", (buf) => {
        const text = String(buf);
        if (/error|fail|warn/i.test(text)) {
          console.warn("[acp:stderr]", text.slice(0, 500));
        }
      });

      proc.on("exit", (code, signal) => {
        if (child === proc) {
          resetProcessState(`exit code=${code} signal=${signal}`);
        }
      });

      await sendRequest(
        "initialize",
        {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: { name: "backsteros", version: "0.1.0" },
        },
        20_000,
      );

      await sendRequest("authenticate", { methodId: "cursor_login" }, 20_000);
      authenticated = true;
      runtimeVersion = ACP_RUNTIME_VERSION;
      // Restore the user's MCP servers ASAP — tools are already bound into this
      // process; the IDE should see the real config again.
      releaseIsolation();
      console.log("[acp] process ready (authenticated, MCP restored)");
      return true;
    } catch (error) {
      releaseIsolation();
      throw error;
    }
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/**
 * @param {string} taskId
 * @param {string} sessionId
 * @param {string} cwd
 * @param {{ keepBusy?: boolean }} [options]
 */
function rememberSession(taskId, sessionId, cwd, options = {}) {
  const id = taskId.trim();
  const sid = sessionId.trim().toLowerCase();
  const previous = sessionsByTaskId.get(id);
  // Never carry a stuck busy flag onto a new ACP session id.
  const sameSession = Boolean(previous && previous.sessionId === sid);
  const busy =
    options.keepBusy === true && sameSession ? Boolean(previous?.busy) : false;

  if (previous && previous.sessionId !== sid) {
    taskIdBySessionId.delete(previous.sessionId);
  }

  sessionsByTaskId.set(id, {
    taskId: id,
    sessionId: sid,
    cwd,
    busy,
    modeId: sameSession ? previous?.modeId ?? null : null,
  });
  taskIdBySessionId.set(sid, id);
}

/**
 * Clear the in-memory "working" lock for a task (or all tasks).
 * @param {string | null | undefined} [taskId]
 */
export function clearAcpBusy(taskId) {
  if (!taskId) {
    for (const session of sessionsByTaskId.values()) {
      session.busy = false;
    }
    return;
  }
  const session = sessionsByTaskId.get(taskId.trim());
  if (session) session.busy = false;
}

/**
 * Create or resume an ACP session for a task.
 * Prefer `session/load` when `sessionId` is provided (existing agentChatId).
 * Pass `forceNew: true` to create a fresh session (e.g. /clear).
 *
 * @param {{
 *   taskId: string,
 *   cwd: string,
 *   sessionId?: string | null,
 *   forceNew?: boolean,
 * }} options
 */
export async function ensureAcpSession(options) {
  const taskId = options.taskId.trim();
  const cwd = options.cwd.trim();
  if (!taskId) throw new Error("taskId is required");
  if (!cwd) throw new Error("cwd is required");

  await ensureAcpProcess();

  if (options.forceNew) {
    forgetAcpSession(taskId);
    const created = await sendRequest(
      "session/new",
      { cwd, mcpServers: [] },
      30_000,
    );
    const sessionId =
      created &&
      typeof created === "object" &&
      typeof /** @type {{ sessionId?: unknown }} */ (created).sessionId ===
        "string"
        ? /** @type {{ sessionId: string }} */ (created).sessionId.toLowerCase()
        : "";
    if (!sessionId) throw new Error("ACP session/new did not return sessionId");
    rememberSession(taskId, sessionId, cwd);
    console.log(`[acp] session/new (force) task=${taskId} session=${sessionId}`);
    return { sessionId, cwd, resumed: false, created: true };
  }

  const existing = sessionsByTaskId.get(taskId);
  const wanted = options.sessionId?.trim().toLowerCase() || null;

  if (existing && (!wanted || existing.sessionId === wanted)) {
    // Ensure must never leave a sticky busy lock from a crashed/failed turn.
    existing.busy = false;
    existing.cwd = cwd || existing.cwd;
    return {
      sessionId: existing.sessionId,
      cwd: existing.cwd,
      resumed: true,
      created: false,
    };
  }

  if (wanted) {
    try {
      const loaded = await sendRequest(
        "session/load",
        { sessionId: wanted, cwd, mcpServers: [] },
        30_000,
      );
      const sessionId =
        loaded &&
        typeof loaded === "object" &&
        typeof /** @type {{ sessionId?: unknown }} */ (loaded).sessionId ===
          "string"
          ? /** @type {{ sessionId: string }} */ (loaded).sessionId.toLowerCase()
          : wanted;
      rememberSession(taskId, sessionId, cwd);
      console.log(`[acp] session/load task=${taskId} session=${sessionId}`);
      return { sessionId, cwd, resumed: true, created: false };
    } catch (error) {
      console.warn(
        `[acp] session/load failed for ${wanted}, creating new:`,
        formatRpcError(error),
      );
    }
  }

  const created = await sendRequest(
    "session/new",
    { cwd, mcpServers: [] },
    30_000,
  );
  const sessionId =
    created &&
    typeof created === "object" &&
    typeof /** @type {{ sessionId?: unknown }} */ (created).sessionId ===
      "string"
      ? /** @type {{ sessionId: string }} */ (created).sessionId.toLowerCase()
      : "";
  if (!sessionId) throw new Error("ACP session/new did not return sessionId");
  rememberSession(taskId, sessionId, cwd);
  console.log(`[acp] session/new task=${taskId} session=${sessionId}`);
  return { sessionId, cwd, resumed: false, created: true };
}

/**
 * @param {string} taskId
 */
export function getAcpSession(taskId) {
  return sessionsByTaskId.get(taskId.trim()) ?? null;
}

/**
 * Run a Chat turn. Streams session/update events via {@link onAcpEvent}.
 *
 * @param {{
 *   taskId: string,
 *   prompt: string,
 *   modeId?: string | null,
 *   images?: { mimeType: string, data: string }[] | null,
 * }} options
 */
export async function acpPrompt(options) {
  const taskId = options.taskId.trim();
  const text = options.prompt.trim();
  if (!taskId) throw new Error("taskId is required");
  if (!text && !(Array.isArray(options.images) && options.images.length > 0)) {
    throw new Error("prompt is required");
  }

  const session = sessionsByTaskId.get(taskId);
  if (!session) {
    throw new Error("No ACP session for this task. Call ensure first.");
  }
  if (session.busy) {
    const reqId = promptRequestBySession.get(session.sessionId);
    const hasInFlight = reqId != null && pending.has(reqId);
    if (!hasInFlight) {
      // Stale lock from a failed/cancelled turn — heal and continue.
      session.busy = false;
    } else {
      throw new Error(
        "Agent is already working on this task. Wait for it to finish, or press Stop.",
      );
    }
  }

  const desiredMode = normalizeCursorModeId(options.modeId);
  if (desiredMode && session.modeId !== desiredMode) {
    try {
      await acpSetMode({ taskId, modeId: desiredMode });
    } catch (error) {
      console.warn(
        "[acp] set_mode before prompt failed:",
        formatRpcError(error),
      );
    }
  }

  await ensureAcpProcess();
  session.busy = true;
  emit({
    type: "activity",
    taskId,
    sessionId: session.sessionId,
    activity: "working",
  });

  /** @type {Array<Record<string, unknown>>} */
  const promptBlocks = [];
  if (Array.isArray(options.images)) {
    for (const image of options.images) {
      if (!image || typeof image !== "object") continue;
      const mimeType =
        typeof image.mimeType === "string" ? image.mimeType.trim() : "";
      const data = typeof image.data === "string" ? image.data.trim() : "";
      if (!mimeType.startsWith("image/") || !data) continue;
      promptBlocks.push({ type: "image", mimeType, data });
    }
  }
  if (text) {
    promptBlocks.push({ type: "text", text });
  }
  if (promptBlocks.length === 0) {
    throw new Error("prompt is required");
  }

  try {
    const result = await sendRequest(
      "session/prompt",
      {
        sessionId: session.sessionId,
        prompt: promptBlocks,
      },
      10 * 60_000,
      { sessionId: session.sessionId },
    );
    const draft = (assistantDraftBySession.get(session.sessionId) || "").trim();
    if (PROVIDER_FATAL_RE.test(draft)) {
      throw new Error(draft.slice(0, 500));
    }
    emit({
      type: "prompt-complete",
      taskId,
      sessionId: session.sessionId,
      result,
    });
    return result;
  } catch (error) {
    emit({
      type: "prompt-error",
      taskId,
      sessionId: session.sessionId,
      error: formatRpcError(error),
    });
    throw new Error(formatRpcError(error));
  } finally {
    session.busy = false;
    assistantDraftBySession.delete(session.sessionId);
    emit({
      type: "activity",
      taskId,
      sessionId: session.sessionId,
      activity: "idle",
    });
  }
}

/**
 * Normalize UI / CLI mode aliases to Cursor ACP mode ids.
 * @param {string | null | undefined} value
 * @returns {"agent" | "ask" | "plan" | "debug" | null}
 */
export function normalizeCursorModeId(value) {
  const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!trimmed) return null;
  if (trimmed === "agent" || trimmed === "build" || trimmed === "default") {
    return "agent";
  }
  if (trimmed === "ask") return "ask";
  if (trimmed === "plan") return "plan";
  if (trimmed === "debug") return "debug";
  return null;
}

/**
 * Switch Cursor ACP session mode (`session/set_mode`).
 * @param {{
 *   taskId: string,
 *   modeId: string,
 * }} options
 */
export async function acpSetMode(options) {
  const taskId = options.taskId.trim();
  const modeId = normalizeCursorModeId(options.modeId);
  if (!taskId) throw new Error("taskId is required");
  if (!modeId) throw new Error("modeId must be agent, ask, plan, or debug");

  const session = sessionsByTaskId.get(taskId);
  if (!session) {
    throw new Error("No ACP session for this task. Call ensure first.");
  }
  if (session.modeId === modeId) {
    return { modeId, unchanged: true, sessionId: session.sessionId };
  }

  await ensureAcpProcess();
  await sendRequest(
    "session/set_mode",
    { sessionId: session.sessionId, modeId },
    15_000,
  );
  session.modeId = modeId;
  emit({
    type: "mode-changed",
    taskId,
    sessionId: session.sessionId,
    modeId,
    source: "client",
  });
  console.log(`[acp] session/set_mode task=${taskId} mode=${modeId}`);
  return { modeId, unchanged: false, sessionId: session.sessionId };
}

/**
 * Soft-cancel the in-flight turn for a task.
 * ACP `session/cancel` is a JSON-RPC notification (no response).
 * @param {string} taskId
 */
export async function acpCancel(taskId) {
  const id = taskId.trim();
  const session = sessionsByTaskId.get(id);
  clearAcpBusy(id);
  if (!session) return false;

  cancelPendingUiRequestsForSession(session.sessionId, "session/cancel");

  await ensureAcpProcess();
  try {
    // Must be a notification — requests hang forever waiting for a reply.
    sendNotification("session/cancel", { sessionId: session.sessionId });
  } catch (error) {
    console.warn("[acp] cancel failed:", formatRpcError(error));
    return false;
  }

  // Unblock the local session/prompt waiter; Cursor aborts asynchronously.
  const reqId = promptRequestBySession.get(session.sessionId);
  const waiter = reqId != null ? pending.get(reqId) : null;
  if (waiter && reqId != null) {
    pending.delete(reqId);
    promptRequestBySession.delete(session.sessionId);
    waiter.reject(new Error("Cancelled"));
  }

  return true;
}

/**
 * Drop local session bookkeeping (does not delete Cursor history).
 * @param {string} taskId
 */
export function forgetAcpSession(taskId) {
  const id = taskId.trim();
  const session = sessionsByTaskId.get(id);
  if (!session) return;
  clearAcpBusy(id);
  const reqId = promptRequestBySession.get(session.sessionId);
  if (reqId != null) {
    const waiter = pending.get(reqId);
    pending.delete(reqId);
    promptRequestBySession.delete(session.sessionId);
    waiter?.reject(new Error("Session forgotten"));
  }
  sessionsByTaskId.delete(id);
  taskIdBySessionId.delete(session.sessionId);
  assistantDraftBySession.delete(session.sessionId);
}

export function listAcpSessions() {
  return [...sessionsByTaskId.values()].map((s) => ({ ...s }));
}
