import { taskInvolvesContact } from "@backsteros/contracts";
import type { Contact, Project, Task } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { taskDetailHref } from "../lib/detail-href";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
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
import { GroupedTaskList, type GroupedTaskRow } from "./grouped-task-list";

type SyncedTaskRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  assignee_id?: string | null;
  related_contact_ids?: string | null;
  project_key?: string | null;
};

type Props = {
  contactId: string;
};

/**
 * Avoid selecting/filtering `related_contact_ids` locally — that column may be
 * missing until schema migrate finishes; REST hydrate still returns Related.
 */
const TASKS_SQL = `${TASK_LIST_SELECT.replace(
  /^\s*t\.related_contact_ids,\n/m,
  "  NULL AS related_contact_ids,\n",
)}
 WHERE t.deleted_at IS NULL
   AND t.habit_id IS NULL
   AND (t.contact_id = ? OR t.assignee_id = ?)
 ORDER BY t.sort_order ASC, t.updated_at DESC`;

/** Tasks assigned to / linked to / Related to a contact. */
export function ContactTasksPanel({ contactId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();

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
      params: [contactId, contactId],
      mapLocal: (synced) => synced.map((row) => withDisplayId(row)),
      fetchRest: async () => {
        try {
          const [byContact, byAssignee, byRelated, projectsBody, contactsBody] =
            await Promise.all([
              client.requestJson<{ tasks: Task[] }>(
                `/api/v1/tasks?contactId=${encodeURIComponent(contactId)}`,
              ),
              client.requestJson<{ tasks: Task[] }>(
                `/api/v1/tasks?assigneeId=${encodeURIComponent(contactId)}`,
              ),
              client.requestJson<{ tasks: Task[] }>(
                `/api/v1/tasks?relatedContactId=${encodeURIComponent(contactId)}`,
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
          const byId = new Map<string, Task>();
          for (const task of [
            ...(byContact.tasks ?? []),
            ...(byAssignee.tasks ?? []),
            ...(byRelated.tasks ?? []),
          ]) {
            byId.set(task.id, task);
          }
          return [...byId.values()]
            .filter(
              (task) =>
                !task.habitId && taskInvolvesContact(task, contactId),
            )
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
    <GroupedTaskList
      rows={rows}
      emptyText="No tasks for this contact."
      refreshing={pullRefreshing}
      onRefresh={() => {
        void reload();
      }}
      onPressRow={onPressRow}
      onAddToStatus={(status) => {
        router.push({
          pathname: "/create/task",
          params: { contactId, status },
        });
      }}
    />
  );
}
