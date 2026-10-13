/**
 * Merge BacksterOS Cursor Agent hooks into ~/.cursor/hooks.json without
 * removing other tools' hooks (Orca, Superset, etc.).
 *
 * Mirrors Orca's approach: subscribe to turn-boundary events so the console
 * can clear "working" instantly on `stop` instead of waiting on a quiet timer.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_NAME = "cursor-agent-hook.sh";
const SCRIPT_PATH = path.join(__dirname, SCRIPT_NAME);

/** Minimum set for spinner + turn detection + Chat tool chrome. */
const CURSOR_EVENTS = [
  "beforeSubmitPrompt",
  "stop",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  "afterAgentResponse",
  "afterAgentThought",
];

function isOurCommand(command) {
  if (typeof command !== "string") return false;
  return (
    command.includes(SCRIPT_NAME) ||
    command.includes("backsteros-development/scripts/cursor-agent-hook") ||
    command.includes("desktop/scripts/cursor-agent-hook")
  );
}

function buildCommand() {
  const quoted = SCRIPT_PATH.replace(/'/g, `'\\''`);
  return `if [ -f '${quoted}' ] && [ -x '${quoted}' ]; then /bin/sh '${quoted}'; else cat >/dev/null 2>&1 || :; fi`;
}

function readHooksJson(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      return { version: 1, hooks: {} };
    }
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, hooks: {} };
    }
    if (!parsed.hooks || typeof parsed.hooks !== "object") {
      parsed.hooks = {};
    }
    return parsed;
  } catch {
    return null;
  }
}

export function ensureCursorAgentHooks() {
  const configPath = path.join(os.homedir(), ".cursor", "hooks.json");
  try {
    fs.chmodSync(SCRIPT_PATH, 0o755);
  } catch {
    /* ignore */
  }

  const config = readHooksJson(configPath);
  if (!config) {
    console.warn(
      "[pty] could not parse ~/.cursor/hooks.json — skip BacksterOS hook install",
    );
    return false;
  }

  const command = buildCommand();
  const nextHooks = { ...config.hooks };
  let changed = false;

  // Always rewrite our managed entries so the script path stays current.
  for (const eventName of CURSOR_EVENTS) {
    const current = Array.isArray(nextHooks[eventName])
      ? nextHooks[eventName]
      : [];
    const withoutOurs = current.filter((entry) => !isOurCommand(entry?.command));
    nextHooks[eventName] = [...withoutOurs, { command, timeout: 15 }];
    changed = true;
  }

  if (!changed) return true;

  const nextConfig = { ...config, version: config.version ?? 1, hooks: nextHooks };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  console.log(`[pty] ensured BacksterOS Cursor hooks in ${configPath}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureCursorAgentHooks();
}
