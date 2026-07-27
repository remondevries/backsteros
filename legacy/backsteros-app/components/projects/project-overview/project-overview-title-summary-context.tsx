"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { deferFocusAfterTitleLeave } from "@/components/content/use-content-title-editor-navigation";
import { useTitleRenameShortcut } from "@/lib/shortcuts/title-rename-shortcut";

type ProjectOverviewTitleSummaryNavigation = {
  titleRenameFocusRequest: number;
  summaryFocusRequest: number;
  requestTitleFocus: () => void;
  handleLeaveTitleForSummary: () => void;
};

const ProjectOverviewTitleSummaryContext =
  createContext<ProjectOverviewTitleSummaryNavigation | null>(null);

const EMPTY_PROJECT_OVERVIEW_TITLE_SUMMARY_NAVIGATION: ProjectOverviewTitleSummaryNavigation =
  {
    titleRenameFocusRequest: 0,
    summaryFocusRequest: 0,
    requestTitleFocus: () => {},
    handleLeaveTitleForSummary: () => {},
  };

function useProjectOverviewTitleSummaryNavigationState(): ProjectOverviewTitleSummaryNavigation {
  const [titleRenameFocusRequest, setTitleRenameFocusRequest] = useState(0);
  const [summaryFocusRequest, setSummaryFocusRequest] = useState(0);

  const requestTitleFocus = useCallback(() => {
    setTitleRenameFocusRequest((count) => count + 1);
  }, []);

  const requestSummaryFocus = useCallback(() => {
    setSummaryFocusRequest((count) => count + 1);
  }, []);

  const handleLeaveTitleForSummary = useCallback(() => {
    deferFocusAfterTitleLeave(requestSummaryFocus);
  }, [requestSummaryFocus]);

  useTitleRenameShortcut(requestTitleFocus);

  return {
    titleRenameFocusRequest,
    summaryFocusRequest,
    requestTitleFocus,
    handleLeaveTitleForSummary,
  };
}

export function ProjectOverviewTitleSummaryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useProjectOverviewTitleSummaryNavigationState();

  return (
    <ProjectOverviewTitleSummaryContext.Provider value={value}>
      {children}
    </ProjectOverviewTitleSummaryContext.Provider>
  );
}

/** Title ↔ summary focus flow for the project overview panel. */
export function useProjectOverviewTitleSummaryNavigation(): ProjectOverviewTitleSummaryNavigation {
  const context = useContext(ProjectOverviewTitleSummaryContext);
  return context ?? EMPTY_PROJECT_OVERVIEW_TITLE_SUMMARY_NAVIGATION;
}
