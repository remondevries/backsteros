/**
 * Local PTY bridge for BacksterOS Development.
 * Binds to 127.0.0.1 only — not for remote/production use.
 *
 * Protocol (JSON text frames):
 *   client → server: { type: "input", data: string }
 *                    { type: "resize", cols: number, rows: number }
 *                    { type: "kill" }  — destroy the PTY (not just detach)
 *   server → client: { type: "ready", shell, cwd, sessionId, reattached?: boolean }
 *                    { type: "output", data: string }
 *                    { type: "agent-hook", event: string }
 *                    { type: "exit", code: number | null }
 *                    { type: "error", message: string }
 *
 * WebSocket close only detaches the UI — the shell/agent keeps running until
 * `kill`, process exit, or the PTY server restarts.
 *
 * Cursor Agent hooks POST to /agent-hook so the UI can mark working/idle.
 */
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pty from "node-pty";
import { WebSocketServer } from "ws";

import { ensureCursorAgentHooks } from "./ensure-cursor-agent-hooks.mjs";

const HOST = process.env.PTY_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PTY_PORT ?? 3101);
const SHELL =
  process.env.PTY_SHELL ??
  process.env.SHELL ??
  (process.platform === "win32" ? "powershell.exe" : "/bin/zsh");
const DEFAULT_CWD = process.env.PTY_CWD ?? os.homedir();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Scan at most this many trailing bytes of a transcript for assistant text. */
const TRANSCRIPT_SCAN_BYTES = 512 * 1024;

/** @type {Map<string, import("ws").WebSocket>} */
const sessionsById = new Map();

/**
 * Live PTY processes keyed by session id. Survives WebSocket disconnect so the
 * browser can navigate away and reattach without killing Cursor Agent.
 * @type {Map<string, {
 *   pty: import("node-pty").IPty,
 *   cwd: string,
 *   dataDisposable: { dispose: () => void },
 *   exitDisposable: { dispose: () => void },
 * }>}
 */
const ptysById = new Map();

/** @type {Map<string, "working" | "idle">} */
const lastActivityBySession = new Map();

const WORKING_HOOK_EVENTS = new Set([
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "beforeShellExecution",
  "beforeMCPExecution",
  // afterAgentResponse is text-only: in CLI it often arrives *after* stop and
  // must not flip activity back to working (that restarts an In Progress turn).
]);

const IDLE_HOOK_EVENTS = new Set(["stop", "sessionEnd"]);

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
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
    beforemcpexecution: "beforeMCPExecution",
  };
  return aliases[lower] ?? trimmed;
}

function asNonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return null;
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
  }

  const usage = extractHookUsage(payload);
  // CLI often omits afterAgentResponse; on stop pull text from the payload or
  // transcript so hold/review comments still get the assistant message.
  const text = extractHookAssistantText(payload, event);

  const ws = sessionsById.get(sessionId);
  if (!ws) {
    // Detached UI — keep lastActivity for reattach; still accept the hook.
    return true;
  }

  send(ws, {
    type: "agent-hook",
    event,
    activity,
    ...(usage ? { usage } : {}),
    ...(text != null && text.length > 0 ? { text } : {}),
  });
  return true;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

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

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("BacksterOS PTY bridge — connect via WebSocket.\n");
});

const wss = new WebSocketServer({ server: httpServer });

function destroyPty(sessionId, reason = "kill") {
  const entry = ptysById.get(sessionId);
  if (!entry) return;
  ptysById.delete(sessionId);
  lastActivityBySession.delete(sessionId);
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

function bindSocketToPty(ws, sessionId, entry, { reattached, cols, rows }) {
  const previous = sessionsById.get(sessionId);
  if (previous && previous !== ws) {
    try {
      previous.close();
    } catch {
      /* ignore */
    }
  }
  sessionsById.set(sessionId, ws);

  try {
    entry.pty.resize(
      Math.max(2, cols),
      Math.max(1, rows),
    );
  } catch {
    /* ignore resize races */
  }

  send(ws, {
    type: "ready",
    shell: SHELL,
    cwd: entry.cwd,
    sessionId,
    reattached,
    ...(reattached && lastActivityBySession.has(sessionId)
      ? { lastActivity: lastActivityBySession.get(sessionId) }
      : {}),
  });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message?.type === "kill") {
      destroyPty(sessionId, "client-kill");
      try {
        ws.close();
      } catch {
        /* ignore */
      }
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
    if (sessionsById.get(sessionId) === ws) {
      sessionsById.delete(sessionId);
      console.log(`[pty] detached session=${sessionId} (process kept alive)`);
    }
    // Do NOT kill the PTY — client may reattach with the same sessionId.
  });
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const cwdParam = url.searchParams.get("cwd");
  const cwd =
    cwdParam && path.isAbsolute(cwdParam) ? cwdParam : DEFAULT_CWD;
  const sessionId =
    url.searchParams.get("sessionId")?.trim() ||
    `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  let cols = Number(url.searchParams.get("cols") ?? 80);
  let rows = Number(url.searchParams.get("rows") ?? 24);
  if (!Number.isFinite(cols) || cols < 2) cols = 80;
  if (!Number.isFinite(rows) || rows < 1) rows = 24;

  const existing = ptysById.get(sessionId);
  if (existing) {
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
      BACKSTEROS_AGENT_HOOK_URL: `http://${HOST}:${PORT}/agent-hook`,
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
   *   dataDisposable: { dispose: () => void },
   *   exitDisposable: { dispose: () => void },
   * }} */
  const entry = {
    pty: ptyProcess,
    cwd,
    dataDisposable: ptyProcess.onData((data) => {
      const socket = sessionsById.get(sessionId);
      if (socket) send(socket, { type: "output", data });
    }),
    exitDisposable: ptyProcess.onExit(({ exitCode }) => {
      const socket = sessionsById.get(sessionId);
      if (socket) {
        send(socket, { type: "exit", code: exitCode ?? null });
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
      sessionsById.delete(sessionId);
      ptysById.delete(sessionId);
      lastActivityBySession.delete(sessionId);
      console.log(`[pty] process exited session=${sessionId} code=${exitCode}`);
    }),
  };

  ptysById.set(sessionId, entry);
  console.log(`[pty] spawned session=${sessionId} cwd=${cwd}`);

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

httpServer.listen(PORT, HOST, () => {
  console.log(
    `[pty] listening on ws://${HOST}:${PORT} (shell=${SHELL}, cwd=${DEFAULT_CWD})`,
  );
  console.log(`[pty] agent hooks POST http://${HOST}:${PORT}/agent-hook`);
  console.log("[pty] detach-on-close enabled — agents survive UI navigation");
});
