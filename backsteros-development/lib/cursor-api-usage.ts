/** Cumulative Cursor Agent API token usage for this console (local). */

const STORAGE_KEY = "backsteros-development.cursor-api-usage";
export const CURSOR_API_USAGE_EVENT = "backsteros-cursor-api-usage";

export type CursorApiUsageSnapshot = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turnCount: number;
  updatedAt: string | null;
};

export type CursorApiUsageDelta = {
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
};

const EMPTY: CursorApiUsageSnapshot = {
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turnCount: 0,
  updatedAt: null,
};

function asNonNegInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

function parseSnapshot(value: unknown): CursorApiUsageSnapshot {
  if (!value || typeof value !== "object") return { ...EMPTY };
  const raw = value as Record<string, unknown>;
  return {
    totalTokens: asNonNegInt(raw.totalTokens),
    inputTokens: asNonNegInt(raw.inputTokens),
    outputTokens: asNonNegInt(raw.outputTokens),
    cacheReadTokens: asNonNegInt(raw.cacheReadTokens),
    cacheWriteTokens: asNonNegInt(raw.cacheWriteTokens),
    turnCount: asNonNegInt(raw.turnCount),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CURSOR_API_USAGE_EVENT));
}

export function readCursorApiUsage(): CursorApiUsageSnapshot {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    return parseSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return { ...EMPTY };
  }
}

export function writeCursorApiUsage(snapshot: CursorApiUsageSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }
  emitChange();
}

/** Add one completed agent turn’s tokens to the running console total. */
export function recordCursorApiUsage(
  delta: CursorApiUsageDelta,
): CursorApiUsageSnapshot {
  const current = readCursorApiUsage();
  const inputTokens = asNonNegInt(delta.inputTokens);
  const outputTokens = asNonNegInt(delta.outputTokens);
  const cacheReadTokens = asNonNegInt(delta.cacheReadTokens);
  const cacheWriteTokens = asNonNegInt(delta.cacheWriteTokens);
  let totalTokens = asNonNegInt(delta.totalTokens);
  if (totalTokens === 0) {
    totalTokens =
      inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  }
  if (totalTokens === 0 && inputTokens === 0 && outputTokens === 0) {
    return current;
  }
  const next: CursorApiUsageSnapshot = {
    totalTokens: current.totalTokens + totalTokens,
    inputTokens: current.inputTokens + inputTokens,
    outputTokens: current.outputTokens + outputTokens,
    cacheReadTokens: current.cacheReadTokens + cacheReadTokens,
    cacheWriteTokens: current.cacheWriteTokens + cacheWriteTokens,
    turnCount: current.turnCount + 1,
    updatedAt: new Date().toISOString(),
  };
  writeCursorApiUsage(next);
  return next;
}

export function resetCursorApiUsage(): CursorApiUsageSnapshot {
  const next = { ...EMPTY };
  writeCursorApiUsage(next);
  return next;
}
