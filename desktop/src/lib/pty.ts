/** Local PTY / ACP sidecar bridge (desktop agent Chat). */

export const DEFAULT_PTY_WS_URL = "ws://127.0.0.1:3101";
export const DEFAULT_PTY_HTTP_ORIGIN = "http://127.0.0.1:3101";

export type PtySessionKind = "agent" | "shell";

export type PtySessionInfo = {
  sessionId: string;
  kind: PtySessionKind;
  taskId: string | null;
  label: string | null;
  cwd: string | null;
  createdAt: string | null;
  lastActivity: "working" | "idle" | null;
  uiAttached: boolean;
};

function getPtyAuthToken(): string | null {
  return (
    (import.meta.env.VITE_PTY_AUTH_TOKEN as string | undefined)?.trim() || null
  );
}

function ptyAuthHeaders(): HeadersInit {
  const token = getPtyAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getPtyWebSocketUrl(options?: {
  cols?: number;
  rows?: number;
  cwd?: string | null;
  sessionId?: string | null;
  kind?: PtySessionKind | null;
  taskId?: string | null;
  label?: string | null;
  tabLabel?: string | null;
  chatId?: string | null;
}): string {
  const base =
    (import.meta.env.VITE_PTY_WS_URL as string | undefined)?.trim() ||
    DEFAULT_PTY_WS_URL;
  const url = new URL(base);
  if (options?.cols) url.searchParams.set("cols", String(options.cols));
  if (options?.rows) url.searchParams.set("rows", String(options.rows));
  if (options?.cwd) url.searchParams.set("cwd", options.cwd);
  if (options?.sessionId) url.searchParams.set("sessionId", options.sessionId);
  if (options?.kind) url.searchParams.set("kind", options.kind);
  if (options?.taskId) url.searchParams.set("taskId", options.taskId);
  if (options?.label) url.searchParams.set("label", options.label);
  if (options?.tabLabel) url.searchParams.set("tabLabel", options.tabLabel);
  if (options?.chatId) url.searchParams.set("chatId", options.chatId);
  const token = getPtyAuthToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function getPtyHttpOrigin(): string {
  return (
    (import.meta.env.VITE_PTY_HTTP_URL as string | undefined)?.trim() ||
    DEFAULT_PTY_HTTP_ORIGIN
  ).replace(/\/$/, "");
}

/** Create an empty Cursor Agent chat via the local PTY sidecar. */
export async function createCursorAgentChat(): Promise<
  { ok: true; chatId: string } | { ok: false; error: string }
> {
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/create-chat`, {
      method: "POST",
      headers: ptyAuthHeaders(),
    });
    const body = (await response.json().catch(() => null)) as {
      chatId?: string;
      error?: string;
    } | null;
    if (!response.ok || !body?.chatId) {
      return {
        ok: false,
        error:
          body?.error ||
          "Could not create agent session. Is `pnpm pty` running?",
      };
    }
    return { ok: true, chatId: body.chatId.toLowerCase() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

export type CursorAgentModelOption = {
  id: string;
  displayName: string;
};

/** List Cursor Agent models via the local PTY sidecar (`agent --list-models`). */
export async function listCursorAgentModels(): Promise<
  | { ok: true; models: CursorAgentModelOption[] }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/models`, {
      headers: ptyAuthHeaders(),
    });
    const body = (await response.json().catch(() => null)) as {
      models?: { id?: string; displayName?: string }[];
      error?: string;
    } | null;
    if (!response.ok || !Array.isArray(body?.models)) {
      return {
        ok: false,
        error: body?.error || "Could not list agent models.",
      };
    }
    const models = body.models
      .map((entry) => {
        const id = entry.id?.trim();
        if (!id) return null;
        return {
          id,
          displayName: entry.displayName?.trim() || id,
        };
      })
      .filter((entry): entry is CursorAgentModelOption => Boolean(entry));
    if (!models.some((m) => m.id === "auto")) {
      models.unshift({ id: "auto", displayName: "Auto" });
    }
    return { ok: true, models };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}


export async function listPtySessions(options?: {
  kind?: PtySessionKind;
}): Promise<
  | { ok: true; sessions: PtySessionInfo[] }
  | { ok: false; error: string; offline?: boolean }
> {
  try {
    const url = new URL(`${getPtyHttpOrigin()}/sessions`);
    if (options?.kind) url.searchParams.set("kind", options.kind);
    const response = await fetch(url.toString(), {
      headers: ptyAuthHeaders(),
    });
    const body = (await response.json().catch(() => null)) as {
      sessions?: PtySessionInfo[];
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `PTY sessions request failed (${response.status}).`,
      };
    }
    return { ok: true, sessions: Array.isArray(body?.sessions) ? body.sessions : [] };
  } catch (error) {
    return {
      ok: false,
      offline: true,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

export type AgentChatTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  activities?: Array<{
    id: string;
    kind: "tool" | "thought" | "plan" | "info";
    title: string;
    detail?: string;
    status?: "pending" | "in_progress" | "completed" | "failed";
    toolKind?: string;
    diff?: {
      path?: string;
      additions: number;
      deletions: number;
      lines: Array<{ type: "add" | "del" | "ctx"; text: string }>;
    };
  }>;
  segments?: Array<
    | {
        id: string;
        kind: "work";
        activities: NonNullable<AgentChatTranscriptMessage["activities"]>;
      }
    | { id: string; kind: "text"; text: string }
  >;
  planSteps?: Array<{
    step: string;
    status: "completed" | "inProgress" | "pending";
  }>;
  proposedPlanMarkdown?: string | null;
  workedStartedAt?: number | null;
};

function parseTranscriptActivities(
  raw: unknown,
): AgentChatTranscriptMessage["activities"] {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: NonNullable<AgentChatTranscriptMessage["activities"]> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim()) continue;
    if (
      item.kind !== "tool" &&
      item.kind !== "thought" &&
      item.kind !== "plan" &&
      item.kind !== "info"
    ) {
      continue;
    }
    if (typeof item.title !== "string" || !item.title.trim()) continue;
    const status =
      item.status === "pending" ||
      item.status === "in_progress" ||
      item.status === "completed" ||
      item.status === "failed"
        ? item.status
        : undefined;
    let diff: NonNullable<AgentChatTranscriptMessage["activities"]>[number]["diff"];
    const diffRaw = item.diff;
    if (diffRaw && typeof diffRaw === "object") {
      const d = diffRaw as Record<string, unknown>;
      const additions =
        typeof d.additions === "number" && Number.isFinite(d.additions)
          ? d.additions
          : 0;
      const deletions =
        typeof d.deletions === "number" && Number.isFinite(d.deletions)
          ? d.deletions
          : 0;
      const lines = Array.isArray(d.lines)
        ? d.lines
            .map((line) => {
              if (!line || typeof line !== "object") return null;
              const l = line as Record<string, unknown>;
              if (l.type !== "add" && l.type !== "del" && l.type !== "ctx") {
                return null;
              }
              if (typeof l.text !== "string") return null;
              return { type: l.type, text: l.text };
            })
            .filter(
              (
                line,
              ): line is { type: "add" | "del" | "ctx"; text: string } =>
                line != null,
            )
        : [];
      if (lines.length > 0 || additions > 0 || deletions > 0) {
        diff = {
          path: typeof d.path === "string" ? d.path : undefined,
          additions,
          deletions,
          lines,
        };
      }
    }
    out.push({
      id: item.id.trim(),
      kind: item.kind,
      title: item.title.trim(),
      detail: typeof item.detail === "string" ? item.detail : undefined,
      status,
      toolKind: typeof item.toolKind === "string" ? item.toolKind : undefined,
      ...(diff ? { diff } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseTranscriptSegments(
  raw: unknown,
): AgentChatTranscriptMessage["segments"] {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: NonNullable<AgentChatTranscriptMessage["segments"]> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim()) continue;
    if (item.kind === "text") {
      if (typeof item.text !== "string" || !item.text.trim()) continue;
      out.push({ id: item.id.trim(), kind: "text", text: item.text });
      continue;
    }
    if (item.kind === "work") {
      const activities = parseTranscriptActivities(item.activities);
      if (!activities?.length) continue;
      out.push({ id: item.id.trim(), kind: "work", activities });
    }
  }
  return out.length > 0 ? out : undefined;
}

function parseTranscriptPlanSteps(
  raw: unknown,
): AgentChatTranscriptMessage["planSteps"] {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: NonNullable<AgentChatTranscriptMessage["planSteps"]> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const step = typeof item.step === "string" ? item.step.trim() : "";
    if (!step) continue;
    const status =
      item.status === "completed" ||
      item.status === "inProgress" ||
      item.status === "pending"
        ? item.status
        : "pending";
    out.push({ step, status });
  }
  return out.length > 0 ? out : undefined;
}

function parseTranscriptMessages(
  raw: unknown,
): AgentChatTranscriptMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentChatTranscriptMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    const text = (entry as { text?: unknown }).text;
    const id = (entry as { id?: unknown }).id;
    const createdAt = (entry as { createdAt?: unknown }).createdAt;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string") continue;
    const activities = parseTranscriptActivities(
      (entry as { activities?: unknown }).activities,
    );
    const segments = parseTranscriptSegments(
      (entry as { segments?: unknown }).segments,
    );
    const trimmed = text.trim();
    const hasTimeline =
      Boolean(activities?.length) || Boolean(segments?.length);
    // Allow empty assistant text when a tool timeline is already present.
    if (!trimmed && !(role === "assistant" && hasTimeline)) continue;
    const planSteps = parseTranscriptPlanSteps(
      (entry as { planSteps?: unknown }).planSteps,
    );
    const proposedRaw = (entry as { proposedPlanMarkdown?: unknown })
      .proposedPlanMarkdown;
    const proposedPlanMarkdown =
      typeof proposedRaw === "string" && proposedRaw.trim()
        ? proposedRaw
        : undefined;
    const workedRaw = (entry as { workedStartedAt?: unknown }).workedStartedAt;
    out.push({
      id:
        typeof id === "string" && id.trim()
          ? id.trim()
          : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: trimmed,
      createdAt:
        typeof createdAt === "number" && Number.isFinite(createdAt)
          ? createdAt
          : Date.now(),
      ...(activities ? { activities } : {}),
      ...(segments ? { segments } : {}),
      ...(planSteps ? { planSteps } : {}),
      ...(proposedPlanMarkdown ? { proposedPlanMarkdown } : {}),
      ...(typeof workedRaw === "number" && Number.isFinite(workedRaw)
        ? { workedStartedAt: workedRaw }
        : workedRaw === null
          ? { workedStartedAt: null }
          : {}),
    });
  }
  return out;
}

