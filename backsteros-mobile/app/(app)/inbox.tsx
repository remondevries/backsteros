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

export default function InboxScreen() {
  const { getToken, signOut } = useAuth();
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
    `SELECT id, title, status FROM tasks
     WHERE deleted_at IS NULL AND inbox = 1
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
      const data = await client.requestJson<{ tasks: Task[] }>(
        "/api/v1/tasks/inbox",
      );
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

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#eee",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Text style={{ color: "#666", fontSize: 13, flex: 1 }}>
          {powerSync.message}
        </Text>
        <Pressable onPress={() => void signOut()}>
          <Text style={{ fontWeight: "600" }}>Sign out</Text>
        </Pressable>
      </View>
      {patchError ? (
        <Text style={{ paddingHorizontal: 16, paddingTop: 8, color: "#b91c1c" }}>
          {patchError}
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={{ padding: 16, color: "#b91c1c" }}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshing={useRest ? restLoading : false}
          onRefresh={() => {
            if (useRest) void reloadRest();
            else void powerSync.retry();
          }}
          ListEmptyComponent={
            <Text style={{ padding: 16, color: "#666" }}>Inbox is empty.</Text>
          }
          ListHeaderComponent={
            <Text style={{ padding: 16, color: "#666", fontSize: 12 }}>
              Tap to cycle status — queued offline via PowerSync when connected.
            </Text>
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
              <Text style={{ fontWeight: "600" }}>
                {item.title ?? "Untitled"}
              </Text>
              <Text style={{ color: "#666", marginTop: 2, fontSize: 13 }}>
                {item.status ?? "todo"}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
