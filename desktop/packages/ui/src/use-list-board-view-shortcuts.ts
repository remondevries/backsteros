"use client";

import { useEffect } from "react";

import {
  LIST_BOARD_VIEW_SEARCH_PARAM,
  parseListBoardViewFromSearchParam,
  persistListBoardView,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  TASKS_LIST_BOARD_STORAGE_KEY,
  type ListBoardView,
} from "./list-board-view.js";
import { getListBoardViewForShortcutKey } from "./list-board-view-shortcut.js";
import {
  buildOrganizationProjectsHref,
  getOrganizationIdFromProjectsPathname,
  isOrganizationProjectsListPathname,
} from "./organization-sections.js";
import {
  getProjectsListAreaHref,
  parseProjectAreaFilterFromLocation,
} from "./project-areas.js";
import { shouldHandleProjectTaskViewShortcut } from "./should-handle-project-task-view-shortcut.js";
import {
  buildTasksDueHref,
  isTasksDueListPathname,
  parseTasksDueFilterFromLocation,
} from "./tasks-due-filters.js";

function isProjectsListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/projects";
}

function isProjectTasksPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    /^\/projects\/[^/]+\/tasks(?:\/|$)/.test(path) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/tasks(?:\/|$)/.test(path)
  );
}

function buildProjectTasksHref(
  pathname: string,
  view: ListBoardView,
): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const base =
    path.match(
      /^((?:\/organizations\/[^/]+)?\/projects\/[^/]+\/tasks)/,
    )?.[1] ?? path;
  if (view === "board") {
    return `${base}?${LIST_BOARD_VIEW_SEARCH_PARAM}=board`;
  }
  return base;
}

/**
 * ⇧L / ⇧B toggles list/board view on tasks and projects lists (Next parity).
 */
export function useListBoardViewShortcuts({
  enabled = true,
  pathname,
  search = "",
  commandPaletteOpen = false,
  onNavigate,
}: {
  enabled?: boolean;
  pathname: string;
  search?: string;
  commandPaletteOpen?: boolean;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (commandPaletteOpen) return;
      if (!shouldHandleProjectTaskViewShortcut(event)) return;

      const onDueTasksPage = isTasksDueListPathname(pathname);
      const onProjectsListPage = isProjectsListPathname(pathname);
      const onOrganizationProjectsListPage =
        isOrganizationProjectsListPathname(pathname);
      const onProjectTasksPage = isProjectTasksPathname(pathname);

      if (
        !onDueTasksPage &&
        !onProjectsListPage &&
        !onOrganizationProjectsListPage &&
        !onProjectTasksPage
      ) {
        return;
      }

      const nextView = getListBoardViewForShortcutKey(event.key, event.code);
      if (!nextView) return;

      const viewParam = new URLSearchParams(
        search.startsWith("?") ? search.slice(1) : search,
      ).get(LIST_BOARD_VIEW_SEARCH_PARAM);
      const currentView = parseListBoardViewFromSearchParam(viewParam);

      if (nextView === currentView) return;

      event.preventDefault();
      event.stopPropagation();

      if (onProjectsListPage) {
        persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
        const area =
          parseProjectAreaFilterFromLocation(pathname, search) ?? "all";
        onNavigate(getProjectsListAreaHref(area, nextView));
        return;
      }

      if (onOrganizationProjectsListPage) {
        const organizationId = getOrganizationIdFromProjectsPathname(pathname);
        if (!organizationId) return;

        persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
        onNavigate(buildOrganizationProjectsHref(organizationId, { view: nextView }));
        return;
      }

      persistListBoardView(nextView, TASKS_LIST_BOARD_STORAGE_KEY);

      if (onProjectTasksPage) {
        onNavigate(buildProjectTasksHref(pathname, nextView));
        return;
      }

      const dueFilter =
        parseTasksDueFilterFromLocation(pathname, search) ?? "today";
      onNavigate(buildTasksDueHref(dueFilter, nextView));
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, onNavigate, pathname, search]);
}
