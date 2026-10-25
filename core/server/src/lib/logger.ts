/**
 * Minimal level-gated logger for hot paths (per-request access lines etc.).
 * `LOG_LEVEL` = debug | info | warn | error | silent (default info).
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export function parseLogLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(value ?? "")
    ? (value as LogLevel)
    : "info";
}

let threshold: LogLevel = parseLogLevel(process.env.LOG_LEVEL);

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

export function getLogLevel(): LogLevel {
  return threshold;
}

export function isLogLevelEnabled(level: Exclude<LogLevel, "silent">): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold];
}

type LogArgs = Parameters<typeof console.log>;

export const logger = {
  debug: (...args: LogArgs) => {
    if (isLogLevelEnabled("debug")) console.debug(...args);
  },
  info: (...args: LogArgs) => {
    if (isLogLevelEnabled("info")) console.log(...args);
  },
  warn: (...args: LogArgs) => {
    if (isLogLevelEnabled("warn")) console.warn(...args);
  },
  error: (...args: LogArgs) => {
    if (isLogLevelEnabled("error")) console.error(...args);
  },
};
