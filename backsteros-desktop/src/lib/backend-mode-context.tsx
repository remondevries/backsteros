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
  isDesktopDevBackendSwitchEnabled,
  persistBackendMode,
  readStoredBackendMode,
  resolveApiUrlForMode,
} from "./backend-mode";

type BackendModeContextValue = {
  mode: BackendMode;
  apiUrl: string;
  /** True only under Vite `import.meta.env.DEV` — never in production builds. */
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
  const nextDevSwitchEnabled = isDesktopDevBackendSwitchEnabled();
  const [mounted, setMounted] = useState(false);
  const [mode, setModeState] = useState<BackendMode>(() =>
    defaultBackendMode(envApiUrl),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!nextDevSwitchEnabled) {
      return;
    }

    const stored = readStoredBackendMode();
    if (stored) {
      setModeState(stored);
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
      // Soft switch: ApiProvider + PowerSync already rebind on apiUrl/mode.
      // Avoid window.location.reload() — it whites out the whole Tauri webview.
      setModeState(next);
    },
    [nextDevSwitchEnabled],
  );

  // Until mounted, keep the first paint on the env default so localStorage cannot
  // diverge hydration. After mount, honor the resolved mode (incl. stored).
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
