"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

type MentionNavigationContextValue = {
  /** Current location pathname used to build trail-aware mention hrefs. */
  pathname: string;
};

const MentionNavigationContext =
  createContext<MentionNavigationContextValue | null>(null);

export function MentionNavigationProvider({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ pathname }), [pathname]);
  return (
    <MentionNavigationContext.Provider value={value}>
      {children}
    </MentionNavigationContext.Provider>
  );
}

export function useMentionNavigationPathname(): string | null {
  return useContext(MentionNavigationContext)?.pathname ?? null;
}
