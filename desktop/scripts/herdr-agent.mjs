/**
 * Thin wrapper around the Herdr CLI for BacksterOS agent panes.
 *
 * Herdr is an unmodified external binary (AGPL). We only invoke it — we do
 * not vendor or fork Herdr into BacksterOS.
 *
 * Durable session = one named Herdr agent per task (`backsteros-<taskId>`),
 * placed in a Herdr **workspace** labeled with the project name and a **tab**
 * labeled with the task display id (e.g. LD-2) — not as splits in General.
 * UI viewers attach with `herdr agent attach <name>` (native shared TTY).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HERDR_BIN = process.env.HERDR_BIN?.trim() || "herdr";
const EXEC_TIMEOUT_MS = 20_000;

/** Herdr workspace used for laptop setup / system ops (iOS Settings → Server). */
export const HERDR_SYSTEM_WORKSPACE_LABEL = "backster-system";

/**
 * @param {string} taskId
 * @returns {string}
 */
export function herdrAgentNameForTask(taskId) {
  const safe = String(taskId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `backsteros-${safe || "task"}`;
}

/**
 * @param {string} taskId
 * @returns {string}
 */
export function herdrSessionIdForTask(taskId) {
  return `herdr-${String(taskId).trim()}`;
}

/**
 * Sanitize a Herdr workspace / tab label (keep readable punctuation).
 * @param {string} value
 * @param {string} fallback
 * @returns {string}
 */
export function herdrSanitizeLabel(value, fallback = "BacksterOS") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 64);
  return cleaned || fallback;
}

/**
 * @param {string[]} args
 * @param {{ allowEmpty?: boolean }} [options]
 * @returns {Promise<unknown>}
 */
