export type OpsLogLevel = "info" | "warn" | "error";

export type OpsLogEntry = {
  id: string;
  at: string;
  level: OpsLogLevel;
  message: string;
  detail?: string;
};

const MAX_ENTRIES = 500;
const entries: OpsLogEntry[] = [];
let seq = 0;
let installed = false;

function push(level: OpsLogLevel, message: string, detail?: string) {
  seq += 1;
  entries.push({
    id: `log_${seq}`,
    at: new Date().toISOString(),
    level,
    message: message.slice(0, 2000),
    detail: detail?.slice(0, 4000),
  });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

export function appendOpsLog(
  level: OpsLogLevel,
  message: string,
  detail?: string,
) {
  push(level, message, detail);
}

export function listOpsLogs(limit = 50): OpsLogEntry[] {
  const size = Math.min(Math.max(limit, 1), 200);
  return entries.slice(-size).reverse();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack ?? arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

/** Capture console.error / warn into the ring buffer (once per process). */
export function installOpsLogConsoleCapture() {
  if (installed) return;
  installed = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    push("error", formatArgs(args));
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", formatArgs(args));
    originalWarn(...args);
  };
}
