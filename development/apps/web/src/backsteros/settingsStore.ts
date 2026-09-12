import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

const BACKSTEROS_SETTINGS_STORAGE_KEY = "t3code:backsteros-settings";
const BACKSTEROS_SETTINGS_STORAGE_VERSION = 2;

export const DEFAULT_BACKSTEROS_API_URL = "http://127.0.0.1:8788";

export interface BacksterosSettingsState {
  readonly apiUrl: string;
  readonly apiKey: string;
  /** Contact used when agents attribute BacksterOS comments / activity. */
  readonly agentContactId: string | null;
  readonly setApiUrl: (apiUrl: string) => void;
  readonly setApiKey: (apiKey: string) => void;
  readonly setAgentContactId: (agentContactId: string | null) => void;
  readonly setConnection: (input: { readonly apiUrl: string; readonly apiKey: string }) => void;
}

export const useBacksterosSettingsStore = create<BacksterosSettingsState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_BACKSTEROS_API_URL,
      apiKey: "",
      agentContactId: null,
      setApiUrl: (apiUrl) => set({ apiUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setAgentContactId: (agentContactId) =>
        set({ agentContactId: agentContactId?.trim() || null }),
      setConnection: ({ apiUrl, apiKey }) => set({ apiUrl, apiKey }),
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
          apiUrl: typeof state.apiUrl === "string" ? state.apiUrl : DEFAULT_BACKSTEROS_API_URL,
          apiKey: typeof state.apiKey === "string" ? state.apiKey : "",
          agentContactId:
            typeof state.agentContactId === "string" && state.agentContactId.trim()
              ? state.agentContactId.trim()
              : null,
        };
      },
      partialize: (state) => ({
        apiUrl: state.apiUrl,
        apiKey: state.apiKey,
        agentContactId: state.agentContactId,
      }),
    },
  ),
);

export function readBacksterosConnectionSettings(): {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly agentContactId: string | null;
} {
  const { apiUrl, apiKey, agentContactId } = useBacksterosSettingsStore.getState();
  return {
    apiUrl: apiUrl.trim() || DEFAULT_BACKSTEROS_API_URL,
    apiKey: apiKey.trim(),
    agentContactId: agentContactId?.trim() || null,
  };
}
