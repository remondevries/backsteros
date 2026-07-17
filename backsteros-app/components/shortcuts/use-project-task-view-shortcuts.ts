"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import {
  buildProjectTasksHref,
  getProjectIdFromTasksPathname,
  getProjectTaskViewForShortcutKey,
  parseProjectTaskView,
  persistProjectTaskView,
} from "@/lib/project-task-view";
import {
  buildOrganizationProjectsHref,
  buildProjectsListHref,
  getOrganizationIdFromProjectsPathname,
  isOrganizationProjectsListPathname,
  isProjectsListPathname,
  parseProjectsListView,
  persistProjectsListView,
} from "@/lib/projects-list-view";
import { parseProjectAreaParam } from "@/lib/project-areas";
import { shouldHandleProjectTaskViewShortcut } from "@/lib/shortcuts/should-handle-project-task-view-shortcut";
import {
  getTasksViewHref,
  isTasksPagePathname,
  parseTasksDueFilter,
  TASKS_DUE_SEARCH_PARAM,
} from "@/lib/tasks-due-filters";
import { LIST_BOARD_VIEW_SEARCH_PARAM } from "@/lib/list-board-view";
import type { ListBoardView } from "@/lib/list-board-view";

export function useProjectTaskViewShortcuts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) {
        return;
      }

      if (commandPaletteOpen) {
        return;
      }

      if (!shouldHandleProjectTaskViewShortcut(event)) {
        return;
      }

      const projectId = getProjectIdFromTasksPathname(pathname);
      const onDueTasksPage = isTasksPagePathname(pathname);
      const onProjectsListPage = isProjectsListPathname(pathname);
      const onOrganizationProjectsListPage =
        isOrganizationProjectsListPathname(pathname);

      if (
        !projectId &&
        !onDueTasksPage &&
        !onProjectsListPage &&
        !onOrganizationProjectsListPage
      ) {
        return;
      }

      const nextView = getProjectTaskViewForShortcutKey(event.key, event.code);
      if (!nextView) {
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const viewParam = searchParams.get(LIST_BOARD_VIEW_SEARCH_PARAM);
      const currentView: ListBoardView =
        onProjectsListPage || onOrganizationProjectsListPage
          ? parseProjectsListView(viewParam)
          : parseProjectTaskView(viewParam);

      if (nextView === currentView) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (onProjectsListPage) {
        persistProjectsListView(nextView);
        const area = parseProjectAreaParam(searchParams.get("area"));
        router.replace(buildProjectsListHref({ area, view: nextView }), {
          scroll: false,
        });
        return;
      }

      if (onOrganizationProjectsListPage) {
        const organizationId = getOrganizationIdFromProjectsPathname(pathname);
        if (!organizationId) {
          return;
        }

        persistProjectsListView(nextView);
        router.replace(
          buildOrganizationProjectsHref(organizationId, { view: nextView }),
          { scroll: false },
        );
        return;
      }

      persistProjectTaskView(nextView);

      if (projectId) {
        router.replace(
          buildProjectTasksHref(projectId, { view: nextView, pathname }),
          { scroll: false },
        );
        return;
      }

      const dueFilter = parseTasksDueFilter(
        searchParams.get(TASKS_DUE_SEARCH_PARAM),
      );
      router.replace(getTasksViewHref(dueFilter, { view: nextView }), {
        scroll: false,
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, pathname, router]);
}
