import { useEffect, useState } from "react";

import { startBacksterosSoftPollLoop } from "./backsterosSoftPollLoop";
import { BACKSTEROS_SOFT_POLL_INTERVAL_MS } from "./useBacksterosSoftPoll";

export type BacksterosSharedQueryState<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "error"; readonly message: string };

export type BacksterosSharedQuery<T> = {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => BacksterosSharedQueryState<T>;
  readonly reload: () => void;
  readonly setReadyData: (data: T) => void;
  readonly patchReadyData: (updater: (data: T) => T) => void;
  /** Test helper: active soft-poll + subscriber count. */
  readonly getDebugStats: () => {
    readonly subscriberCount: number;
    readonly softPollActive: boolean;
  };
};

export function createBacksterosSharedQuery<T>(options: {
  readonly fetch: (signal?: AbortSignal) => Promise<T>;
  readonly fingerprint: (data: T) => string;
  readonly errorMessage: string;
  readonly softPollIntervalMs?: number;
}): BacksterosSharedQuery<T> {
  let state: BacksterosSharedQueryState<T> = { status: "idle" };
  let fingerprint: string | null = null;
  let subscriberCount = 0;
  let loadGeneration = 0;
  let softPollStop: (() => void) | null = null;
  let inFlightLoad: AbortController | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (next: BacksterosSharedQueryState<T>) => {
    state = next;
    fingerprint = next.status === "ready" ? options.fingerprint(next.data) : null;
    emit();
  };

  const load = async (mode: "initial" | "reload" | "soft") => {
    const generation = ++loadGeneration;
    inFlightLoad?.abort();
    const controller = new AbortController();
    inFlightLoad = controller;

    if (mode === "initial" && state.status !== "ready") {
      setState({ status: "loading" });
    }

    try {
      const data = await options.fetch(controller.signal);
      if (generation !== loadGeneration) return;
      if (mode === "soft" && fingerprint != null && options.fingerprint(data) === fingerprint) {
        return;
      }
      setState({ status: "ready", data });
    } catch (error: unknown) {
      if (generation !== loadGeneration) return;
      if (controller.signal.aborted) return;
      if (mode === "soft") throw error;
      const message = error instanceof Error ? error.message : options.errorMessage;
      setState({ status: "error", message });
    } finally {
      if (inFlightLoad === controller) inFlightLoad = null;
    }
  };

  const startSoftPoll = () => {
    if (softPollStop) return;
    softPollStop = startBacksterosSoftPollLoop({
      intervalMs: options.softPollIntervalMs ?? BACKSTEROS_SOFT_POLL_INTERVAL_MS,
      isEnabled: () => subscriberCount > 0 && state.status === "ready",
      onTick: async () => {
        if (subscriberCount === 0 || state.status !== "ready") return;
        await load("soft");
      },
    });
  };

  const stopSoftPoll = () => {
    softPollStop?.();
    softPollStop = null;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      subscriberCount += 1;
      if (subscriberCount === 1) {
        void load(state.status === "ready" ? "reload" : "initial");
        startSoftPoll();
      }
      return () => {
        listeners.delete(listener);
        subscriberCount = Math.max(0, subscriberCount - 1);
        if (subscriberCount === 0) {
          stopSoftPoll();
          loadGeneration += 1;
          inFlightLoad?.abort();
          inFlightLoad = null;
        }
      };
    },
    getSnapshot() {
      return state;
    },
    reload() {
      void load("reload");
    },
    setReadyData(data) {
      setState({ status: "ready", data });
    },
    patchReadyData(updater) {
      if (state.status !== "ready") return;
      const next = updater(state.data);
      if (next === state.data) return;
      setState({ status: "ready", data: next });
    },
    getDebugStats() {
      return {
        subscriberCount,
        softPollActive: softPollStop != null,
      };
    },
  };
}

const IDLE_STATE = { status: "idle" } as const;

/**
 * Subscribe to a shared query only while `enabled`. Public hook APIs stay unchanged;
 * duplicate mounts share one fetch + one soft-poll.
 */
export function useBacksterosSharedQuery<T>(
  query: BacksterosSharedQuery<T>,
  enabled: boolean,
): BacksterosSharedQueryState<T> {
  const [state, setState] = useState<BacksterosSharedQueryState<T>>(() =>
    enabled ? query.getSnapshot() : IDLE_STATE,
  );

  useEffect(() => {
    if (!enabled) {
      setState(IDLE_STATE);
      return;
    }
    setState(query.getSnapshot());
    return query.subscribe(() => {
      setState(query.getSnapshot());
    });
  }, [enabled, query]);

  return enabled ? state : IDLE_STATE;
}
