/**
 * Project MCP helpers for BacksterOS ACP sessions.
 *
 * Cursor ACP can load MCP servers from session/new|load `mcpServers`, but
 * approval is gated by `~/.cursor/projects/<slug>/mcp-approvals.json` (the
 * interactive `--approve-mcps` flag is not wired to ACP).
 *
 * We keep global `~/.cursor/mcp.json` isolated at ACP spawn (tool-cap), then
 * inject only the project vault's `.cursor/mcp.json` into each session.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Cursor project slug for `~/.cursor/projects/<slug>/`.
 * @param {string} cwd
 */
export function cursorProjectSlug(cwd) {
  return path
    .resolve(cwd.trim())
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {string} cwd
 */
export function cursorProjectDir(cwd) {
  return path.join(os.homedir(), ".cursor", "projects", cursorProjectSlug(cwd));
}

/**
 * @param {string} name
 * @param {unknown} server
 * @param {string} cwd
 */
export function mcpApprovalKey(name, server, cwd) {
  const hashInput = { path: path.resolve(cwd.trim()), server };
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .substring(0, 16);
  return `${name}-${hash}`;
}

/**
 * @param {string} value
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} ctx
 */
export function interpolateMcpString(value, ctx) {
  const env = ctx.env ?? process.env;
  const cwd = path.resolve(ctx.cwd);
  return value
    .replaceAll("${userHome}", os.homedir())
    .replaceAll("${workspaceFolder}", cwd)
    .replaceAll("${workspaceFolderBasename}", path.basename(cwd))
    .replaceAll("${pathSeparator}", path.sep)
    .replaceAll("${/}", path.sep)
    .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
      const raw = env[name];
      return typeof raw === "string" ? raw : "";
    });
}

/**
 * @param {unknown} value
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} ctx
 * @returns {unknown}
 */
function interpolateDeep(value, ctx) {
  if (typeof value === "string") return interpolateMcpString(value, ctx);
  if (Array.isArray(value)) return value.map((item) => interpolateDeep(item, ctx));
  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = interpolateDeep(item, ctx);
    }
    return out;
  }
  return value;
}

/**
 * @param {string} cwd
 * @returns {{ path: string, mcpServers: Record<string, unknown> } | null}
 */
export function readProjectMcpJson(cwd) {
  const abs = path.resolve(cwd.trim());
  const mcpPath = path.join(abs, ".cursor", "mcp.json");
  if (!fs.existsSync(mcpPath)) return null;
  try {
    const raw = fs.readFileSync(mcpPath, "utf8");
    const parsed = JSON.parse(raw);
    const servers =
      parsed &&
      typeof parsed === "object" &&
      parsed.mcpServers &&
      typeof parsed.mcpServers === "object" &&
      !Array.isArray(parsed.mcpServers)
        ? /** @type {Record<string, unknown>} */ (parsed.mcpServers)
        : {};
    return { path: mcpPath, mcpServers: servers };
  } catch (error) {
    console.warn(
      "[acp-mcp] failed to read",
      mcpPath,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * @param {Record<string, string> | undefined} env
 * @returns {{ name: string, value: string }[]}
 */
function envObjectToAcp(env) {
  if (!env || typeof env !== "object") return [];
  return Object.entries(env).map(([name, value]) => ({
    name,
    value: String(value ?? ""),
  }));
}

/**
 * @param {Record<string, string> | undefined} headers
 * @returns {{ name: string, value: string }[]}
 */
function headersObjectToAcp(headers) {
  if (!headers || typeof headers !== "object") return [];
  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: String(value ?? ""),
  }));
}

/**
 * Convert a Cursor mcp.json server entry to an ACP `mcpServers[]` item.
 * @param {string} name
 * @param {unknown} server
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} ctx
 * @returns {Record<string, unknown> | null}
 */