/** Shared Chat-tab history on the laptop sidecar (desktop + iPad). */
export async function fetchAgentChatTranscript(
  chatId: string,
): Promise<
  | { ok: true; messages: AgentChatTranscriptMessage[] }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${getPtyHttpOrigin()}/agent/chats/${encodeURIComponent(id)}/transcript`,
      { headers: ptyAuthHeaders() },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Transcript fetch failed (${response.status}).`,
      };
    }
    return { ok: true, messages: parseTranscriptMessages(body?.messages) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

export async function putAgentChatTranscript(
  chatId: string,
  messages: readonly AgentChatTranscriptMessage[],
): Promise<
  | { ok: true; messages: AgentChatTranscriptMessage[] }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${getPtyHttpOrigin()}/agent/chats/${encodeURIComponent(id)}/transcript`,
      {
        method: "PUT",
        headers: {
          ...ptyAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Transcript save failed (${response.status}).`,
      };
    }
    return { ok: true, messages: parseTranscriptMessages(body?.messages) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

export async function appendAgentChatTranscriptMessage(
  chatId: string,
  message: AgentChatTranscriptMessage,
): Promise<
  | { ok: true; messages: AgentChatTranscriptMessage[]; appended: boolean }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${getPtyHttpOrigin()}/agent/chats/${encodeURIComponent(id)}/transcript`,
      {
        method: "POST",
        headers: {
          ...ptyAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      appended?: boolean;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Transcript append failed (${response.status}).`,
      };
    }
    return {
      ok: true,
      appended: body?.appended === true,
      messages: parseTranscriptMessages(body?.messages),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Incremental assistant timeline upsert (tools while streaming). */
export async function upsertAgentChatTranscriptTimeline(
  chatId: string,
  patch: {
    id?: string;
    text?: string;
    createdAt?: number;
    activities?: AgentChatTranscriptMessage["activities"];
    segments?: AgentChatTranscriptMessage["segments"];
    planSteps?: AgentChatTranscriptMessage["planSteps"];
    proposedPlanMarkdown?: string | null;
    workedStartedAt?: number | null;
  },
): Promise<
  | {
      ok: true;
      messages: AgentChatTranscriptMessage[];
      message: AgentChatTranscriptMessage | null;
    }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${getPtyHttpOrigin()}/agent/chats/${encodeURIComponent(id)}/transcript/timeline`,
      {
        method: "POST",
        headers: {
          ...ptyAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      message?: unknown;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error:
          body?.error || `Transcript timeline upsert failed (${response.status}).`,
      };
    }
    const messages = parseTranscriptMessages(body?.messages);
    const parsedOne = parseTranscriptMessages(
      body?.message ? [body.message] : [],
    );
    return {
      ok: true,
      messages,
      message: parsedOne[0] ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/**
 * Submit a follow-up prompt for a task (chat composer) via Cursor ACP.
 */
export async function submitPtyAgentPrompt(options: {
  taskId: string;
  prompt: string;
  chatId?: string | null;
  cwd?: string | null;
  /** UI mode (build/ask/plan) or Cursor mode id (agent/ask/plan). */
  mode?: string | null;
  /** Cursor `--model` id (omit / auto = CLI default). */
  model?: string | null;
  images?: { mimeType: string; data: string }[] | null;
  clear?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const taskId = options.taskId.trim();
  const prompt = options.prompt.trim();
  const images = (options.images ?? []).filter(
    (image) =>
      image.mimeType.startsWith("image/") && image.data.trim().length > 0,
  );
  if (!taskId || (!prompt && images.length === 0)) {
    return { ok: false, error: "taskId and prompt are required." };
  }
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/prompt`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        prompt,
        chatId: options.chatId?.trim() || null,
        cwd: options.cwd?.trim() || null,
        mode: options.mode?.trim() || null,
        model: options.model?.trim() || null,
        images,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Agent prompt failed (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Switch Cursor ACP session mode (agent / ask / plan). */
export async function setPtyAgentMode(options: {
  taskId: string;
  mode: string;
  chatId?: string | null;
  cwd?: string | null;
}): Promise<
  | { ok: true; modeId: string; unchanged: boolean }
  | { ok: false; error: string }
> {
  const taskId = options.taskId.trim();
  const mode = options.mode.trim();
  if (!taskId || !mode) {
    return { ok: false, error: "taskId and mode are required." };
  }
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/acp/mode`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        mode,
        chatId: options.chatId?.trim() || null,
        cwd: options.cwd?.trim() || null,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      modeId?: string;
      unchanged?: boolean;
      error?: string;
    } | null;
    if (!response.ok || !body?.modeId) {
      return {
        ok: false,
        error: body?.error || `Could not set agent mode (${response.status}).`,
      };
    }
    return {
      ok: true,
      modeId: body.modeId,
      unchanged: body.unchanged === true,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Ensure a Cursor ACP session for Chat (returns sessionId usable as agentChatId). */
export async function ensurePtyAcpSession(options: {
  taskId: string;
  cwd: string;
  sessionId?: string | null;
  chatId?: string | null;
  /** Create a fresh ACP session (e.g. /clear), ignoring any prior chat id. */
  forceNew?: boolean;
}): Promise<
  | {
      ok: true;
      sessionId: string;
      chatId: string;
      created: boolean;
      resumed: boolean;
    }
  | { ok: false; error: string }
> {
  const taskId = options.taskId.trim();
  const cwd = options.cwd.trim();
  if (!taskId || !cwd) {
    return { ok: false, error: "taskId and cwd are required." };
  }
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/acp/ensure`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        cwd,
        sessionId: options.forceNew
          ? null
          : options.sessionId?.trim() || options.chatId?.trim() || null,
        forceNew: Boolean(options.forceNew),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      sessionId?: string;
      chatId?: string;
      created?: boolean;
      resumed?: boolean;
      error?: string;
    } | null;
    const sessionId = body?.sessionId?.trim().toLowerCase();
    if (!response.ok || !sessionId) {
      return {
        ok: false,
        error: body?.error || `ACP ensure failed (${response.status}).`,
      };
    }
    return {
      ok: true,
      sessionId,
      chatId: (body?.chatId || sessionId).toLowerCase(),
      created: body?.created === true,
      resumed: body?.resumed === true,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Cancel the in-flight ACP turn for a task. */
export async function cancelPtyAcpTurn(
  taskId: string,
): Promise<{ ok: true; cancelled: boolean } | { ok: false; error: string }> {
  const id = taskId.trim();
  if (!id) return { ok: false, error: "taskId is required." };
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/acp/cancel`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId: id }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      cancelled?: boolean;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `ACP cancel failed (${response.status}).`,
      };
    }
    return { ok: true, cancelled: body?.cancelled === true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Answer a pending ACP permission / ask_question request from Chat UI. */
export async function respondPtyAcpUiRequest(options: {
  requestId: string;
  optionId?: string | null;
  preference?: "once" | "always" | "reject" | null;
  skipped?: boolean;
  answers?: { questionId: string; selectedOptionIds: string[] }[] | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const requestId = options.requestId.trim();
  if (!requestId) return { ok: false, error: "requestId is required." };
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/acp/respond`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId,
        optionId: options.optionId?.trim() || null,
        preference: options.preference ?? null,
        skipped: options.skipped === true,
        answers: options.answers ?? null,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      ok?: boolean;
    } | null;
    if (!response.ok || body?.ok === false) {
      return {
        ok: false,
        error: body?.error || `ACP respond failed (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

export async function killPtySession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = sessionId.trim();
  if (!id) return { ok: false, error: "Missing session id." };
  try {
    const response = await fetch(
      `${getPtyHttpOrigin()}/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: ptyAuthHeaders() },
    );
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Could not kill session (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Stop an ACP agent session for a task (T3-style). */
export async function stopPtyAgentTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = taskId.trim();
  if (!id) return { ok: false, error: "taskId is required." };
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/stop`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId: id }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Could not stop agent (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}

/** Snapshot `git rev-parse HEAD` for checkpoint revert. */
export async function fetchPtyGitHead(
  cwd?: string | null,
): Promise<string | null> {
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/git/head`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cwd: cwd?.trim() || null }),
    });
    const body = (await response.json().catch(() => null)) as {
      headSha?: string | null;
    } | null;
    if (!response.ok) return null;
    const sha = body?.headSha?.trim();
    return sha || null;
  } catch {
    return null;
  }
}

/** Restore workspace files to a prior HEAD and/or reverse-apply patches. */
export async function revertPtyGitCheckpoint(options: {
  cwd?: string | null;
  headSha?: string | null;
  paths?: string[] | null;
  patches?: string[] | null;
}): Promise<{ ok: true; restored: string[] } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${getPtyHttpOrigin()}/agent/git/revert`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cwd: options.cwd?.trim() || null,
        headSha: options.headSha?.trim() || null,
        paths: options.paths ?? [],
        patches: options.patches ?? [],
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      restored?: string[];
      errors?: string[];
      error?: string;
    } | null;
    if (!response.ok || body?.ok === false) {
      return {
        ok: false,
        error:
          body?.error ||
          body?.errors?.join("; ") ||
          `Git revert failed (${response.status}).`,
      };
    }
    return { ok: true, restored: body?.restored ?? [] };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm pty`.",
    };
  }
}
