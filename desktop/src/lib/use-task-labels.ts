import { useCallback, useEffect, useMemo, useState } from "react";

import { useDesktopApi } from "./api-context";
import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import { parseStringIdArray } from "./workspace/row-mappers";

export type TaskLabel = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isGroup: boolean;
  parentId: string | null;
  lastUsedAt: string | null;
  sortOrder: number;
  createdAt: string;
};

type LabelRow = {
  id: string;
  name: string | null;
  description: string | null;
  color: string | null;
  is_group: number | boolean | null;
  parent_id: string | null;
  last_used_at: string | null;
  sort_order: number | null;
  created_at: string | null;
};

const TASK_LABELS_SQL = `SELECT id, name, description, color, is_group, parent_id, last_used_at, sort_order, created_at FROM task_labels WHERE deleted_at IS NULL ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

type ApiLabel = {
  id: string;
  name: string;
  description?: string | null;
  color: string | null;
  isGroup?: boolean;
  parentId?: string | null;
  lastUsedAt?: string | null;
  sortOrder: number;
  createdAt?: string;
};

export type TaskLabelWrite = {
  name?: string;
  color?: string | null;
  description?: string | null;
  parentId?: string | null;
};

export type TaskLabelCreate = {
  name: string;
  color?: string | null;
  description?: string | null;
  parentId?: string | null;
  isGroup?: boolean;
};

function asGroupFlag(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

function mapApiLabel(label: ApiLabel): TaskLabel {
  return {
    id: label.id,
    name: label.name,
    description: label.description ?? null,
    color: label.color ?? null,
    isGroup: Boolean(label.isGroup),
    parentId: label.parentId ?? null,
    lastUsedAt: label.lastUsedAt ?? null,
    sortOrder: label.sortOrder,
    createdAt: label.createdAt ?? new Date(0).toISOString(),
  };
}

function localFields(label: ApiLabel): Record<string, unknown> {
  return {
    name: label.name,
    description: label.description ?? null,
    color: label.color,
    is_group: label.isGroup ? 1 : 0,
    parent_id: label.parentId ?? null,
    last_used_at: label.lastUsedAt ?? null,
    sort_order: label.sortOrder,
  };
}

/**
 * Workspace task labels. REST is the write path; PowerSync is the live list
 * once the table is on the client. Remote fills in until that download lands.
 */
export function useTaskLabels() {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const local = usePowerSyncQuery<LabelRow>(TASK_LABELS_SQL);
  const [remote, setRemote] = useState<TaskLabel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshRemote = useCallback(async () => {
    try {
      const body = await client.requestJson<{ labels: ApiLabel[] }>(
        "/api/v1/task-labels",
      );
      setRemote(body.labels.map(mapApiLabel));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load labels");
    }
  }, [client]);

  useEffect(() => {
    void refreshRemote();
  }, [refreshRemote]);

  const labels = useMemo(() => {
    const byId = new Map<string, TaskLabel>();
    if (local.data && !local.error) {
      for (const row of local.data) {
        const name = row.name?.trim();
        if (!row.id || !name) continue;
        byId.set(row.id, {
          id: row.id,
          name,
          description: row.description?.trim() || null,
          color: row.color ?? null,
          isGroup: asGroupFlag(row.is_group),
          parentId: row.parent_id ?? null,
          lastUsedAt: row.last_used_at ?? null,
          sortOrder: row.sort_order ?? 0,
          createdAt: row.created_at ?? new Date(0).toISOString(),
        });
      }
    }
    for (const label of remote ?? []) {
      if (!byId.has(label.id)) byId.set(label.id, label);
    }
    return [...byId.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [local.data, local.error, remote]);

  const options = useMemo(
    () =>
      labels
        .filter((label) => !label.isGroup)
        .map((label) => ({ value: label.id, label: label.name })),
    [labels],
  );

  const createLabel = useCallback(
    async (input: TaskLabelCreate) => {
      const trimmed = input.name.trim().replace(/\s+/g, " ");
      if (!trimmed) return;
      setBusy(true);
      setError(null);
      try {
        const created = await client.requestJson<ApiLabel>("/api/v1/task-labels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            ...(input.color !== undefined ? { color: input.color } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
            ...(input.isGroup ? { isGroup: true } : {}),
          }),
        });
        if (powerSync.ready && powerSync.createMetadata) {
          try {
            await powerSync.createMetadata(
              "task_labels",
              localFields(created),
              created.id,
            );
          } catch (cause) {
            console.warn("[desktop] local task label insert failed", cause);
          }
        }
        await refreshRemote();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not add label");
        throw cause;
      } finally {
        setBusy(false);
      }
    },
    [client, powerSync, refreshRemote],
  );

  const updateLabel = useCallback(
    async (id: string, patch: TaskLabelWrite) => {
      const body: TaskLabelWrite = { ...patch };
      if (body.name !== undefined) {
        body.name = body.name.trim().replace(/\s+/g, " ");
        if (!body.name) return;
      }
      setBusy(true);
      setError(null);
      try {
        const updated = await client.requestJson<ApiLabel>(
          `/api/v1/task-labels/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (powerSync.ready && powerSync.patchMetadata) {
          try {
            await powerSync.patchMetadata("task_labels", id, localFields(updated));
          } catch (cause) {
            console.warn("[desktop] local task label update failed", cause);
          }
        }
        await refreshRemote();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update label");
        throw cause;
      } finally {
        setBusy(false);
      }
    },
    [client, powerSync, refreshRemote],
  );

  const deleteLabel = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await client.requestJson<void>(
          `/api/v1/task-labels/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (powerSync.ready && powerSync.patchMetadata && powerSync.database) {
          try {
            const children = await powerSync.database.getAll<{ id: string }>(
              `SELECT id FROM task_labels WHERE parent_id = ? AND deleted_at IS NULL`,
              [id],
            );
            for (const child of children) {
              await powerSync.patchMetadata("task_labels", child.id, {
                parent_id: null,
              });
            }
            const rows = await powerSync.database.getAll<{
              id: string;
              label_ids: string | null;
            }>(
              `SELECT id, label_ids FROM tasks WHERE deleted_at IS NULL AND instr(label_ids, ?) > 0`,
              [id],
            );
            for (const row of rows) {
              const next = parseStringIdArray(row.label_ids).filter(
                (entry) => entry !== id,
              );
              if (next.length === parseStringIdArray(row.label_ids).length) {
                continue;
              }
              await powerSync.patchMetadata("tasks", row.id, {
                label_ids: JSON.stringify(next),
              });
            }
            await powerSync.patchMetadata("task_labels", id, {
              deleted_at: new Date().toISOString(),
            });
          } catch (cause) {
            console.warn("[desktop] local task label delete failed", cause);
          }
        }
        await refreshRemote();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete label");
        throw cause;
      } finally {
        setBusy(false);
      }
    },
    [client, powerSync, refreshRemote],
  );

  return {
    labels,
    options,
    error,
    busy,
    loading: local.data == null && remote == null,
    createLabel,
    updateLabel,
    deleteLabel,
  };
}
