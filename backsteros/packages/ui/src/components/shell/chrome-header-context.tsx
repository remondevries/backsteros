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
    // Bail out on same reference so registering a stable header does not
    // recreate context and re-fire useRegisterChromeHeader.
    setHeaderState((current) => (Object.is(current, next) ? current : next));
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
 * Pass `false` to skip registration entirely (nested overlays that must not
 * clobber the host trail).
 *
 * Depend on `setHeader` only — the context value object changes whenever the
 * header node updates, and listing `context` here caused Maximum update depth
 * (cleanup setHeader(null) → new context → effect → setHeader → …).
 */
export function useRegisterChromeHeader(header: ReactNode | false) {
  const setHeader = useContext(ChromeHeaderContext)?.setHeader;

  useLayoutEffect(() => {
    if (!setHeader) return;
    if (header === false) return;
    setHeader(header);
    return () => setHeader(null);
  }, [setHeader, header]);
}
