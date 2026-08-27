import type {
  ProjectFsCreateEntryResponse,
  ProjectFsDeleteEntryResponse,
  ProjectFsEntry,
  ProjectFsListEntriesResponse,
} from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, spacing } from "../../lib/theme";
import { useLocalQuery } from "../../lib/use-local-query";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { FileTypeIcon } from "../file-type-icon";
import { BacksterFlashList } from "../lists/index";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "../property-option-sheet";
import { PropertyTextSheet } from "../property-text-sheet";
import { GithubEmptyState } from "./github-empty-state";

type ProjectWdRow = {
  local_working_directory: string | null;
};

const WD_SQL = `SELECT local_working_directory FROM projects
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

type Props = {
  projectId: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onClearSelection?: () => void;
  /** Bumped after create/delete so parent can refresh editor. */
  onTreeChanged?: () => void;
  /** Parent FAB — open the create file/folder picker (phone). */
  filesCreateSignal?: number;
};

/** Browse / create / delete under the host working directory via Core FS API. */
export function ProjectFsTree({
  projectId,
  selectedPath,
  onSelectFile,
  onClearSelection,
  onTreeChanged,
  filesCreateSignal = 0,
}: Props) {
  const client = useMobileApiClient();
  const { data: wdRows } = useLocalQuery<ProjectWdRow>(WD_SQL, [projectId]);
  const hasWorkingDirectory = Boolean(
    wdRows?.[0]?.local_working_directory?.trim(),
  );

  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<ProjectFsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<"file" | "directory" | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [kindPickerOpen, setKindPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!hasWorkingDirectory) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (currentPath) query.set("path", currentPath);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const body = await client.requestJson<ProjectFsListEntriesResponse>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/fs/entries${suffix}`,
      );
      setEntries(body.entries ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not list files.",
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [client, currentPath, hasWorkingDirectory, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!filesCreateSignal) return;
    setKindPickerOpen(true);
  }, [filesCreateSignal]);

  const breadcrumbs = currentPath
    ? currentPath.split("/").filter(Boolean)
    : [];

  function navigateUp() {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  }

  async function createEntry(name: string, kind: "file" | "directory") {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await client.requestJson<ProjectFsCreateEntryResponse>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/fs/entries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parent: currentPath,
            name: trimmed,
            kind,
          }),
        },
      );
      await load();
      onTreeChanged?.();
      if (kind === "file") onSelectFile(created.path);
    } catch (reason) {
      Alert.alert(
        "Could not create",
        reason instanceof Error ? reason.message : "Create failed.",
      );
    }
  }

  function confirmDelete(entry: ProjectFsEntry) {
    Alert.alert(
      `Delete ${entry.kind}?`,
      `Delete “${entry.name}”? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await client.requestJson<ProjectFsDeleteEntryResponse>(
                  `/api/v1/projects/${encodeURIComponent(projectId)}/fs/entries?path=${encodeURIComponent(entry.path)}`,
                  { method: "DELETE" },
                );
                if (selectedPath === entry.path || selectedPath?.startsWith(`${entry.path}/`)) {
                  onClearSelection?.();
                }
                await load();
                onTreeChanged?.();
              } catch (reason) {
                Alert.alert(
                  "Could not delete",
                  reason instanceof Error ? reason.message : "Delete failed.",
                );
              }
            })();
          },
        },
      ],
    );
  }

  const kindOptions: PropertyOption<"file" | "directory">[] = [
    { value: "file", label: "New file" },
    { value: "directory", label: "New folder" },
  ];

  if (!hasWorkingDirectory) {
    return (
      <GithubEmptyState
        title="No working directory"
        message="Set a working directory for this project on desktop, then reopen Files here."
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={navigateUp}
          disabled={!currentPath}
          style={({ pressed }) => [
            styles.toolButton,
            !currentPath ? styles.toolDisabled : null,
            pressed && currentPath ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go up"
        >
          <Text style={styles.toolLabel}>Up</Text>
        </Pressable>
        <Pressable
          onPress={() => setKindPickerOpen(true)}
          style={({ pressed }) => [
            styles.toolButton,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create file or folder"
        >
          <Text style={styles.toolLabel}>New</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void load();
          }}
          style={({ pressed }) => [
            styles.toolButton,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          <Text style={styles.toolLabel}>Refresh</Text>
        </Pressable>
      </View>

      <Text style={styles.pathLabel} numberOfLines={1}>
        {currentPath || "/"}
      </Text>

      {breadcrumbs.length > 0 ? (
        <View style={styles.crumbs}>
          <Pressable onPress={() => setCurrentPath("")}>
            <Text style={styles.crumb}>root</Text>
          </Pressable>
          {breadcrumbs.map((segment, index) => {
            const path = breadcrumbs.slice(0, index + 1).join("/");
            return (
              <Pressable key={path} onPress={() => setCurrentPath(path)}>
                <Text style={styles.crumb}> / {segment}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {loading && entries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : error ? (
        <GithubEmptyState
          title="Could not list files"
          message={error}
          actionLabel="Retry"
          onAction={() => {
            void load();
          }}
        />
      ) : (
        <BacksterFlashList
          embedded
          data={entries}
          keyExtractor={(item) => item.path}
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>This folder is empty.</Text>
          }
          renderItem={({ item }) => {
            const selected = item.path === selectedPath;
            return (
              <Pressable
                onPress={() => {
                  if (item.kind === "directory") {
                    setCurrentPath(item.path);
                    return;
                  }
                  onSelectFile(item.path);
                }}
                onLongPress={() => confirmDelete(item)}
                style={({ pressed }) => [
                  styles.row,
                  selected ? styles.rowSelected : null,
                  pressed && !selected
                    ? { backgroundColor: colors.rowPressed }
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityHint="Long press to delete"
              >
                <View style={styles.rowIcon}>
                  <FileTypeIcon
                    pathValue={item.path}
                    kind={item.kind === "directory" ? "directory" : "file"}
                    size={16}
                  />
                </View>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <PropertyOptionSheet
        visible={kindPickerOpen}
        title="Create"
        options={kindOptions}
        selected={"file" as "file" | "directory"}
        onSelect={(value) => {
          if (!value) return;
          setCreateKind(value);
          setCreateOpen(true);
        }}
        onClose={() => setKindPickerOpen(false)}
      />
      <PropertyTextSheet
        visible={createOpen}
        title={createKind === "directory" ? "New folder" : "New file"}
        value=""
        placeholder={createKind === "directory" ? "folder-name" : "file.ts"}
        autoCapitalize="none"
        onSave={(value) => {
          const kind = createKind ?? "file";
          setCreateOpen(false);
          setCreateKind(null);
          void createEntry(value, kind);
        }}
        onClose={() => {
          setCreateOpen(false);
          setCreateKind(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  toolbar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.screenX,
    paddingTop: 10,
    paddingBottom: 6,
  },
  toolButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  toolDisabled: {
    opacity: 0.4,
  },
  toolLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  pathLabel: {
    paddingHorizontal: spacing.screenX,
    color: colors.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  crumbs: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.screenX,
    marginBottom: 6,
  },
  crumb: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  list: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    padding: spacing.screenX,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: {
    backgroundColor: "rgba(238, 122, 71, 0.12)",
  },
  rowIcon: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
});
