"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type ContentLayoutTransitionContextValue = {
  /** True while nav, list sidepanel, or task agent rail width is interpolating. */
  animating: boolean;
};

const ContentLayoutTransitionContext =
  createContext<ContentLayoutTransitionContextValue>({ animating: false });

/**
 * Nested providers OR their `animating` flags so shell chrome and task-layout
 * collapses share one signal for freezing detail width mid-transition.
 */
export function ContentLayoutTransitionProvider({
  animating = false,
  children,
}: {
  animating?: boolean;
  children: ReactNode;
}) {
  const parent = useContext(ContentLayoutTransitionContext);
  const value = useMemo(
    () => ({ animating: Boolean(animating) || parent.animating }),
    [animating, parent.animating],
  );
  return (
    <ContentLayoutTransitionContext.Provider value={value}>
      {children}
    </ContentLayoutTransitionContext.Provider>
  );
}

export function useContentLayoutTransition(): ContentLayoutTransitionContextValue {
  return useContext(ContentLayoutTransitionContext);
}

/** Matches `.bos-product-sidebar` width/min-width transition. */
export const SIDEBAR_COLLAPSE_DURATION_MS = 180;
