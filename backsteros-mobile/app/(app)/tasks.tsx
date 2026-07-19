import { createApiClient, createClerkTokenProvider } from "@backsteros/api-client";
import type { Task } from "@backsteros/contracts";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";

import { getMobileEnvironment } from "../../lib/env";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { useLocalQuery } from "../../lib/use-local-query";

type TaskRow = {
  id: string;
  number: number | null;
  title: string | null;
  status: string | null;
};

const STATUS_CYCLE = ["todo", "in_progress", "done"] as const;

function nextStatus(current: string | null | undefined): string {
  const index = STATUS_CYCLE.indexOf(
    (current ?? "todo") as (typeof STATUS_CYCLE)[number],
  );
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length] ?? "todo";
}

export default function TasksScreen() {
  const { getToken } = useAuth();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: createClerkTokenProvider(getToken),
      }),
    [apiUrl, getToken],
  );

  const { data: syncedTasks, isLoading: syncLoading } = useLocalQuery<TaskRow>(
    `SELECT id, number, title, status FROM tasks
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, updated_at DESC`,
  );

  const [restTasks, setRestTasks] = useState<Task[]>([]);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const useRest = !powerSync.ready;

  const reloadRest = useCallback(async () => {
    if (!useRest) return;
    setRestLoading(true);
    setRestError(null);
    try {
      const data = await client.requestJson<{ tasks: Task[] }>("/api/v1/tasks");
      setRestTasks(data.tasks ?? []);
    } catch (reason) {
      setRestError(reason instanceof Error ? reason.message : String(reason));
      setRestTasks([]);
    } finally {
      setRestLoading(false);
    }
  }, [client, useRest]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const rows: TaskRow[] = useRest
    ? restTasks.map((task) => ({
        id: task.id,
        number: task.number,
        title: task.title,
        status: task.status,
      }))
    : (syncedTasks ?? []);

  const loading = useRest ? restLoading : syncLoading && rows.length === 0;
  const error = useRest ? restError : null;

  const onCycleStatus = async (row: TaskRow) => {
    setPatchError(null);
    const status = nextStatus(row.status);
    const completed_at = status === "done" ? new Date().toISOString() : null;
    try {
      if (powerSync.ready) {
        await powerSync.patchTask(row.id, { status, completed_at });
        return;
      }
      await client.requestJson(`/api/v1/tasks/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, completedAt: completed_at }),
      });
      await reloadRest();
    } catch (reason) {
      setPatchError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 24 }} />;
  }

  if (error) {
    return <Text style={{ padding: 16, color: "#b91c1c" }}>{error}</Text>;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      refreshing={useRest ? restLoading : false}
      onRefresh={() => {
        if (useRest) void reloadRest();
        else void powerSync.retry();
      }}
      ListEmptyComponent={
        <Text style={{ padding: 16, color: "#666" }}>No tasks yet.</Text>
      }
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 4 }}>
          <Text style={{ color: "#666", fontSize: 13 }}>
            {powerSync.message}
            {useRest ? " · REST" : " · local SQLite"}
          </Text>
          <Text style={{ color: "#666", fontSize: 12 }}>
            Tap a task to cycle status (works offline when synced).
          </Text>
          {patchError ? (
            <Text style={{ color: "#b91c1c", fontSize: 12 }}>{patchError}</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => void onCycleStatus(item)}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: "#f0f0f0",
          }}
        >
          <Text style={{ fontWeight: "600" }}>{item.title ?? "Untitled"}</Text>
          <Text style={{ color: "#666", marginTop: 2, fontSize: 13 }}>
            #{item.number ?? "—"} · {item.status ?? "todo"}
          </Text>
        </Pressable>
      )}
    />
  );
}