async function herdrJson(args, options = {}) {
  const { stdout, stderr } = await execFileAsync(HERDR_BIN, args, {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  });
  const text = String(stdout || "").trim() || String(stderr || "").trim();
  if (!text) {
    // Mutation commands (send-keys, send, close) often exit 0 with no body.
    if (options.allowEmpty) return {};
    throw new Error(`herdr ${args.join(" ")} returned empty output`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `herdr ${args.join(" ")} returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
}

/** Raw stdout/stderr text (for `pane read`, which is not always JSON). */
async function herdrText(args) {
  const { stdout, stderr } = await execFileAsync(HERDR_BIN, args, {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  });
  return String(stdout || "") || String(stderr || "");
}

/**
 * @param {unknown} parsed
 * @returns {Record<string, unknown> | null}
 */
function unwrapAgent(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const root = /** @type {Record<string, unknown>} */ (parsed);
  if (root.error) return null;
  const result =
    root.result && typeof root.result === "object"
      ? /** @type {Record<string, unknown>} */ (root.result)
      : root;
  const agent =
    result.agent && typeof result.agent === "object"
      ? /** @type {Record<string, unknown>} */ (result.agent)
      : result;
  if (!agent || typeof agent !== "object") return null;
  if (typeof agent.pane_id !== "string" && typeof agent.terminal_id !== "string") {
    return null;
  }
  return agent;
}

/**
 * @param {unknown} parsed
 * @returns {Record<string, unknown> | null}
 */
function unwrapResult(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const root = /** @type {Record<string, unknown>} */ (parsed);
  if (root.error) return null;
  if (root.result && typeof root.result === "object") {
    return /** @type {Record<string, unknown>} */ (root.result);
  }
  return root;
}

/**
 * @param {string} name
 * @returns {Promise<{
 *   name: string | null,
 *   paneId: string | null,
 *   terminalId: string | null,
 *   status: string | null,
 *   cwd: string | null,
 *   workspaceId: string | null,
 *   tabId: string | null,
 * } | null>}
 */
export async function herdrAgentGet(name) {
  try {
    const parsed = await herdrJson(["agent", "get", name]);
    const agent = unwrapAgent(parsed);
    if (!agent) return null;
    return {
      name: typeof agent.name === "string" ? agent.name : name,
      paneId: typeof agent.pane_id === "string" ? agent.pane_id : null,
      terminalId:
        typeof agent.terminal_id === "string" ? agent.terminal_id : null,
      status:
        typeof agent.agent_status === "string" ? agent.agent_status : null,
      cwd: typeof agent.cwd === "string" ? agent.cwd : null,
      workspaceId:
        typeof agent.workspace_id === "string" ? agent.workspace_id : null,
      tabId: typeof agent.tab_id === "string" ? agent.tab_id : null,
    };
  } catch {
    return null;
  }
}

/**
 * Find or create a Herdr workspace labeled with the project name.
 * @param {{ label: string, cwd: string }} options
 * @returns {Promise<{
 *   workspaceId: string,
 *   created: boolean,
 *   defaultTabId: string | null,
 *   defaultPaneId: string | null,
 * }>}
 */
export async function herdrFindOrCreateWorkspace(options) {
  const label = herdrSanitizeLabel(options.label, "BacksterOS");
  const cwd = options.cwd.trim();
  const listed = unwrapResult(await herdrJson(["workspace", "list"]));
  const workspaces = Array.isArray(listed?.workspaces) ? listed.workspaces : [];
  const needle = label.toLowerCase();
  for (const row of workspaces) {
    if (!row || typeof row !== "object") continue;
    const ws = /** @type {Record<string, unknown>} */ (row);
    if (
      typeof ws.label === "string" &&
      ws.label.trim().toLowerCase() === needle &&
      typeof ws.workspace_id === "string"
    ) {
      return {
        workspaceId: ws.workspace_id,
        created: false,
        defaultTabId: null,
        defaultPaneId: null,
      };
    }
  }

  const args = ["workspace", "create", "--label", label, "--no-focus"];
  if (cwd) args.push("--cwd", cwd);
  const created = unwrapResult(await herdrJson(args));
  const workspace =
    created?.workspace && typeof created.workspace === "object"
      ? /** @type {Record<string, unknown>} */ (created.workspace)
      : null;
  const tab =
    created?.tab && typeof created.tab === "object"
      ? /** @type {Record<string, unknown>} */ (created.tab)
      : null;
  const root =
    created?.root_pane && typeof created.root_pane === "object"
      ? /** @type {Record<string, unknown>} */ (created.root_pane)
      : null;
  const workspaceId =
    typeof workspace?.workspace_id === "string" ? workspace.workspace_id : null;
  if (!workspaceId) {
    throw new Error(`Failed to create Herdr workspace "${label}"`);
  }
  return {
    workspaceId,
    created: true,
    defaultTabId: typeof tab?.tab_id === "string" ? tab.tab_id : null,
    defaultPaneId: typeof root?.pane_id === "string" ? root.pane_id : null,
  };
}

/**
 * Find or create a tab labeled with the task display id inside a workspace.
 * When the workspace was just created, renames its default tab instead of
 * leaving an empty "1" tab behind.
 * @param {{
 *   workspaceId: string,
 *   label: string,
 *   cwd: string,
 *   reuseDefaultTabId?: string | null,
 *   reuseDefaultPaneId?: string | null,
 * }} options
 * @returns {Promise<{ tabId: string, shellPaneId: string | null, created: boolean }>}
 */
export async function herdrFindOrCreateTab(options) {
  const label = herdrSanitizeLabel(options.label, "task");
  const cwd = options.cwd.trim();
  const workspaceId = options.workspaceId.trim();
  const reuseTabId = options.reuseDefaultTabId?.trim() || null;
  const reusePaneId = options.reuseDefaultPaneId?.trim() || null;

  if (reuseTabId) {
    try {
      await herdrJson(["tab", "rename", reuseTabId, label]);
    } catch (error) {
      console.warn(
        `[pty] herdr tab rename failed (${reuseTabId} → ${label}):`,
        error instanceof Error ? error.message : error,
      );
    }
    return { tabId: reuseTabId, shellPaneId: reusePaneId, created: true };
  }

  const listed = unwrapResult(
    await herdrJson(["tab", "list", "--workspace", workspaceId]),
  );
  const tabs = Array.isArray(listed?.tabs) ? listed.tabs : [];
  const needle = label.toLowerCase();
  for (const row of tabs) {
    if (!row || typeof row !== "object") continue;
    const tab = /** @type {Record<string, unknown>} */ (row);
    if (
      typeof tab.label === "string" &&
      tab.label.trim().toLowerCase() === needle &&
      typeof tab.tab_id === "string"
    ) {
      return { tabId: tab.tab_id, shellPaneId: null, created: false };
    }
  }

  const args = [
    "tab",
    "create",
    "--workspace",
    workspaceId,
    "--label",
    label,
    "--no-focus",
  ];
  if (cwd) args.push("--cwd", cwd);
  const created = unwrapResult(await herdrJson(args));
  const tab =
    created?.tab && typeof created.tab === "object"
      ? /** @type {Record<string, unknown>} */ (created.tab)
      : null;
  const root =
    created?.root_pane && typeof created.root_pane === "object"
      ? /** @type {Record<string, unknown>} */ (created.root_pane)
      : null;
  const tabId = typeof tab?.tab_id === "string" ? tab.tab_id : null;
  if (!tabId) {
    throw new Error(
      `Failed to create Herdr tab "${label}" in workspace ${workspaceId}`,
    );
  }
  return {
    tabId,
    shellPaneId: typeof root?.pane_id === "string" ? root.pane_id : null,
    created: true,
  };
}

/**
 * Focus a Herdr workspace (makes it the active space in the TUI).
 * @param {string} workspaceId
 */
export async function herdrFocusWorkspace(workspaceId) {
  const id = workspaceId?.trim();
  if (!id) throw new Error("workspaceId is required");
  await herdrJson(["workspace", "focus", id]);
}

/**
 * Find or create the `backster-system` workspace and focus it.
 * @param {string} [cwd]
 * @returns {Promise<{
 *   workspaceId: string,
 *   created: boolean,
 *   defaultTabId: string | null,
 *   defaultPaneId: string | null,
 * }>}
 */
export async function herdrEnsureSystemWorkspace(cwd = "") {
  const workspace = await herdrFindOrCreateWorkspace({
    label: HERDR_SYSTEM_WORKSPACE_LABEL,
    cwd: cwd.trim(),
  });
  await herdrFocusWorkspace(workspace.workspaceId);
  return workspace;
}

/**
 * Ensure a project workspace + task tab for placing a new agent pane.
 * @param {{
 *   workspaceLabel: string,
 *   tabLabel: string,
 *   cwd: string,
 * }} options
 * @returns {Promise<{
 *   workspaceId: string,
 *   tabId: string,
 *   shellPaneId: string | null,
 * }>}
 */
export async function herdrEnsureAgentPlacement(options) {
  const workspaceLabel = herdrSanitizeLabel(
    options.workspaceLabel,
    "BacksterOS",
  );
  const tabLabel = herdrSanitizeLabel(options.tabLabel, "task");
  const cwd = options.cwd.trim();

  const workspace = await herdrFindOrCreateWorkspace({
    label: workspaceLabel,
    cwd,
  });
  const tab = await herdrFindOrCreateTab({
    workspaceId: workspace.workspaceId,
    label: tabLabel,
    cwd,
    reuseDefaultTabId: workspace.created ? workspace.defaultTabId : null,
    reuseDefaultPaneId: workspace.created ? workspace.defaultPaneId : null,
  });

  return {
    workspaceId: workspace.workspaceId,
    tabId: tab.tabId,
    shellPaneId: tab.shellPaneId,
  };
}

/**
 * @param {{
 *   name: string,
 *   cwd: string,
 *   argv: string[],
 *   env?: Record<string, string>,
 *   workspaceId?: string | null,
 *   tabId?: string | null,
 * }} options
 */
export async function herdrAgentStart(options) {
  const args = [
    "agent",
    "start",
    options.name,
    "--cwd",
    options.cwd,
    "--no-focus",
  ];
  if (options.workspaceId?.trim()) {
    args.push("--workspace", options.workspaceId.trim());
  }
  if (options.tabId?.trim()) {
    args.push("--tab", options.tabId.trim());
  }
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      if (!key.trim()) continue;
      args.push("--env", `${key}=${value}`);
    }
  }
  args.push("--", ...options.argv);

  const parsed = await herdrJson(args);
  const agent = unwrapAgent(parsed);
  if (!agent) {
    const err =
      parsed && typeof parsed === "object" && "error" in parsed
        ? /** @type {{ error?: { message?: string } }} */ (parsed).error
            ?.message
        : null;
    throw new Error(err || `Failed to start Herdr agent ${options.name}`);
  }
  return {
    name: typeof agent.name === "string" ? agent.name : options.name,
    paneId: typeof agent.pane_id === "string" ? agent.pane_id : null,
    terminalId:
      typeof agent.terminal_id === "string" ? agent.terminal_id : null,
    status: typeof agent.agent_status === "string" ? agent.agent_status : null,
    cwd: typeof agent.cwd === "string" ? agent.cwd : options.cwd,
    workspaceId:
      typeof agent.workspace_id === "string" ? agent.workspace_id : null,
    tabId: typeof agent.tab_id === "string" ? agent.tab_id : null,
  };
}

/**
 * @param {string} paneId
 */
export async function herdrPaneClose(paneId) {
  const id = paneId?.trim();
  if (!id) return;
  try {
    await herdrJson(["pane", "close", id]);
  } catch (error) {
    console.warn(
      `[pty] herdr pane close failed (${id}):`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Write literal text into an agent composer (does NOT press Enter).
 * Prefer {@link herdrSubmitAgentPrompt} for chat follow-ups.
 * @param {string} target Agent name / terminal id / pane id
 * @param {string} text
 */
export async function herdrAgentSend(target, text) {
  const id = target?.trim();
  if (!id) throw new Error("Herdr agent target is required");
  const value = String(text ?? "");
  if (!value) throw new Error("Herdr agent send text is required");
  const parsed = await herdrJson(["agent", "send", id, value], {
    allowEmpty: true,
  });
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const message =
      /** @type {{ error?: { message?: string } }} */ (parsed).error?.message;
    throw new Error(message || `herdr agent send failed for ${id}`);
  }
  return true;
}

/**
 * Send named keys into a Herdr pane (`enter`, `esc`, `ctrl+u`, …).
 * @param {string} paneId
 * @param {string[]} keys
 */
export async function herdrPaneSendKeys(paneId, keys) {
  const id = paneId?.trim();
  if (!id) throw new Error("Herdr pane id is required");
  const list = (Array.isArray(keys) ? keys : [])
    .map((key) => String(key ?? "").trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error("At least one key is required");
  const parsed = await herdrJson(["pane", "send-keys", id, ...list], {
    allowEmpty: true,
  });
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const message =
      /** @type {{ error?: { message?: string } }} */ (parsed).error?.message;
    throw new Error(message || `herdr pane send-keys failed for ${id}`);
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a Cursor TUI / ACP mode id. Unknown → agent (Build).
 * @param {string | null | undefined} value
 * @returns {"agent" | "ask" | "plan" | "debug"}
 */
export function normalizeHerdrModeId(value) {
  const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (trimmed === "ask") return "ask";
  if (trimmed === "plan") return "plan";
  if (trimmed === "debug") return "debug";
  return "agent";
}

/**
 * Detect live Cursor TUI mode from a Herdr pane footer.
 * Looks for `Ask|Plan|Debug (shift+tab to cycle)`; otherwise Agent/Build.
 *
 * @param {string} paneId
 * @returns {Promise<"agent" | "ask" | "plan" | "debug" | null>}
 */
export async function herdrDetectAgentMode(paneId) {
  const id = paneId?.trim();
  if (!id) return null;
  try {
    const text = await herdrText([
      "pane",
      "read",
      id,
      "--source",
      "visible",
      "--lines",
      "16",
      "--format",
      "text",
    ]);
    // Prefer the stable footer chip over transient "X mode enabled/disabled".
    if (/Debug\s*\(shift\+tab to cycle\)/i.test(text)) return "debug";
    if (/Plan\s*\(shift\+tab to cycle\)/i.test(text)) return "plan";
    if (/Ask\s*\(shift\+tab to cycle\)/i.test(text)) return "ask";
    // Explicit enabled lines (some Cursor builds flash these without the chip).
    if (/Debug mode enabled/i.test(text) && !/Debug mode disabled/i.test(text)) {
      return "debug";
    }
    if (/Ask mode enabled/i.test(text) && !/Ask mode disabled/i.test(text)) {
      return "ask";
    }
    return "agent";
  } catch (error) {
    console.warn(
      `[pty] herdr mode detect failed (${id}):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Cursor CLI slash sequence to move between modes in a live TUI.
 *
 * Important facts (verified against Cursor agent TUI):
 * - `/ask` and `/debug` are toggles (re-send exits back to Agent)
 * - `/plan` enters Plan but does not toggle off
 * - There is NO `/agent` slash — typing it becomes composer autocomplete text
 * - Plan → Agent: `/ask` then `/ask` (Plan→Ask→Agent)
 *
 * @param {string | null | undefined} fromModeId
 * @param {string | null | undefined} toModeId
 * @returns {string[]}
 */
export function cursorModeSlashSequence(fromModeId, toModeId) {
  const from = normalizeHerdrModeId(fromModeId);
  const to = normalizeHerdrModeId(toModeId);
  if (from === to) return [];
  if (to === "ask") return ["/ask"];
  if (to === "plan") return ["/plan"];
  if (to === "debug") return ["/debug"];
  // to === "agent"
  if (from === "ask") return ["/ask"];
  if (from === "debug") return ["/debug"];
  if (from === "plan") return ["/ask", "/ask"];
  return [];
}

/**
 * Switch Cursor Agent mode in a live Herdr pane.
 *
 * Sends each mode slash alone, then Enter. Must NOT be bundled with a user
 * prompt — concatenation leaked `/ask` into chat messages.
 *
 * Prefers detecting the live TUI mode from the pane footer so Build/Debug
 * toggles still work when cached `lastModeId` drifted.
 *
 * @param {{
 *   name: string,
 *   paneId: string,
 *   fromModeId?: string | null,
 *   toModeId?: string | null,
 *   modeId?: string | null,
 *   modeSlash?: string | null,
 * }} options
 * @returns {Promise<{ applied: boolean, fromModeId: string, toModeId: string }>}
 */
export async function herdrSwitchAgentMode(options) {
  const name = options.name?.trim();
  let paneId = options.paneId?.trim();
  if (!name) throw new Error("Herdr agent name is required");
  if (!paneId) throw new Error("Herdr pane id is required");

  const toModeId = normalizeHerdrModeId(
    options.toModeId ?? options.modeId ?? null,
  );

  // Prefer live footer over cached lastModeId — Build/Debug breaks when the
  // cache says "agent" while the TUI is still in plan/ask/debug.
  const detected = await herdrDetectAgentMode(paneId);
  let fromModeId = detected ?? normalizeHerdrModeId(options.fromModeId);

  /** @type {string[]} */
  let slashes = [];
  const rawSlash = options.modeSlash?.trim();
  if (rawSlash) {
    if (rawSlash === "/agent" || rawSlash === "/build") {
      throw new Error(
        "Cursor has no /agent slash — use fromModeId/toModeId (Plan→Agent is /ask then /ask)",
      );
    }
    if (!rawSlash.startsWith("/")) {
      throw new Error("modeSlash must be a /command");
    }
    slashes = [rawSlash];
  } else {
    slashes = cursorModeSlashSequence(fromModeId, toModeId);
  }

  if (slashes.length === 0) {
    return { applied: false, fromModeId, toModeId };
  }

  /**
   * @param {string} modeSlash
   */
  async function submitModeSlash(modeSlash) {
    try {
      await herdrPaneSendKeys(paneId, ["ctrl+u", "ctrl+u"]);
      await sleep(80);
    } catch (error) {
      console.warn(
        `[pty] herdr clear before mode switch failed (${paneId}):`,
        error instanceof Error ? error.message : error,
      );
    }

    await herdrAgentSend(name, modeSlash);
    await sleep(100);
    await herdrPaneSendKeys(paneId, ["enter"]);
    // Ask/Plan/Debug need a beat for the footer mode chip to settle.
    await sleep(350);
  }

  for (const modeSlash of slashes) {
    await submitModeSlash(modeSlash);
  }

  // Plan→Agent is two toggles; retry once if the footer still isn't Agent.
  // Also recover when a single toggle didn't land (focus/composer races).
  let landed = await herdrDetectAgentMode(paneId);
  if (landed && landed !== toModeId) {
    const retry = cursorModeSlashSequence(landed, toModeId);
    if (retry.length > 0) {
      console.log(
        `[pty] herdr mode retry ${landed}->${toModeId} via ${retry.join(" ")}`,
      );
      for (const modeSlash of retry) {
        await submitModeSlash(modeSlash);
      }
      landed = await herdrDetectAgentMode(paneId);
    }
  }

  try {
    await herdrPaneSendKeys(paneId, ["ctrl+u", "ctrl+u"]);
  } catch {
    /* ignore */
  }

  if (landed && landed !== toModeId) {
    throw new Error(
      `Herdr mode switch incomplete: wanted ${toModeId}, pane still ${landed}`,
    );
  }

  return {
    applied: true,
    fromModeId,
    toModeId: landed ?? toModeId,
  };
}

/**
 * Submit a follow-up prompt into a live Cursor Agent (Herdr pane).
 *
 * Uses `herdr agent send` (literal text) then a single `pane send-keys enter`.
 * A second Enter is intentionally NOT sent — Cursor queues it as a follow-up
 * (or re-submits leftover composer text).
 *
 * Never send mode slash commands (`/ask`, `/plan`, …) here — Cursor may treat
 * them as ordinary composer text when bundled with a prompt. Use
 * {@link herdrSwitchAgentMode} for mode changes (and never send `/agent`).
 *
 * @param {{
 *   name: string,
 *   paneId: string,
 *   text: string,
 *   clear?: boolean,
 * }} options
 */
export async function herdrSubmitAgentPrompt(options) {
  const name = options.name?.trim();
  const paneId = options.paneId?.trim();
  const text = options.text?.trim();
  if (!name) throw new Error("Herdr agent name is required");
  if (!paneId) throw new Error("Herdr pane id is required");
  if (!text) throw new Error("Prompt text is required");

  if (options.clear !== false) {
    try {
      await herdrPaneSendKeys(paneId, ["ctrl+u", "ctrl+u"]);
      await sleep(80);
    } catch (error) {
      console.warn(
        `[pty] herdr clear composer failed (${paneId}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await herdrAgentSend(name, text);
  // Separate Enter — required so Cursor processes submit after paste.
  await sleep(100);
  await herdrPaneSendKeys(paneId, ["enter"]);
  // Sweep any leftover composer text so it cannot become a Cursor follow-up.
  await sleep(120);
  try {
    await herdrPaneSendKeys(paneId, ["ctrl+u", "ctrl+u"]);
  } catch (error) {
    console.warn(
      `[pty] herdr post-submit clear failed (${paneId}):`,
      error instanceof Error ? error.message : error,
    );
  }
  return true;
}

/**
 * Map Herdr agent_status → BacksterOS activity.
 * @param {string | null | undefined} status
 * @returns {"working" | "attention" | "idle" | null}
 */
export function mapHerdrStatusToActivity(status) {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (value === "working") return "working";
  // Blocked = waiting on TUI permission / question — surface as attention.
  if (value === "blocked") return "attention";
  if (value === "idle" || value === "done" || value === "unknown") return "idle";
  return null;
}

/**
 * @returns {Promise<boolean>}
 */
export async function herdrIsAvailable() {
  try {
    await execFileAsync(HERDR_BIN, ["--version"], {
      timeout: 5_000,
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

export { HERDR_BIN };
