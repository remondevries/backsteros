"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type BackendMode,
  defaultBackendMode,
  isNextDevBackendSwitchEnabled,
  persistBackendMode,
  readStoredBackendMode,
  resolveApiUrlForMode,
} from "@/lib/dev-backend-mode";
import { useMounted } from "@/hooks/use-mounted";

type BackendModeContextValue = {
  mode: BackendMode;
  apiUrl: string;
  /** True only under Next.js `next dev` — never in production builds. */
  nextDevSwitchEnabled: boolean;
  setMode: (mode: BackendMode) => void;
};

const BackendModeContext = createContext<BackendModeContextValue | null>(null);

export function BackendModeProvider({
  envApiUrl,
  children,
}: {
  envApiUrl: string;
  children: ReactNode;
}) {
  // Captured once: NODE_ENV is compile-time constant in Next bundles.
  const nextDevSwitchEnabled = isNextDevBackendSwitchEnabled();
  const mounted = useMounted();
  const [mode, setModeState] = useState<BackendMode>(() =>
    defaultBackendMode(envApiUrl),
  );

  useEffect(() => {
    if (!nextDevSwitchEnabled) {
      return;
    }

    const stored = readStoredBackendMode();
    if (stored) {
      setModeState(stored);
      // Keep the cookie aligned so server proxies (avatars, mentions) use the same API.
      persistBackendMode(stored);
    } else {
      persistBackendMode(defaultBackendMode(envApiUrl));
    }
  }, [envApiUrl, nextDevSwitchEnabled]);

  const setMode = useCallback(
    (next: BackendMode) => {
      if (!nextDevSwitchEnabled) {
        return;
      }

      persistBackendMode(next);
      // Full reload keeps API client, PowerSync SQLite, and in-memory caches aligned.
      window.location.reload();
    },
    [nextDevSwitchEnabled],
  );

  // Until mounted, keep SSR/hydration on the env default so localStorage cannot
  // diverge the first paint. After mount, honor the resolved mode (incl. stored).
  const activeMode =
    nextDevSwitchEnabled && mounted
      ? mode
      : defaultBackendMode(envApiUrl);

  const apiUrl = resolveApiUrlForMode(activeMode, envApiUrl);

  const value = useMemo(
    () => ({
      mode: activeMode,
      apiUrl,
      nextDevSwitchEnabled,
      setMode,
    }),
    [activeMode, apiUrl, nextDevSwitchEnabled, setMode],
  );

  return (
    <BackendModeContext.Provider value={value}>
      {children}
    </BackendModeContext.Provider>
  );
}

export function useBackendMode() {
  const value = useContext(BackendModeContext);
  if (!value) {
    throw new Error("useBackendMode must be used within BackendModeProvider");
  }
  return value;
}
