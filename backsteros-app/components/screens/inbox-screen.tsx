"use client";

import type { Task as ApiTask } from "@backsteros/contracts";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { InboxDetailSkeleton } from "@/components/inbox/inbox-detail-skeleton";
import { InboxLayoutBreadcrumb } from "@/components/inbox/inbox-layout-breadcrumb";
import { TaskDetailScreen } from "@/components/screens/task-detail-screen";
import { useApiResource } from "@/lib/api-context";
import { normalizeTask } from "@/lib/entity-normalize";
import {
  getFirstInboxItemHref,
} from "@/lib/inbox/inbox-items";
import { usePowerSyncQuery } from "@/lib/powersync-context";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      key === "inbox" ? Boolean(value) : value;
  }
  return output;
}

/**
 * Main inbox content. The task list lives in the left content side panel;
 * this view shows the selected task detail (or empty / redirect state).
 */
export function InboxScreen({ selectedTaskId }: { selectedTaskId?: string }) {
  const router = useRouter();
  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson("/api/v1/tasks/inbox"),
  );
  const localTasks = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM tasks WHERE deleted_at IS NULL AND inbox = 1 ORDER BY sort_order, updated_at DESC",
  );

  const rows = useMemo(
    () =>
      localTasks.data?.map((row) => snakeRow(row) as ApiTask) ??
      tasksResource.data?.tasks ??
      [],
    [localTasks.data, tasksResource.data],
  );

  const firstHref = useMemo(() => {
    const tasks = rows.map((task) => ({
      ...normalizeTask(task),
      project: null,
      contact: null,
    }));
    return getFirstInboxItemHref(tasks, []);
  }, [rows]);

  const listLoading = tasksResource.loading && !localTasks.data;

  useEffect(() => {
    if (selectedTaskId) return;
    if (listLoading) return;
    if (firstHref) {
      router.replace(firstHref);
    }
  }, [firstHref, listLoading, router, selectedTaskId]);

  if (!selectedTaskId) {
    if (listLoading || firstHref) {
      return (
        <>
          <InboxLayoutBreadcrumb />
          <InboxDetailSkeleton />
        </>
      );
    }

    if (!rows.length) {
      return (
        <>
          <InboxLayoutBreadcrumb />
          <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-foreground/60">
            <p className="max-w-sm text-center">
              Your inbox is empty. Use capture in the side panel to add a triage
              task.
            </p>
          </div>
        </>
      );
    }

    return (
      <>
        <InboxLayoutBreadcrumb />
        <InboxDetailSkeleton />
      </>
    );
  }

  return (
    <>
      <InboxLayoutBreadcrumb />
      <TaskDetailScreen
        taskRouteParam={selectedTaskId}
        context="inbox"
        backHref="/inbox"
      />
    </>
  );
}
