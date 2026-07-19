"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ChromeHeaderContextValue = {
  header: ReactNode;
  setHeader: (next: ReactNode) => void;
};

const ChromeHeaderContext = createContext<ChromeHeaderContextValue | null>(
  null,
);

export function ChromeHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<ReactNode>(null);
  const setHeader = useCallback((next: ReactNode) => {
    setHeaderState(next);
  }, []);
  const value = useMemo(
    () => ({ header, setHeader }),
    [header, setHeader],
  );

  return (
    <ChromeHeaderContext.Provider value={value}>
      {children}
    </ChromeHeaderContext.Provider>
  );
}

export function useChromeHeader() {
  const context = useContext(ChromeHeaderContext);
  if (!context) {
    throw new Error("useChromeHeader must be used within ChromeHeaderProvider");
  }
  return context.header;
}

/**
 * Register a chrome header for the current screen. Clears on unmount.
 * No-op when provider is absent (keeps presentational views host-agnostic).
 */
export function useRegisterChromeHeader(header: ReactNode) {
  const context = useContext(ChromeHeaderContext);

  useLayoutEffect(() => {
    if (!context) return;
    context.setHeader(header);
    return () => context.setHeader(null);
  }, [context, header]);
}
