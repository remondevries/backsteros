import { useEffect, useRef } from "react";
import { Alert } from "react-native";

import {
  buildAgentStatusNotification,
  collectAgentAttentionTransitions,
} from "./agent-status-notifications";
import { TASK_LIST_SELECT } from "./task-list-query";
import { useLocalQuery } from "./use-local-query";
import { withDisplayId } from "./map-task-row";

type WatchedTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  display_id?: string | null;
  number?: number | null;
  project_key?: string | null;
  contact_id?: string | null;
};

/**
 * Watch synced tasks and alert when another actor moves a task into
 * In Review or On Hold (foreground awareness on iOS).
 */
export function useAgentAttentionNotifications() {
  const { data } = useLocalQuery<WatchedTaskRow>(
    `${TASK_LIST_SELECT}
     WHERE t.deleted_at IS NULL
       AND t.status IN ('on_hold', 'in_review', 'in_progress', 'ready_to_start')
     ORDER BY t.updated_at DESC
     LIMIT 200`,
  );
  const previousRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const rows = (data ?? []).map((row) => withDisplayId(row));
    const nextMap = new Map<string, string>();
    for (const row of rows) {
      if (row.status) nextMap.set(row.id, row.status);
    }

    const previous = previousRef.current;
    previousRef.current = nextMap;
    if (!previous) return;

    const transitions = collectAgentAttentionTransitions({
      previous,
      next: rows.map((row) => ({
        id: row.id,
        status: row.status ?? "",
        title: row.title ?? "Task",
        displayId: row.display_id ?? null,
      })),
    });

    for (const transition of transitions) {
      const notification = buildAgentStatusNotification(transition);
      Alert.alert(notification.title, notification.body);
    }
  }, [data]);
}
