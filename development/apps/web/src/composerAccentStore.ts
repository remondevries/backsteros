import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { normalizeProviderAccentColor } from "./providerInstances";
import { resolveStorage } from "./lib/storage";

const COMPOSER_ACCENT_STORAGE_KEY = "t3code:composer-accent-overrides";
const COMPOSER_ACCENT_STORAGE_VERSION = 1;

export function composerAccentOverrideKey(input: {
  readonly taskId?: string | null;
  readonly threadId?: string | null;
}): string | null {
  const taskId = input.taskId?.trim();
  if (taskId) return `task:${taskId}`;
  const threadId = input.threadId?.trim();
  if (threadId) return `thread:${threadId}`;
  return null;
}

interface ComposerAccentStoreState {
  readonly overrides: Readonly<Record<string, string>>;
  readonly getOverride: (key: string | null | undefined) => string | undefined;
  readonly setOverride: (key: string, hex: string | null) => void;
}

function normalizeOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const normalized = normalizeProviderAccentColor(value);
    if (normalized) next[key] = normalized;
  }
  return next;
}

export const useComposerAccentStore = create<ComposerAccentStoreState>()(
  persist(
    (set, get) => ({
      overrides: {},
      getOverride: (key) => {
        if (!key) return undefined;
        return get().overrides[key];
      },
      setOverride: (key, hex) => {
        const trimmedKey = key.trim();
        if (!trimmedKey) return;
        set((state) => {
          if (hex == null || hex.trim() === "") {
            if (!(trimmedKey in state.overrides)) return state;
            const { [trimmedKey]: _removed, ...rest } = state.overrides;
            return { overrides: rest };
          }
          const normalized = normalizeProviderAccentColor(hex);
          if (!normalized) return state;
          if (state.overrides[trimmedKey] === normalized) return state;
          return {
            overrides: {
              ...state.overrides,
              [trimmedKey]: normalized,
            },
          };
        });
      },
    }),
    {
      name: COMPOSER_ACCENT_STORAGE_KEY,
      version: COMPOSER_ACCENT_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ overrides: state.overrides }),
      migrate: (persisted) => {
        const state = persisted as { overrides?: unknown } | null;
        return { overrides: normalizeOverrides(state?.overrides) };
      },
    },
  ),
);
