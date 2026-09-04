import { taskInvolvesContact } from "@backsteros/contracts";
import type { Contact, Project, Task } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
} from "react-native";

import { taskDetailHref } from "../lib/detail-href";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
import {
  contactsByIdFromList,
  mapApiTaskToRow,
  withDisplayId,
} from "../lib/map-task-row";
import { getTaskStatusHeaderGradient } from "../lib/status-header-gradient";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { groupTasksByStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import type { GroupedTaskRow } from "./grouped-task-list";
import {
  StatusGroupEmptySectionGap,
  StatusGroupHeader,
} from "./status-group-header";
import { TaskPropertyPills } from "./task-property-pills";
import { TaskStatusIcon } from "./task-status-icon";

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

type Section = {
  key: string;
  title: string;
  status: string;
  data: GroupedTaskRow[];
};

/** Assignee, linked contact, or Related (JSON id array in SQLite text). */
const TASKS_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL
   AND t.habit_id IS NULL
   AND (
     t.contact_id = ?
     OR t.assignee_id = ?
     OR (
       t.related_contact_ids IS NOT NULL
       AND t.related_contact_ids LIKE '%"' || ? || '"%'
     )
   )
 ORDER BY t.sort_order ASC, t.updated_at DESC`;

const STATUS_ICON_SIZE = 20;

/**
 * Contact Tasks — RN SectionList (not FlashList).
 * FlashList v2.0.2 infinite-layout loops on this embedded pane.
 */
export function ContactTasksPanel({ contactId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

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
      params: [contactId, contactId, contactId],
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

  const sections = useMemo<Section[]>(
    () =>
      groupTasksByStatus(rows, { includeEmpty: true }).map((group) => ({
        key: group.status,
        title: group.label,
        status: group.status,
        data: collapsed.has(group.status) ? [] : group.tasks,
      })),
    [collapsed, rows],
  );

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      router.push(taskDetailHref(row.id));
    },
    [router],
  );

  const toggleStatus = useCallback((status: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

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
      <SectionList
        style={ui.screen}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => {
              void reload();
            }}
          />
        }
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <Text style={ui.empty}>No tasks for this contact.</Text>
        }
        renderSectionHeader={({ section }) => (
          <StatusGroupHeader
            title={section.title}
            icon={<TaskStatusIcon status={section.status} size={14} />}
            gradient={getTaskStatusHeaderGradient(section.status)}
            collapsed={collapsed.has(section.status)}
            onToggle={() => toggleStatus(section.status)}
            onAdd={() => {
              setCollapsed((current) => {
                const next = new Set(current);
                next.delete(section.status);
                return next;
              });
              router.push({
                pathname: "/create/task",
                params: { contactId, status: section.status },
              });
            }}
          />
        )}
        renderSectionFooter={({ section }) => {
          if (section.data.length > 0) return null;
          const index = sections.findIndex((entry) => entry.key === section.key);
          if (index < 0 || index >= sections.length - 1) return null;
          return <StatusGroupEmptySectionGap />;
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPressRow(item)}
            style={({ pressed }) => [
              ui.row,
              pressed ? { backgroundColor: colors.rowPressed } : null,
            ]}
          >
            <View style={ui.rowIcon}>
              <TaskStatusIcon status={item.status} size={STATUS_ICON_SIZE} />
            </View>
            <View style={ui.rowBody}>
              <View style={ui.rowTitleLine}>
                <Text style={ui.rowTitle} numberOfLines={1} ellipsizeMode="tail">
                  {item.title ?? "Untitled"}
                </Text>
                {item.display_id ? (
                  <Text style={ui.rowId}>{item.display_id}</Text>
                ) : null}
              </View>
              <TaskPropertyPills row={item} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
