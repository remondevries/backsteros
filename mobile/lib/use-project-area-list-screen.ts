import type { Project, Task } from "@backsteros/contracts";
import { useCallback, useMemo, useState } from "react";

import { useSyncedAreas } from "./areas-data";
import { useMobileCoreApiUrl } from "./api-url-context";
import {
  type NestedAreaRef,
} from "./group-projects-by-area";
import {
  aggregateTaskProgressByProjectId,
  type ProjectTaskProgress,
} from "./project-progress-ring";
import {
  filterProjectsByArea,
  PROJECT_AREA_FILTER_ALL,
  type ProjectAreaFilter,
} from "./project-areas";
import {
  mapRestProjectRow,
  mapSyncedProjectRow,
  type ProjectListRow,
  type ProjectListSyncedRow,
  type ProjectTypeListFilter,
} from "./project-list-screen-helpers";
import { useMobilePowerSync } from "./powersync-context";
import { resolveSyncedOrRestRows } from "./resolve-synced-or-rest-rows";
import { useLocalQuery } from "./use-local-query";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useRestListHydration } from "./use-rest-list-hydration";
import { useRestReloadFlags } from "./use-rest-reload-flags";

export { AREAS_LIST_SQL, AREAS_SQL } from "./areas-data";

export const TASK_PROGRESS_SQL = `SELECT project_id, status FROM tasks
 WHERE deleted_at IS NULL
   AND project_id IS NOT NULL`;

export type { ProjectListRow, ProjectListSyncedRow, ProjectTypeListFilter };
export {
  mapRestProjectRow,
  mapSyncedProjectRow,
  matchesProjectTypeFilter,
} from "./project-list-screen-helpers";

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type UseProjectAreaListScreenOptions = {
  projectsSql: string;
  projectTypeFilter?: ProjectTypeListFilter;
  /** Areas tab: also watch/hydrate nested custom areas. */
  includeNestedAreas?: boolean;
};

/**
 * Shared project list data for Areas / Projects index screens: PowerSync watch,
 * REST hydrate, task progress, and area filter state.
 */
export function useProjectAreaListScreen({
  projectsSql,
  projectTypeFilter = "all",
  includeNestedAreas = false,
}: UseProjectAreaListScreenOptions) {
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const [area, setArea] = useState<ProjectAreaFilter>(PROJECT_AREA_FILTER_ALL);
  const {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  } = useRestReloadFlags();

  const { data: syncedProjects, isLoading: syncLoading } =
    useLocalQuery<ProjectListSyncedRow>(projectsSql);
  const { data: syncedTaskRows } = useLocalQuery<TaskProgressRow>(
    TASK_PROGRESS_SQL,
  );
  const {
    nestedAreas: allNestedAreas,
    reload: reloadAreas,
    pullRefreshing: areasPullRefreshing,
  } = useSyncedAreas({ restEnabled: includeNestedAreas });

  const [restRows, setRestRows] = useState<ProjectListRow[] | null>(null);
  const [restProgress, setRestProgress] = useState<
    Record<string, ProjectTaskProgress>
  >({});
  const [restError, setRestError] = useState<string | null>(null);

  const localRows = useMemo(
    () =>
      (syncedProjects ?? [])
        .map((row) => mapSyncedProjectRow(row, projectTypeFilter))
        .filter((row): row is ProjectListRow => row != null),
    [projectTypeFilter, syncedProjects],
  );

  const localProgress = useMemo(
    () => aggregateTaskProgressByProjectId(syncedTaskRows ?? []),
    [syncedTaskRows],
  );

  const reloadRest = useCallback(
    async (opts?: { userPull?: boolean }) => {
      const userPull = beginReload(opts);
      setRestError(null);
      try {
        const [projectsBody, tasksBody] = await Promise.all([
          client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
          client
            .requestJson<{ tasks: Task[] }>("/api/v1/tasks")
            .catch(() => ({ tasks: [] as Task[] })),
        ]);
        setRestRows(
          (projectsBody.projects ?? [])
            .map((project) => mapRestProjectRow(project, projectTypeFilter))
            .filter((row): row is ProjectListRow => row != null),
        );
        setRestProgress(
          aggregateTaskProgressByProjectId(
            (tasksBody.tasks ?? []).map((task) => ({
              project_id: task.projectId,
              status: task.status,
            })),
          ),
        );
        markHydrated();
        if (includeNestedAreas) {
          await reloadAreas({ userPull: false });
        }
      } catch (reason) {
        const detail =
          reason instanceof Error ? reason.message : String(reason);
        setRestError(
          isNetworkError(detail) ? formatNetworkError() : detail,
        );
      } finally {
        endReload(userPull);
      }
    },
    [
      beginReload,
      client,
      endReload,
      formatNetworkError,
      includeNestedAreas,
      isNetworkError,
      markHydrated,
      projectTypeFilter,
      reloadAreas,
    ],
  );

  useRestListHydration(reloadRest, true, localRows.length > 0);

  const sourceRows = resolveSyncedOrRestRows({
    localRows,
    restRows,
    connected: powerSync.connected,
  });

  const nestedAreas = useMemo((): NestedAreaRef[] => {
    if (!includeNestedAreas) return [];
    const all = allNestedAreas;
    if (area === PROJECT_AREA_FILTER_ALL) return all;
    return all.filter((entry) => entry.parent === area);
  }, [allNestedAreas, area, includeNestedAreas]);

  const rows = useMemo(
    () => filterProjectsByArea(sourceRows, area),
    [area, sourceRows],
  );

  const progressByProjectId = useMemo(() => {
    if (Object.keys(localProgress).length > 0) return localProgress;
    if (restRows != null) return restProgress;
    return localProgress;
  }, [localProgress, restProgress, restRows]);

  return {
    area,
    setArea,
    /** Type-filtered rows before area filter (for first-load gate). */
    sourceRows,
    /** Area-filtered rows (caller applies search). */
    rows,
    nestedAreas,
    progressByProjectId,
    syncLoading,
    restLoading,
    pullRefreshing: pullRefreshing || areasPullRefreshing,
    restLoaded: restRows != null,
    error: restError,
    reloadRest,
    reloadAreas,
    powerSyncConnected: powerSync.connected,
    powerSyncStatus: powerSync.status,
  };
}