export function mcpJsonServerToAcp(name, server, ctx) {
  if (!server || typeof server !== "object" || Array.isArray(server)) return null;
  const interpolated = /** @type {Record<string, unknown>} */ (
    interpolateDeep(server, ctx)
  );

  if (typeof interpolated.command === "string" && interpolated.command.trim()) {
    const args = Array.isArray(interpolated.args)
      ? interpolated.args.map((arg) => String(arg))
      : [];
    const env =
      interpolated.env &&
      typeof interpolated.env === "object" &&
      !Array.isArray(interpolated.env)
        ? envObjectToAcp(
            /** @type {Record<string, string>} */ (interpolated.env),
          )
        : [];
    /** @type {Record<string, unknown>} */
    const out = {
      name,
      command: String(interpolated.command),
      args,
      env,
    };
    if (typeof interpolated.envFile === "string" && interpolated.envFile.trim()) {
      out.envFile = String(interpolated.envFile);
    }
    return out;
  }

  if (typeof interpolated.url === "string" && interpolated.url.trim()) {
    const typeRaw =
      typeof interpolated.type === "string"
        ? interpolated.type.trim().toLowerCase()
        : "http";
    const type = typeRaw === "sse" ? "sse" : "http";
    const headers =
      interpolated.headers &&
      typeof interpolated.headers === "object" &&
      !Array.isArray(interpolated.headers)
        ? headersObjectToAcp(
            /** @type {Record<string, string>} */ (interpolated.headers),
          )
        : [];
    return {
      type,
      name,
      url: String(interpolated.url),
      headers,
    };
  }

  return null;
}

/**
 * @param {Record<string, unknown>} mcpServers
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} ctx
 * @returns {Record<string, unknown>[]}
 */
export function mcpJsonToAcpServers(mcpServers, ctx) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const [name, server] of Object.entries(mcpServers)) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const acp = mcpJsonServerToAcp(trimmed, server, ctx);
    if (acp) out.push(acp);
  }
  return out;
}

/**
 * Build approval key candidates for a server (mcp.json + ACP shapes).
 * Cursor hashes whatever object it uses at load time; covering both avoids
 * silent "server not approved" when ACP reshapes the config.
 * @param {string} name
 * @param {unknown} jsonServer
 * @param {Record<string, unknown> | null} acpServer
 * @param {string} cwd
 * @returns {string[]}
 */
export function mcpApprovalKeyCandidates(name, jsonServer, acpServer, cwd) {
  /** @type {unknown[]} */
  const shapes = [];
  if (jsonServer && typeof jsonServer === "object") {
    shapes.push(jsonServer);
    const interpolated = interpolateDeep(jsonServer, { cwd });
    shapes.push(interpolated);
  }
  if (acpServer) {
    shapes.push(acpServer);
    // HTTP forum repro hashed `{ url }` only.
    if (typeof acpServer.url === "string") {
      shapes.push({ url: acpServer.url });
    }
    // Stdio without name / envFile extras.
    if (typeof acpServer.command === "string") {
      shapes.push({
        command: acpServer.command,
        args: acpServer.args ?? [],
        env: acpServer.env ?? [],
      });
      shapes.push({
        command: acpServer.command,
        args: acpServer.args ?? [],
      });
    }
  }

  const keys = new Set();
  for (const shape of shapes) {
    keys.add(mcpApprovalKey(name, shape, cwd));
  }
  return [...keys];
}

/**
 * Ensure Cursor trusts this workspace path (used by CLI MCP loading).
 * @param {string} cwd
 */
export function ensureWorkspaceTrusted(cwd) {
  const abs = path.resolve(cwd.trim());
  const projectDir = cursorProjectDir(abs);
  fs.mkdirSync(projectDir, { recursive: true });
  const trustPath = path.join(projectDir, ".workspace-trusted");
  if (fs.existsSync(trustPath)) return { path: trustPath, wrote: false };
  fs.writeFileSync(
    trustPath,
    `${JSON.stringify(
      { trustedAt: new Date().toISOString(), workspacePath: abs },
      null,
      2,
    )}\n`,
  );
  return { path: trustPath, wrote: true };
}

/**
 * Merge approval keys into `mcp-approvals.json` for this workspace.
 * @param {string} cwd
 * @param {string[]} keys
 */
