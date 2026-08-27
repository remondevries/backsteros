"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
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
} from "../organizations/organization-sections.js";
import { isCodebaseWorkbenchMounted } from "../navigation/section-tab-hrefs.js";
import {
  getProjectsListAreaHref,
  parseProjectAreaFilterFromLocation,
} from "../projects/project-areas.js";
import { isTaskDetailPath } from "../content/properties-panel.js";
import { shouldHandleProjectTaskViewShortcut } from "../projects/should-handle-project-task-view-shortcut.js";
import {
  buildTasksDueHref,
  isTasksDueListPathname,
  parseTasksDueFilterFromLocation,
} from "../tasks/tasks-due-filters.js";

function isProjectsListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/projects";
}

function isProjectTasksPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    /^\/projects\/[^/]+\/tasks\/?$/.test(path) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/tasks\/?$/.test(path)
  );
}

/**
 * Codebase workbench Tasks surface: bare project path (or `/tasks` list),
 * while the workbench is mounted. Board toggles must stay on this base so
 * the left sidebar is not replaced by default project section chrome.
 */
function resolveCodebaseWorkbenchTasksBase(
  pathname: string,
): string | null {
  if (!isCodebaseWorkbenchMounted()) return null;
  if (isTaskDetailPath(pathname)) return null;

  const path = pathname.replace(/\/+$/, "") || "/";
  const match = path.match(
    /^((?:\/organizations\/[^/]+)?\/projects\/[^/]+)(?:\/tasks)?$/,
  );
  return match?.[1] ?? null;
}

function buildProjectTasksHref(
  pathname: string,
  view: ListBoardView,
): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const codebaseBase = resolveCodebaseWorkbenchTasksBase(path);
  const base =
    codebaseBase ??
    path.match(
      /^((?:\/organizations\/[^/]+)?\/projects\/[^/]+\/tasks)/,
    )?.[1] ??
    path;
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
  onNavigate,
}: {
  enabled?: boolean;
  pathname: string;
  search?: string;
  onNavigate: (href: string) => void;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (openRef.current) return;
      if (!shouldHandleProjectTaskViewShortcut(event)) return;

      const onDueTasksPage = isTasksDueListPathname(pathname);
      const onProjectsListPage = isProjectsListPathname(pathname);
      const onOrganizationProjectsListPage =
        isOrganizationProjectsListPathname(pathname);
      const codebaseWorkbenchTasksBase =
        resolveCodebaseWorkbenchTasksBase(pathname);
      const onProjectTasksPage =
        isProjectTasksPathname(pathname) ||
        codebaseWorkbenchTasksBase != null;

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
  }, [enabled, onNavigate, openRef, pathname, search]);
}
