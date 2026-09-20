import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_BACKSTEROS_API_URL,
  DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
  normalizePersistedBacksterosApiUrl,
  normalizePersistedBacksterosLocalCoreUrl,
} from "./backsterosApiProxy";
import { resolveStorage } from "~/lib/storage";

const BACKSTEROS_SETTINGS_STORAGE_KEY = "t3code:backsteros-settings";
/** v4: dual-base — product API URL + local-core origin for Files/Documents. */
const BACKSTEROS_SETTINGS_STORAGE_VERSION = 4;

export { DEFAULT_BACKSTEROS_API_URL, DEFAULT_BACKSTEROS_LOCAL_CORE_URL };

export interface BacksterosSettingsState {
  /** Product / gateway API (tasks, projects, GitHub). */
  readonly apiUrl: string;
  /**
   * Local-core origin for Files / Documents FS (`/fs/*`, `/docs`).
   * Defaults to loopback; proxy-eligible hosts use `/backsteros-local-core`.
   */
  readonly localCoreUrl: string;
  readonly apiKey: string;
  /** Contact used when agents attribute BacksterOS comments / activity. */
  readonly agentContactId: string | null;
  readonly setApiUrl: (apiUrl: string) => void;
  readonly setLocalCoreUrl: (localCoreUrl: string) => void;
  readonly setApiKey: (apiKey: string) => void;
  readonly setAgentContactId: (agentContactId: string | null) => void;
  readonly setConnection: (input: {
    readonly apiUrl: string;
    readonly apiKey: string;
    readonly localCoreUrl?: string;
  }) => void;
}

export const useBacksterosSettingsStore = create<BacksterosSettingsState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_BACKSTEROS_API_URL,
      localCoreUrl: DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
      apiKey: "",
      agentContactId: null,
      setApiUrl: (apiUrl) => set({ apiUrl: normalizePersistedBacksterosApiUrl(apiUrl) }),
      setLocalCoreUrl: (localCoreUrl) =>
        set({ localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(localCoreUrl) }),
      setApiKey: (apiKey) => set({ apiKey }),
      setAgentContactId: (agentContactId) =>
        set({ agentContactId: agentContactId?.trim() || null }),
      setConnection: ({ apiUrl, apiKey, localCoreUrl }) =>
        set({
          apiUrl: normalizePersistedBacksterosApiUrl(apiUrl),
          apiKey,
          ...(localCoreUrl !== undefined
            ? { localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(localCoreUrl) }
            : {}),
        }),
    }),
    {
      name: BACKSTEROS_SETTINGS_STORAGE_KEY,
      version: BACKSTEROS_SETTINGS_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<BacksterosSettingsState>;
        return {
          apiUrl: normalizePersistedBacksterosApiUrl(
            typeof state.apiUrl === "string" ? state.apiUrl : DEFAULT_BACKSTEROS_API_URL,
          ),
          localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(
            typeof state.localCoreUrl === "string"
              ? state.localCoreUrl
              : DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
          ),
          apiKey: typeof state.apiKey === "string" ? state.apiKey : "",
          agentContactId:
            typeof state.agentContactId === "string" && state.agentContactId.trim()
              ? state.agentContactId.trim()
              : null,
        };
      },
      partialize: (state) => ({
        apiUrl: state.apiUrl,
        localCoreUrl: state.localCoreUrl,
        apiKey: state.apiKey,
        agentContactId: state.agentContactId,
      }),
    },
  ),
);

export function readBacksterosConnectionSettings(): {
  readonly apiUrl: string;
  readonly localCoreUrl: string;
  readonly apiKey: string;
  readonly agentContactId: string | null;
} {
  const { apiUrl, localCoreUrl, apiKey, agentContactId } = useBacksterosSettingsStore.getState();
  return {
    apiUrl: normalizePersistedBacksterosApiUrl(apiUrl.trim() || DEFAULT_BACKSTEROS_API_URL),
    localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(
      localCoreUrl.trim() || DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
    ),
    apiKey: apiKey.trim(),
    agentContactId: agentContactId?.trim() || null,
  };
}
