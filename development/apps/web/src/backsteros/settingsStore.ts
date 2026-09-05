import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

const BACKSTEROS_SETTINGS_STORAGE_KEY = "t3code:backsteros-settings";
const BACKSTEROS_SETTINGS_STORAGE_VERSION = 1;

export const DEFAULT_BACKSTEROS_API_URL = "http://127.0.0.1:8788";

export interface BacksterosSettingsState {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly setApiUrl: (apiUrl: string) => void;
  readonly setApiKey: (apiKey: string) => void;
  readonly setConnection: (input: { readonly apiUrl: string; readonly apiKey: string }) => void;
}

export const useBacksterosSettingsStore = create<BacksterosSettingsState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_BACKSTEROS_API_URL,
      apiKey: "",
      setApiUrl: (apiUrl) => set({ apiUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setConnection: ({ apiUrl, apiKey }) => set({ apiUrl, apiKey }),
    }),
    {
      name: BACKSTEROS_SETTINGS_STORAGE_KEY,
      version: BACKSTEROS_SETTINGS_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        apiUrl: state.apiUrl,
        apiKey: state.apiKey,
      }),
    },
  ),
);

export function readBacksterosConnectionSettings(): {
  readonly apiUrl: string;
  readonly apiKey: string;
} {
  const { apiUrl, apiKey } = useBacksterosSettingsStore.getState();
  return {
    apiUrl: apiUrl.trim() || DEFAULT_BACKSTEROS_API_URL,
    apiKey: apiKey.trim(),
  };
}
