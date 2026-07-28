import { useEffect, useRef } from "react";

import { formatTaskDisplayId, INBOX_TASK_KEY } from "@backsteros/ui";
import type { TaskItemRowTask } from "@backsteros/ui";

import {
  buildAgentStatusNotification,
  collectAgentAttentionTransitions,
} from "./agent-status-notifications";

async function showDesktopNotification(title: string, body: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;
    new Notification(title, { body });
  } catch {
    // Permission / unsupported environment — ignore.
  }
}

function displayIdForTask(task: TaskItemRowTask): string | null {
  if (!task.number) return null;
  const key = task.projectKey?.trim() || INBOX_TASK_KEY;
  return formatTaskDisplayId(key, task.number);
}

/**
 * Watch workspace tasks and fire a desktop notification when an agent (or
 * another client) moves a task into In Review or On Hold.
 */
export function useAgentAttentionNotifications(
  tasks: readonly TaskItemRowTask[],
) {
  const previousRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const nextMap = new Map<string, string>();
    for (const task of tasks) {
      nextMap.set(task.id, task.status);
    }

    const previous = previousRef.current;
    previousRef.current = nextMap;
    if (!previous) return;

    const transitions = collectAgentAttentionTransitions({
      previous,
      next: tasks.map((task) => ({
        id: task.id,
        status: task.status,
        title: task.title,
        displayId: displayIdForTask(task),
      })),
    });

    for (const transition of transitions) {
      const notification = buildAgentStatusNotification(transition);
      void showDesktopNotification(notification.title, notification.body);
    }
  }, [tasks]);
}
