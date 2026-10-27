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
/** v5: connection enabled toggle (key kept when off). */
const BACKSTEROS_SETTINGS_STORAGE_VERSION = 5;

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
  /** When false, the stored key is kept but the product API is not used. */
  readonly enabled: boolean;
  /** Contact used when agents attribute BacksterOS comments / activity. */
  readonly agentContactId: string | null;
  readonly setApiUrl: (apiUrl: string) => void;
  readonly setLocalCoreUrl: (localCoreUrl: string) => void;
  readonly setApiKey: (apiKey: string) => void;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setAgentContactId: (agentContactId: string | null) => void;
  readonly setConnection: (input: {
    readonly apiUrl: string;
    readonly apiKey: string;
    readonly localCoreUrl?: string;
    readonly enabled?: boolean;
  }) => void;
}

export const useBacksterosSettingsStore = create<BacksterosSettingsState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_BACKSTEROS_API_URL,
      localCoreUrl: DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
      apiKey: "",
      enabled: false,
      agentContactId: null,
      setApiUrl: (apiUrl) => set({ apiUrl: normalizePersistedBacksterosApiUrl(apiUrl) }),
      setLocalCoreUrl: (localCoreUrl) =>
        set({ localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(localCoreUrl) }),
      setApiKey: (apiKey) => set({ apiKey }),
      setEnabled: (enabled) => set({ enabled }),
      setAgentContactId: (agentContactId) =>
        set({ agentContactId: agentContactId?.trim() || null }),
      setConnection: ({ apiUrl, apiKey, localCoreUrl, enabled }) =>
        set({
          apiUrl: normalizePersistedBacksterosApiUrl(apiUrl),
          apiKey,
          ...(localCoreUrl !== undefined
            ? { localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(localCoreUrl) }
            : {}),
          ...(enabled !== undefined ? { enabled } : {}),
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
        const apiKey = typeof state.apiKey === "string" ? state.apiKey : "";
        return {
          apiUrl: normalizePersistedBacksterosApiUrl(
            typeof state.apiUrl === "string" ? state.apiUrl : DEFAULT_BACKSTEROS_API_URL,
          ),
          localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(
            typeof state.localCoreUrl === "string"
              ? state.localCoreUrl
              : DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
          ),
          apiKey,
          enabled:
            typeof state.enabled === "boolean" ? state.enabled : apiKey.trim().length > 0,
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
        enabled: state.enabled,
        agentContactId: state.agentContactId,
      }),
    },
  ),
);

export function readBacksterosConnectionSettings(): {
  readonly apiUrl: string;
  readonly localCoreUrl: string;
  /** Effective key for API calls — empty when the connection toggle is off. */
  readonly apiKey: string;
  readonly enabled: boolean;
  readonly agentContactId: string | null;
} {
  const { apiUrl, localCoreUrl, apiKey, enabled, agentContactId } =
    useBacksterosSettingsStore.getState();
  const trimmedKey = apiKey.trim();
  return {
    apiUrl: normalizePersistedBacksterosApiUrl(apiUrl.trim() || DEFAULT_BACKSTEROS_API_URL),
    localCoreUrl: normalizePersistedBacksterosLocalCoreUrl(
      localCoreUrl.trim() || DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
    ),
    apiKey: enabled ? trimmedKey : "",
    enabled,
    agentContactId: agentContactId?.trim() || null,
  };
}

/** True when the connection is enabled and an API key is stored. */
export function hasBacksterosApiKey(): boolean {
  const { enabled, apiKey } = readBacksterosConnectionSettings();
  return enabled && apiKey.length > 0;
}

export function useHasBacksterosApiKey(): boolean {
  return useBacksterosSettingsStore(
    (state) => state.enabled && state.apiKey.trim().length > 0,
  );
}
