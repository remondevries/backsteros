import type { Contact, Project, Task } from "@backsteros/contracts";
import {
  meetingBelongsInInbox,
  meetingInboxItemId,
} from "@backsteros/contracts";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { useAgentMail } from "../lib/agentmail-context";
import { isPadDevice } from "../lib/device";
import { formatEmailDisplayId } from "../lib/email-display-id";
import { formatMeetingDisplayId } from "../lib/meeting-display-id";
import {
  emailBelongsInInbox,
  emailPartyLabel,
  resolveEmailListItemStatus,
} from "../lib/email-list";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
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
import { useRestReloadFlags } from "../lib/use-rest-reload-flags";
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
  if (!segment || segment === "new" || segment === "email") return null;
  return segment;
}

/** `/inbox/email/<inboxId>/<messageId>` → email row id / null. */
export function inboxSelectedEmailRowIdFromPathname(
  pathname: string,
): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/inbox\/email\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const inboxId = decodeURIComponent(match[1] ?? "");
  const messageId = decodeURIComponent(match[2] ?? "");
  if (!inboxId || !messageId || messageId === "compose") return null;
  return `email::${inboxId}::${messageId}`;
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

type InboxMeetingSyncedRow = {
  id: string;
  number: number | null;
  title: string | null;
  status: string | null;
  start_at: string | null;
  project_id: string | null;
  organization_id: string | null;
  project_name?: string | null;
  project_key?: string | null;
  project_icon?: string | null;
  project_type?: string | null;
  organization_name?: string | null;
};

const INBOX_MEETINGS_SQL = `
SELECT
  m.id,
  m.number,
  m.title,
  m.status,
  m.start_at,
  m.project_id,
  m.organization_id,
  p.name AS project_name,
  p.key AS project_key,
  p.icon AS project_icon,
  p.type AS project_type,
  o.name AS organization_name
FROM meetings m
LEFT JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
LEFT JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
WHERE m.deleted_at IS NULL
  AND m.status = 'triage'
ORDER BY m.start_at ASC, m.updated_at DESC
`;

type InboxSyncedRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  project_key?: string | null;
  inbox?: boolean | number | null;
  agent_created_at?: string | null;
  agent_inbox_approved_at?: string | null;
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
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const isPad = isPadDevice();

  const pathSelectedId =
    selectedId ??
    inboxSelectedIdFromPathname(pathname) ??
    inboxSelectedEmailRowIdFromPathname(pathname);

  const { data: syncedTasks, isLoading: syncLoading } = useLocalQuery<
    InboxSyncedRow
  >(
    `${TASK_LIST_SELECT}
     WHERE t.deleted_at IS NULL AND (
       t.inbox = 1
       OR (
         t.agent_created_at IS NOT NULL
         AND t.agent_inbox_approved_at IS NULL
       )
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

  const { data: syncedMeetings, isLoading: meetingsSyncLoading } =
    useLocalQuery<InboxMeetingSyncedRow>(INBOX_MEETINGS_SQL);

  const [restRows, setRestRows] = useState<GroupedTaskRow[] | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  } = useRestReloadFlags();

  const localRows = useMemo(
    () =>
      (syncedTasks ?? [])
        .filter((row) =>
          taskBelongsInInbox({
            inbox: row.inbox,
            status: row.status,
            due_date: row.due_date,
            agent_created_at: row.agent_created_at,
            agent_inbox_approved_at: row.agent_inbox_approved_at,
          }),
        )
        .map((row) => withDisplayId(row)),
    [syncedTasks],
  );

  const reloadRest = useCallback(async (opts?: { userPull?: boolean }) => {
    const userPull = beginReload(opts);
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
              agentCreatedAt: task.agentCreatedAt,
              agentInboxApprovedAt: task.agentInboxApprovedAt,
            }),
          )
          .map((task) => mapApiTaskToRow(task, projectsById, contactsById)),
      );
      markHydrated();
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        isNetworkError(detail) ? formatNetworkError() : detail,
      );
      // Keep prior REST snapshot on transient failures.
    } finally {
      endReload(userPull);
    }
  }, [beginReload, client, endReload, formatNetworkError, isNetworkError, markHydrated]);

  useRestListHydration(reloadRest, true, localRows.length > 0);

  const taskRows = useMemo(
    () =>
      resolveSyncedOrRestRows({
        localRows,
        restRows,
        connected: powerSync.connected,
      }),
    [localRows, powerSync.connected, restRows],
  );

  // Email thread rows alongside tasks — desktop inbox parity.
  const { messages: emailMessages } = useAgentMail();
  const emailRows = useMemo<GroupedTaskRow[]>(
    () =>
      emailMessages
        .filter((item) =>
          emailBelongsInInbox({ status: item.status, dueDate: item.dueDate }),
        )
        .map((item) => ({
          id: `email::${item.inboxId}::${item.id}`,
          title: item.subject?.trim() || "(no subject)",
          status: resolveEmailListItemStatus(item),
          priority: item.priority ?? 0,
          due_date: item.dueDate ?? null,
          project_name: item.projectName ?? null,
          project_key: item.projectKey ?? null,
          display_id:
            item.displayId ??
            (item.number != null ? formatEmailDisplayId(item.number) : null),
          item_type: "email" as const,
          email_from: item.contactName?.trim() || emailPartyLabel(item.from),
          email_inbox_id: item.inboxId,
          email_message_id: item.id,
        })),
    [emailMessages],
  );

  const meetingRows = useMemo<GroupedTaskRow[]>(
    () =>
      (syncedMeetings ?? [])
        .filter((row) => meetingBelongsInInbox({ status: row.status }))
        .map((row) => ({
          id: meetingInboxItemId(row.id),
          title: row.title?.trim() || "Untitled meeting",
          status: row.status,
          priority: 0,
          due_date: row.start_at,
          project_name: row.project_name ?? null,
          project_key: row.project_key ?? null,
          project_icon: row.project_icon ?? null,
          project_type: row.project_type ?? null,
          display_id: formatMeetingDisplayId(row.number),
          item_type: "meeting" as const,
          meeting_id: row.id,
        })),
    [syncedMeetings],
  );

  const rows = useMemo(
    () => [...taskRows, ...emailRows, ...meetingRows],
    [emailRows, meetingRows, taskRows],
  );

  const waitingForSync =
    rows.length === 0 &&
    restRows == null &&
    (powerSync.status === "connecting" ||
      powerSync.status === "idle" ||
      syncLoading ||
      meetingsSyncLoading);

  const loading =
    rows.length === 0 &&
    (restLoading || waitingForSync || syncLoading || meetingsSyncLoading);
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
    if (first.item_type === "email") return;
    if (first.item_type === "meeting" && first.meeting_id) {
      router.replace(`/meeting/${encodeURIComponent(first.meeting_id)}`);
      return;
    }
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
      if (row.item_type === "meeting" && row.meeting_id) {
        router.push(`/meeting/${encodeURIComponent(row.meeting_id)}`);
        return;
      }
      if (row.item_type === "email" && row.email_inbox_id && row.email_message_id) {
        // Open inside the Inbox stack — desktop shows email in the inbox pane.
        const href =
          `/(app)/inbox/email/${encodeURIComponent(row.email_inbox_id)}/${encodeURIComponent(row.email_message_id)}` as const;
        if (isPad) {
          router.replace(href);
          return;
        }
        router.push(href);
        return;
      }
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
      refreshing={pullRefreshing}
      onRefresh={() => void reloadRest({ userPull: true })}
      onPressRow={onPressRow}
    />
  );
}
