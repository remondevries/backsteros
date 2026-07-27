"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useMounted } from "@/hooks/use-mounted";

const STORAGE_KEY = "backsteros.content-side-panel-visible";

type ContentSidePanelContextValue = {
  visible: boolean;
  toggle: () => void;
  setVisible: (visible: boolean) => void;
};

const ContentSidePanelContext =
  createContext<ContentSidePanelContextValue | null>(null);

function readStoredVisibility(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return true;
    }

    return raw === "true";
  } catch {
    return true;
  }
}

function persistVisibility(visible: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, String(visible));
}

export function ContentSidePanelProvider({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const [hydrated, setHydrated] = useState(false);
  const [visible, setVisibleState] = useState(true);

  if (mounted && !hydrated) {
    setHydrated(true);
    setVisibleState(readStoredVisibility());
  }

  const setVisible = useCallback((next: boolean) => {
    setVisibleState(next);
    persistVisibility(next);
  }, []);

  const toggle = useCallback(() => {
    setVisibleState((current) => {
      const next = !current;
      persistVisibility(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      visible,
      toggle,
      setVisible,
    }),
    [visible, toggle, setVisible],
  );

  return (
    <ContentSidePanelContext.Provider value={value}>
      {children}
    </ContentSidePanelContext.Provider>
  );
}

export function useContentSidePanel(): ContentSidePanelContextValue {
  const context = useContext(ContentSidePanelContext);
  if (!context) {
    throw new Error(
      "useContentSidePanel must be used within ContentSidePanelProvider",
    );
  }

  return context;
}
