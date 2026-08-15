import type { Contact, Project, Task } from "@backsteros/contracts";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { isPadDevice } from "../lib/device";
import { getMobileEnvironment } from "../lib/env";
import { taskBelongsInInbox } from "../lib/inbox-attention";
import {
  contactsByIdFromList,
  mapApiTaskToRow,
  withDisplayId,
} from "../lib/map-task-row";
import { normalizePathname } from "../lib/use-escape-back-navigation";
import { useMobilePowerSync } from "../lib/powersync-context";
import { resolveSyncedOrRestRows } from "../lib/resolve-synced-or-rest-rows";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useRestListHydration } from "../lib/use-rest-list-hydration";
import {
  GroupedTaskList,
  type GroupedTaskRow,
} from "./grouped-task-list";

/** `/inbox/<id>` or `/inbox/new` → id / null. */
export function inboxSelectedIdFromPathname(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/inbox\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1];
  if (!segment || segment === "new") return null;
  return segment;
}

type Props = {
  /** When set, highlight that row (iPad master-detail selection). */
  selectedId?: string | null;
  /** Override row press (defaults to inbox detail navigation). */
  onPressRow?: (row: GroupedTaskRow) => void;
  /**
   * When true (iPad split), open the first inbox item if none is selected —
   * desktop inbox auto-select parity.
   */
  autoSelectFirst?: boolean;
};

type InboxSyncedRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  project_key?: string | null;
  inbox?: boolean | number | null;
};

/**
 * Inbox task list — shared by phone full-screen and iPad left pane.
 * Includes triage capture, On Hold / In Review, and overdue (past due).
 */
export function InboxListPane({
  selectedId = null,
  onPressRow: onPressRowProp,
  autoSelectFirst = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const isPad = isPadDevice();

  const pathSelectedId = selectedId ?? inboxSelectedIdFromPathname(pathname);

  const { data: syncedTasks, isLoading: syncLoading } = useLocalQuery<
    InboxSyncedRow
  >(
    `${TASK_LIST_SELECT}
     WHERE t.deleted_at IS NULL AND (
       t.inbox = 1
       OR (
         t.status IN ('on_hold', 'in_review')
         AND (
           t.due_date IS NULL
           OR date(t.due_date) <= date('now', 'localtime')
         )
       )
       OR (
         t.due_date IS NOT NULL
         AND date(t.due_date) < date('now', 'localtime')
         AND t.status NOT IN ('completed', 'canceled', 'duplicated')
       )
     )
     ORDER BY t.sort_order ASC, t.updated_at DESC`,
  );

  const [restRows, setRestRows] = useState<GroupedTaskRow[] | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const localRows = useMemo(
    () =>
      (syncedTasks ?? [])
        .filter((row) =>
          taskBelongsInInbox({
            inbox: row.inbox,
            status: row.status,
            due_date: row.due_date,
          }),
        )
        .map((row) => withDisplayId(row)),
    [syncedTasks],
  );

  const reloadRest = useCallback(async () => {
    setRestLoading(true);
    setRestError(null);
    try {
      const [tasksBody, projectsBody, contactsBody] = await Promise.all([
        client.requestJson<{ tasks: Task[] }>("/api/v1/tasks/inbox"),
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
        client
          .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
          .catch(() => ({ contacts: [] as Contact[] })),
      ]);
      const projectsById = new Map(
        (projectsBody.projects ?? []).map((project) => [project.id, project]),
      );
      const contactsById = contactsByIdFromList(contactsBody.contacts ?? []);
      setRestRows(
        (tasksBody.tasks ?? [])
          .filter((task) =>
            taskBelongsInInbox({
              inbox: task.inbox,
              status: task.status,
              dueDate: task.dueDate,
            }),
          )
          .map((task) => mapApiTaskToRow(task, projectsById, contactsById)),
      );
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
      // Keep prior REST snapshot on transient failures.
    } finally {
      setRestLoading(false);
    }
  }, [apiUrl, client]);

  useRestListHydration(reloadRest);

  const rows = resolveSyncedOrRestRows({
    localRows,
    restRows,
    connected: powerSync.connected,
  });

  const waitingForSync =
    rows.length === 0 &&
    restRows == null &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading);

  const loading =
    rows.length === 0 && (restLoading || waitingForSync || syncLoading);
  const error =
    rows.length === 0 && restError && !powerSync.connected ? restError : null;

  useEffect(() => {
    if (!autoSelectFirst || !isPad) return;
    if (loading || error) return;
    if (pathSelectedId) return;
    const normalized = normalizePathname(pathname);
    // Only auto-select while the inbox tab is active. InboxListPane stays
    // mounted under lazy tabs — without this guard, leaving Inbox (e.g. to
    // Journal) clears pathSelectedId and this effect replace()s back to inbox.
    if (!normalized.startsWith("/inbox")) return;
    if (normalized.endsWith("/inbox/new") || normalized === "/inbox/new") return;
    const first = rows[0];
    if (!first) return;
    router.replace(`/(app)/inbox/${first.id}`);
  }, [
    autoSelectFirst,
    error,
    isPad,
    loading,
    pathSelectedId,
    pathname,
    router,
    rows,
  ]);

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      if (onPressRowProp) {
        onPressRowProp(row);
        return;
      }
      if (isPad) {
        // Keep a single detail entry in the stack while switching selection.
        router.replace(`/(app)/inbox/${row.id}`);
        return;
      }
      router.push(`/(app)/inbox/${row.id}`);
    },
    [isPad, onPressRowProp, router],
  );

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{error}</Text>
      </View>
    );
  }

  return (
    <GroupedTaskList
      rows={rows}
      emptyText="Inbox is empty."
      groupByStatus="inbox"
      rowLayout="inbox"
      selectedId={pathSelectedId}
      refreshing={restLoading}
      onRefresh={() => void reloadRest()}
      onPressRow={onPressRow}
    />
  );
}
