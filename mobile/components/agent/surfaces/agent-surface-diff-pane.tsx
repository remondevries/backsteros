import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  formatDiffStat,
  type AgentChatActivityDiffLine,
} from "../../../lib/agent/agent-chat-activity";
import {
  summarizeChangedFileStats,
  type AgentChatChangedFile,
} from "../../../lib/agent/agent-chat-changed-files";
import { colors } from "../../../lib/theme";

type Props = {
  files?: readonly AgentChatChangedFile[];
  initialPath?: string | null;
};

function DiffLineRow({ line }: { line: AgentChatActivityDiffLine }) {
  const prefix =
    line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
  return (
    <View
      style={[
        styles.diffLine,
        line.type === "add"
          ? styles.diffLineAdd
          : line.type === "del"
            ? styles.diffLineDel
            : null,
      ]}
    >
      <Text style={styles.diffPrefix} accessibilityElementsHidden>
        {prefix}
      </Text>
      <Text
        style={[
          styles.diffText,
          line.type === "add"
            ? styles.diffTextAdd
            : line.type === "del"
              ? styles.diffTextDel
              : null,
        ]}
        selectable
      >
        {line.text || " "}
      </Text>
    </View>
  );
}

/**
 * Diff surface — file list + unified hunk viewer (desktop review-only parity).
 */
export function AgentSurfaceDiffPane({
  files = [],
  initialPath = null,
}: Props) {
  const summary = useMemo(() => summarizeChangedFileStats(files), [files]);
  const [activePath, setActivePath] = useState<string | null>(() => {
    if (initialPath && files.some((file) => file.path === initialPath)) {
      return initialPath;
    }
    return files[0]?.path ?? null;
  });

  useEffect(() => {
    if (initialPath && files.some((file) => file.path === initialPath)) {
      setActivePath(initialPath);
      return;
    }
    setActivePath((current) => {
      if (current && files.some((file) => file.path === current)) {
        return current;
      }
      return files[0]?.path ?? null;
    });
  }, [files, initialPath]);

  if (files.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No diffs yet</Text>
        <Text style={styles.emptyBody}>
          File changes from the agent turn will appear here.
        </Text>
      </View>
    );
  }

  const activeFile =
    files.find((file) => file.path === activePath) ?? files[0] ?? null;

  return (
    <View style={styles.root} accessibilityLabel="Agent diffs">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {files.length} changed file{files.length === 1 ? "" : "s"}
        </Text>
        {summary.additions > 0 || summary.deletions > 0 ? (
          <Text style={styles.headerStat}>
            {summary.additions > 0 ? (
              <Text style={styles.statAdd}>+{summary.additions}</Text>
            ) : null}
            {summary.additions > 0 && summary.deletions > 0 ? " " : null}
            {summary.deletions > 0 ? (
              <Text style={styles.statDel}>−{summary.deletions}</Text>
            ) : null}
          </Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        style={styles.fileStrip}
        contentContainerStyle={styles.fileStripContent}
        showsHorizontalScrollIndicator={false}
      >
        {files.map((file) => {
          const active = file.path === activeFile?.path;
          return (
            <Pressable
              key={file.path}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setActivePath(file.path)}
              style={[styles.fileChip, active ? styles.fileChipActive : null]}
            >
              <Text
                style={[
                  styles.fileChipName,
                  active ? styles.fileChipNameActive : null,
                ]}
                numberOfLines={1}
              >
                {file.name}
              </Text>
              <Text style={styles.fileChipStat}>
                {formatDiffStat(file)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeFile ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
        >
          <Text style={styles.path} numberOfLines={2} selectable>
            {activeFile.path}
          </Text>
          {activeFile.lines.length === 0 ? (
            <Text style={styles.statsOnly}>
              No line-level diff was captured for this file. Stats only:{" "}
              {formatDiffStat(activeFile)}.
            </Text>
          ) : (
            <View style={styles.diffBody}>
              {activeFile.lines.map((line, index) => (
                <DiffLineRow
                  key={`${activeFile.path}-${line.type}-${index}`}
                  line={line}
                />
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  headerStat: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  statAdd: {
    color: "#3f9d6e",
    fontWeight: "600",
  },
  statDel: {
    color: "#c45b5b",
    fontWeight: "600",
  },
  fileStrip: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fileStripContent: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  fileChip: {
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
  fileChipActive: {
    borderColor: colors.foreground,
  },
  fileChipName: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  fileChipNameActive: {
    color: colors.foreground,
  },
  fileChipStat: {
    color: colors.muted,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 12,
    paddingBottom: 32,
    gap: 10,
  },
  path: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: "Menlo",
  },
  statsOnly: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  diffBody: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  diffLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  diffLineAdd: {
    backgroundColor: "rgba(63, 157, 110, 0.12)",
  },
  diffLineDel: {
    backgroundColor: "rgba(196, 91, 91, 0.14)",
  },
  diffPrefix: {
    width: 14,
    color: colors.muted,
    fontSize: 12,
    fontFamily: "Menlo",
    lineHeight: 18,
  },
  diffText: {
    flex: 1,
    color: colors.foreground,
    fontSize: 12,
    fontFamily: "Menlo",
    lineHeight: 18,
  },
  diffTextAdd: {
    color: "#9ad4b5",
  },
  diffTextDel: {
    color: "#e0a0a0",
  },
});