export function ensureMcpApprovalsFile(cwd, keys) {
  const abs = path.resolve(cwd.trim());
  const projectDir = cursorProjectDir(abs);
  fs.mkdirSync(projectDir, { recursive: true });
  const approvalsPath = path.join(projectDir, "mcp-approvals.json");

  /** @type {string[]} */
  let existing = [];
  if (fs.existsSync(approvalsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
      if (Array.isArray(parsed)) {
        existing = parsed.filter((item) => typeof item === "string");
      }
    } catch {
      existing = [];
    }
  }

  const merged = [...new Set([...existing, ...keys])];
  const changed =
    merged.length !== existing.length ||
    merged.some((key, index) => key !== existing[index]);
  if (changed) {
    fs.writeFileSync(approvalsPath, `${JSON.stringify(merged, null, 2)}\n`);
  }
  return { path: approvalsPath, keys: merged, wrote: changed };
}

/**
 * Load project MCP, write ACP approvals, return session `mcpServers` payload.
 * @param {string} cwd
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export function prepareSessionMcp(cwd, options = {}) {
  const abs = path.resolve(cwd.trim());
  const ctx = { cwd: abs, env: options.env ?? process.env };
  const file = readProjectMcpJson(abs);
  if (!file || Object.keys(file.mcpServers).length === 0) {
    return {
      cwd: abs,
      mcpServers: /** @type {Record<string, unknown>[]} */ ([]),
      serverNames: /** @type {string[]} */ ([]),
      sourcePath: file?.path ?? null,
      approvalsPath: null,
      trustedPath: null,
    };
  }

  const acpServers = mcpJsonToAcpServers(file.mcpServers, ctx);
  /** @type {string[]} */
  const keys = [];
  /** @type {string[]} */
  const serverNames = [];

  for (const [name, jsonServer] of Object.entries(file.mcpServers)) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    serverNames.push(trimmed);
    const acp = acpServers.find(
      (server) => String(server.name ?? "") === trimmed,
    ) ?? null;
    keys.push(
      ...mcpApprovalKeyCandidates(trimmed, jsonServer, acp, abs),
    );
  }

  const trusted = ensureWorkspaceTrusted(abs);
  const approvals = ensureMcpApprovalsFile(abs, keys);

  console.log(
    `[acp-mcp] project MCP ready cwd=${abs} servers=${serverNames.join(",") || "-"} approvals=${approvals.keys.length}`,
  );

  return {
    cwd: abs,
    mcpServers: acpServers,
    serverNames,
    sourcePath: file.path,
    approvalsPath: approvals.path,
    trustedPath: trusted.path,
  };
}

/**
 * True when an ACP permission request looks like a Cursor file-read tool
 * that BacksterOS can auto-allow. MCP / external tools must NOT match.
 * @param {unknown} params
 */
export function permissionLooksLikeFileRead(params) {
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
  const hay = `${kind} ${title}`.toLowerCase();

  // MCP / dynamic tools always go through the Chat approval UI.
  if (
    /\bmcp\b|dynamic.?tool|external.?tool|moneybird_|1password|plugin-|project-0-/i.test(
      hay,
    )
  ) {
    return false;
  }

  // Prefer explicit tool kinds from Cursor ACP.
  if (/\b(read|search|grep|glob)\b/.test(kind)) return true;
  if (/\b(edit|write|execute|exec|terminal|shell|delete|mcp)\b/.test(kind)) {
    return false;
  }

  // Title fallback: only clear built-in file tools (avoid matching moneybird_list).
  return /^(read(_?file)?|search|grep|glob|list_dir|list.?files|fetch_?mcp_resource)\b/i.test(
    title.trim(),
  );
}

/**
 * Built-in file mutations safe to auto-accept under Auto-accept edits.
 * Never true for MCP / execute / fetch / other.
 * @param {unknown} params
 * @returns {boolean}
 */
export function permissionLooksLikeFileMutation(params) {
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
  const hay = `${kind} ${title}`.toLowerCase();

  // MCP / dynamic / external tools always prompt.
  if (
    /\bmcp\b|dynamic.?tool|external.?tool|moneybird_|1password|plugin-|project-0-/i.test(
      hay,
    )
  ) {
    return false;
  }

  // Commands / network / ambiguous never auto-accept as "edits".
  if (
    /\b(execute|exec|terminal|shell|fetch|think|switch_mode|other)\b/.test(kind)
  ) {
    return false;
  }

  if (/\b(edit|write|delete|move)\b/.test(kind)) return true;

  return /^(edit|write|delete|move|apply.?patch|search.?replace|create.?file|delete.?file)\b/i.test(
    title.trim(),
  );
}
