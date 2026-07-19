import { invoke } from "@tauri-apps/api/core";

export type WhoopSettingsStatus = {
  connected: boolean;
  configured: boolean;
  email: string | null;
  reason: string | null;
  envPath: string;
};

export type WhoopSnapshotEntity = {
  id: string;
  date: string;
  recoveryScore?: number | null;
  sleepPerformance?: number | null;
  strainScore?: number | null;
  strainTarget?: { value?: number | null } | null;
};

export type WhoopDayResult = {
  authenticated: boolean;
  snapshot: WhoopSnapshotEntity | null;
  error?: string | null;
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function fetchWhoopSettingsStatus(): Promise<WhoopSettingsStatus> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      configured: false,
      email: null,
      reason:
        "Whoop status is only available in the desktop app (reads local totem.env).",
      envPath: "",
    };
  }

  return invoke<WhoopSettingsStatus>("whoop_status");
}

const WHOOP_DAY_CACHE_LIMIT = 40;
const WHOOP_DAY_CACHE_TTL_MS = 120_000;
const whoopDayCache = new Map<string, WhoopDayResult>();
const whoopDayCacheWrittenAt = new Map<string, number>();
/** In-flight day fetches so journal open + prefetch share one invoke. */
const whoopDayInflight = new Map<string, Promise<WhoopDayResult>>();

export function peekWhoopDayCache(date: string): WhoopDayResult | null {
  const result = whoopDayCache.get(date);
  const writtenAt = whoopDayCacheWrittenAt.get(date);
  if (
    !result ||
    writtenAt == null ||
    Date.now() - writtenAt >= WHOOP_DAY_CACHE_TTL_MS
  ) {
    whoopDayCache.delete(date);
    whoopDayCacheWrittenAt.delete(date);
    return null;
  }
  return result;
}

function writeWhoopDayCache(date: string, result: WhoopDayResult): void {
  // Match the Next BFF cache: only successful snapshots are reusable.
  if (!result.authenticated || !result.snapshot) {
    whoopDayCache.delete(date);
    whoopDayCacheWrittenAt.delete(date);
    return;
  }
  if (whoopDayCache.has(date)) {
    whoopDayCache.delete(date);
  }
  whoopDayCache.set(date, result);
  whoopDayCacheWrittenAt.set(date, Date.now());
  while (whoopDayCache.size > WHOOP_DAY_CACHE_LIMIT) {
    const oldest = whoopDayCache.keys().next().value;
    if (oldest == null) break;
    whoopDayCache.delete(oldest);
    whoopDayCacheWrittenAt.delete(oldest);
  }
}

export async function fetchWhoopDaySnapshot(
  date: string,
): Promise<WhoopDayResult> {
  const cached = peekWhoopDayCache(date);
  if (cached) return cached;

  const existing = whoopDayInflight.get(date);
  if (existing) return existing;

  const request = (async (): Promise<WhoopDayResult> => {
    if (!isTauriRuntime()) {
      return {
        authenticated: false,
        snapshot: null,
        error: "Whoop fetch requires the Tauri desktop runtime.",
      };
    }

    const result = await invoke<WhoopDayResult>("whoop_fetch_day", { date });
    writeWhoopDayCache(date, result);
    return result;
  })().finally(() => {
    whoopDayInflight.delete(date);
  });

  whoopDayInflight.set(date, request);
  return request;
}

/** Warm Whoop for a journal day without waiting on document content. */
export function prefetchWhoopDaySnapshot(date: string): void {
  const trimmed = date.trim();
  if (!trimmed) return;
  if (peekWhoopDayCache(trimmed) || whoopDayInflight.has(trimmed)) return;
  void fetchWhoopDaySnapshot(trimmed);
}

export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
