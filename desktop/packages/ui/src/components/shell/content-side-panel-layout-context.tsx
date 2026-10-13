"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ContentSidePanelLayoutValue = {
  /** Full left list panel is collapsed (width animating to 0). */
  collapsed: boolean;
  /**
   * Finance (and similar) keep a slim rail while “collapsed” so content can
   * reclaim space for secondary nav such as a document outline.
   */
  rail: boolean;
};

const DEFAULT_VALUE: ContentSidePanelLayoutValue = {
  collapsed: false,
  rail: false,
};

const ContentSidePanelLayoutContext =
  createContext<ContentSidePanelLayoutValue>(DEFAULT_VALUE);

export function ContentSidePanelLayoutProvider({
  collapsed,
  rail,
  children,
}: ContentSidePanelLayoutValue & { children: ReactNode }) {
  return (
    <ContentSidePanelLayoutContext.Provider value={{ collapsed, rail }}>
      {children}
    </ContentSidePanelLayoutContext.Provider>
  );
}

export function useContentSidePanelLayout(): ContentSidePanelLayoutValue {
  return useContext(ContentSidePanelLayoutContext);
}
