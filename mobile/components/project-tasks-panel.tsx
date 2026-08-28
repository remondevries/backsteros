import type { Contact, Project, Task } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { taskDetailHref } from "../lib/detail-href";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
import {
  TASKS_LIST_BOARD_STORAGE_KEY,
  useListBoardView,
} from "../lib/list-board-view";
import {
  contactsByIdFromList,
  mapApiTaskToRow,
  withDisplayId,
} from "../lib/map-task-row";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { ListBoardToggle } from "./list-board-toggle";
import { TaskBoardPane } from "./list-board/task-board-pane";
import { GroupedTaskList, type GroupedTaskRow } from "./grouped-task-list";

type SyncedTaskRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  project_key?: string | null;
};

type Props = {
  projectId: string;
};

const TASKS_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL
   AND t.habit_id IS NULL
   AND t.project_id = ?
 ORDER BY t.sort_order ASC, t.updated_at DESC`;

/** Same grouped task list as the Tasks tab, scoped to one project. */
export function ProjectTasksPanel({ projectId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const { view: boardView, toggleView: toggleBoardView } = useListBoardView(
    TASKS_LIST_BOARD_STORAGE_KEY,
  );

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        isNetworkError(detail) ? formatNetworkError() : detail,
      );
    },
    [formatNetworkError, isNetworkError],
  );

  const { rows, loading, error, pullRefreshing, reload } =
    useSyncedOrRest<SyncedTaskRow, GroupedTaskRow>({
      sql: TASKS_SQL,
      params: [projectId],
      mapLocal: (synced) => synced.map((row) => withDisplayId(row)),
      fetchRest: async () => {
        try {
          const [tasksBody, projectsBody, contactsBody] = await Promise.all([
            client.requestJson<{ tasks: Task[] }>(
              `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}`,
            ),
            client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
            client
              .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
              .catch(() => ({ contacts: [] as Contact[] })),
          ]);
          const projectsById = new Map(
            (projectsBody.projects ?? []).map((project) => [
              project.id,
              project,
            ]),
          );
          const contactsById = contactsByIdFromList(
            contactsBody.contacts ?? [],
          );
          return (tasksBody.tasks ?? [])
            .filter((task) => !task.habitId && task.projectId === projectId)
            .map((task) =>
              mapApiTaskToRow(task, projectsById, contactsById),
            );
        } catch (reason) {
          return mapNetworkError(reason);
        }
      },
    });

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      router.push(taskDetailHref(row.id));
    },
    [router],
  );

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return <Text style={ui.error}>{error}</Text>;
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <ListBoardToggle view={boardView} onToggle={toggleBoardView} />
      </View>
      {boardView === "board" ? (
        <TaskBoardPane rows={rows} onPressRow={onPressRow} />
      ) : (
        <GroupedTaskList
          rows={rows}
          emptyText="No tasks in this project."
          refreshing={pullRefreshing}
          onRefresh={() => {
            void reload();
          }}
          onPressRow={onPressRow}
          onAddToStatus={(status) => {
            router.push({
              pathname: "/create/task",
              params: { projectId, status },
            });
          }}
        />
      )}
    </View>
  );
}
