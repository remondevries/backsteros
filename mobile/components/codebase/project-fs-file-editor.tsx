import type { ProjectFsFile } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAppleKeyCommand } from "../../lib/apple-key-commands";
import { colors, spacing } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { CodemirrorFileWebView } from "./codemirror-file-webview";
import { FileEditorTabBar } from "./file-editor-tab-bar";

type FileSession = {
  saved: string;
  draft: string;
  loading: boolean;
  error: string | null;
  binary: boolean;
  /** Bumped when re-seeding CM from disk / after save alignment. */
  contentEpoch: number;
  /** Bumped after successful save so CM markClean runs. */
  cleanEpoch: number;
};

type Props = {
  projectId: string;
  /** Latest path selected from the tree (opens/activates a tab). */
  openPath: string | null;
  /** Bumped when tree mutates (delete) so open files can refresh/close. */
  refreshToken?: number;
};

function emptySession(loading = true): FileSession {
  return {
    saved: "",
    draft: "",
    loading,
    error: null,
    binary: false,
    contentEpoch: 0,
    cleanEpoch: 0,
  };
}

/**
 * Multi-file CodeMirror host: native tabs + WebView CM6 + Core FS save.
 */
export function ProjectFsFileEditor({
  projectId,
  openPath,
  refreshToken = 0,
}: Props) {
  const client = useMobileApiClient();
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, FileSession>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const loadPath = useCallback(
    async (path: string) => {
      setSessions((prev) => ({
        ...prev,
        [path]: {
          ...(prev[path] ?? emptySession(true)),
          loading: true,
          error: null,
        },
      }));
      try {
        const body = await client.requestJson<ProjectFsFile>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/fs/file?path=${encodeURIComponent(path)}`,
        );
        const content = body.content ?? "";
        setSessions((prev) => {
          const prevEpoch = prev[path]?.contentEpoch ?? 0;
          return {
            ...prev,
            [path]: {
              saved: content,
              draft: content,
              loading: false,
              error: null,
              binary: body.binary,
              contentEpoch: prevEpoch + 1,
              cleanEpoch: prev[path]?.cleanEpoch ?? 0,
            },
          };
        });
      } catch (reason) {
        setSessions((prev) => ({
          ...prev,
          [path]: {
            ...(prev[path] ?? emptySession(false)),
            loading: false,
            error:
              reason instanceof Error
                ? reason.message
                : "Could not load file.",
            binary: false,
          },
        }));
      }
    },
    [client, projectId],
  );

  // Open / activate from tree selection.
  useEffect(() => {
    if (!openPath) return;
    setOpenPaths((prev) =>
      prev.includes(openPath) ? prev : [...prev, openPath],
    );
    setActivePath(openPath);
    const existing = sessionsRef.current[openPath];
    if (!existing || existing.error) {
      void loadPath(openPath);
    }
  }, [loadPath, openPath]);

  // Refresh open files after tree mutations.
  useEffect(() => {
    if (refreshToken === 0) return;
    for (const path of openPaths) {
      void loadPath(path);
    }
    // Only react to refreshToken bumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const dirtyPaths = useMemo(
    () =>
      Object.entries(sessions)
        .filter(
          ([, entry]) =>
            !entry.binary &&
            !entry.loading &&
            entry.draft !== entry.saved,
        )
        .map(([path]) => path),
    [sessions],
  );

  const activeSession = activePath ? sessions[activePath] : null;

  const savePath = useCallback(
    async (path: string) => {
      const session = sessionsRef.current[path];
      if (!session || session.binary || session.draft === session.saved) {
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const body = await client.requestJson<ProjectFsFile>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/fs/file`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path, content: session.draft }),
          },
        );
        const content = body.content ?? session.draft;
        setSessions((prev) => {
          const current = prev[path];
          if (!current) return prev;
          return {
            ...prev,
            [path]: {
              ...current,
              saved: content,
              draft: content,
              cleanEpoch: current.cleanEpoch + 1,
            },
          };
        });
      } catch (reason) {
        setSaveError(
          reason instanceof Error ? reason.message : "Could not save file.",
        );
      } finally {
        setSaving(false);
      }
    },
    [client, projectId],
  );

  const closePath = useCallback(
    (path: string) => {
      const session = sessionsRef.current[path];
      const dirty =
        session &&
        !session.binary &&
        session.draft !== session.saved;

      const finishClose = () => {
        setOpenPaths((prev) => {
          const next = prev.filter((entry) => entry !== path);
          setActivePath((current) => {
            if (current !== path) return current;
            return next[next.length - 1] ?? null;
          });
          return next;
        });
        setSessions((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      };

      if (!dirty) {
        finishClose();
        return;
      }

      Alert.alert(
        "Unsaved changes",
        `Save changes to ${path.split("/").pop() || path} before closing?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: finishClose,
          },
          {
            text: "Save",
            onPress: () => {
              void (async () => {
                await savePath(path);
                finishClose();
              })();
            },
          },
        ],
      );
    },
    [savePath],
  );

  const onEditorChange = useCallback(
    (path: string, content: string, _dirty: boolean) => {
      setSessions((prev) => {
        const current = prev[path];
        if (!current || current.draft === content) return prev;
        return {
          ...prev,
          [path]: { ...current, draft: content },
        };
      });
    },
    [],
  );

  const saveActive = useCallback(() => {
    if (!activePath) return;
    void savePath(activePath);
  }, [activePath, savePath]);

  const saveCommandCmd = useMemo(
    () => ({
      id: "codebase-file-save-cmd",
      input: "s",
      modifiers: ["command" as const],
      title: "Save File",
    }),
    [],
  );
  const saveCommandCtrl = useMemo(
    () => ({
      id: "codebase-file-save-ctrl",
      input: "s",
      modifiers: ["control" as const],
      title: "Save File",
    }),
    [],
  );

  const saveHotkeyEnabled =
    Platform.OS === "ios" &&
    Boolean(activePath) &&
    !saving &&
    !activeSession?.binary &&
    !activeSession?.loading;

  useAppleKeyCommand(saveCommandCmd, saveActive, saveHotkeyEnabled);
  useAppleKeyCommand(saveCommandCtrl, saveActive, saveHotkeyEnabled);

  if (!activePath) {
    return <ProjectFsFileEditorEmpty />;
  }

  return (
    <View style={styles.root}>
      <FileEditorTabBar
        openPaths={openPaths}
        activePath={activePath}
        dirtyPaths={dirtyPaths}
        onActivate={setActivePath}
        onClose={closePath}
      />

      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

      {activeSession?.loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : activeSession?.error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{activeSession.error}</Text>
          <Pressable
            onPress={() => {
              void loadPath(activePath);
            }}
            style={styles.retry}
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : activeSession?.binary ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            This file is binary and cannot be edited on mobile.
          </Text>
        </View>
      ) : (
        <CodemirrorFileWebView
          path={activePath}
          content={activeSession?.draft ?? ""}
          contentEpoch={activeSession?.contentEpoch ?? 0}
          cleanEpoch={activeSession?.cleanEpoch ?? 0}
          cleanContent={activeSession?.saved}
          onChange={onEditorChange}
          onSaveRequest={(path) => {
            void savePath(path);
          }}
        />
      )}
    </View>
  );
}

export function ProjectFsFileEditorEmpty() {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>Select a file from the tree.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  saveError: {
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
    paddingBottom: 4,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
  },
  retry: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
  },
  retryLabel: {
    color: colors.buttonText,
    fontWeight: "600",
    fontSize: 14,
  },
});
