import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type TauriInvokeStats = Record<string, number>;

declare global {
  interface Window {
    __BACKSTEROS_INVOKE_STATS__?: TauriInvokeStats;
  }
}

const counts: TauriInvokeStats = Object.create(null) as TauriInvokeStats;
const isDev = import.meta.env.DEV;

function record(command: string): void {
  if (!isDev) return;
  counts[command] = (counts[command] ?? 0) + 1;
  if (typeof window !== "undefined") {
    window.__BACKSTEROS_INVOKE_STATS__ = counts;
  }
}

/** Snapshot of per-command invoke counts (dev builds only; empty in production). */
export function getTauriInvokeStats(): TauriInvokeStats {
  return { ...counts };
}

/** Clear counters (useful between profiling windows in the console). */
export function resetTauriInvokeStats(): void {
  for (const key of Object.keys(counts)) {
    delete counts[key];
  }
}

/**
 * Drop-in `invoke` wrapper. In Vite dev it counts calls by command name.
 * Import this instead of `@tauri-apps/api/core` so status-bar / overlay /
 * browser IPC shows up in `getTauriInvokeStats()`.
 */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  record(command);
  return tauriInvoke<T>(command, args);
}

if (isDev && typeof window !== "undefined") {
  window.__BACKSTEROS_INVOKE_STATS__ = counts;
  (
    window as Window & {
      getTauriInvokeStats?: typeof getTauriInvokeStats;
      resetTauriInvokeStats?: typeof resetTauriInvokeStats;
    }
  ).getTauriInvokeStats = getTauriInvokeStats;
  (
    window as Window & {
      getTauriInvokeStats?: typeof getTauriInvokeStats;
      resetTauriInvokeStats?: typeof resetTauriInvokeStats;
    }
  ).resetTauriInvokeStats = resetTauriInvokeStats;
}
