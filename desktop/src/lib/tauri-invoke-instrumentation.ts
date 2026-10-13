import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./tauri-runtime";

export type TauriInvokeStats = Record<string, number>;

declare global {
  interface Window {
    __BACKSTEROS_INVOKE_STATS__?: TauriInvokeStats;
  }
}

const counts: TauriInvokeStats = Object.create(null) as TauriInvokeStats;
const isDev = import.meta.env.DEV;

export class TauriUnavailableError extends Error {
  constructor(command: string) {
    super(`Tauri IPC unavailable (command: ${command})`);
    this.name = "TauriUnavailableError";
  }
}

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
 *
 * Outside the Tauri shell, rejects with {@link TauriUnavailableError} instead
 * of throwing on missing `window.__TAURI_INTERNALS__`.
 */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  record(command);
  if (!isTauriRuntime()) {
    throw new TauriUnavailableError(command);
  }
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    // Tauri core can throw TypeError when internals are mid-init / torn down.
    if (
      error instanceof TypeError &&
      String(error.message).includes("__TAURI_INTERNALS__")
    ) {
      throw new TauriUnavailableError(command);
    }
    throw error;
  }
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
