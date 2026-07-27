import type { GithubPullRequestFile } from "@backsteros/contracts";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  githubFileStatusLabel,
  parseUnifiedDiffLines,
  toUnifiedDiff,
} from "../../lib/github-diff";
import { useHideTabBar } from "../../lib/tab-bar-visibility";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";

type Props = {
  visible: boolean;
  file: GithubPullRequestFile | null;
  onClose: () => void;
};

/** Fullscreen unified diff for a GitHub commit/PR changed file. */
export function GithubFileDiffModal({ visible, file, onClose }: Props) {
  const insets = useSafeAreaInsets();
  useHideTabBar(visible);

  const unified =
    file?.patch != null
      ? toUnifiedDiff(
          file.filename,
          file.previousFilename,
          file.patch,
          file.status,
        )
      : null;
  const lines = unified ? parseUnifiedDiffLines(unified) : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[ui.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>
              {file?.filename ?? "Diff"}
            </Text>
            {file ? (
              <Text style={styles.meta} numberOfLines={1}>
                {githubFileStatusLabel(file.status)}
                {file.previousFilename
                  ? ` · from ${file.previousFilename}`
                  : ""}
                {` · +${file.additions} −${file.deletions}`}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close diff"
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? { opacity: 0.85 } : null,
            ]}
          >
            <Text style={styles.closeLabel}>Done</Text>
          </Pressable>
        </View>

        {!file ? (
          <View style={ui.centered}>
            <Text style={styles.empty}>No file selected.</Text>
          </View>
        ) : !file.patch ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              No patch is available for this file (binary or too large for
              GitHub’s patch field).
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            horizontal={false}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.diffBlock}>
                {lines.map((line, index) => (
                  <View
                    key={`${index}:${line.kind}`}
                    style={[
                      styles.line,
                      line.kind === "add" ? styles.lineAdd : null,
                      line.kind === "del" ? styles.lineDel : null,
                      line.kind === "hunk" ? styles.lineHunk : null,
                      line.kind === "meta" ? styles.lineMeta : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.lineText,
                        line.kind === "add" ? styles.textAdd : null,
                        line.kind === "del" ? styles.textDel : null,
                        line.kind === "hunk" ? styles.textHunk : null,
                        line.kind === "meta" ? styles.textMeta : null,
                      ]}
                      selectable
                    >
                      {line.text}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
  },
  closeLabel: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  diffBlock: {
    minWidth: "100%",
    paddingVertical: 8,
  },
  line: {
    paddingHorizontal: 12,
    paddingVertical: 1,
  },
  lineAdd: {
    // Match @git-diff-view dark theme `--diff-add-content--`
    backgroundColor: "#18271f",
  },
  lineDel: {
    // Match @git-diff-view dark theme `--diff-del-content--`
    backgroundColor: "#23191c",
  },
  lineHunk: {
    backgroundColor: "rgba(136, 170, 255, 0.12)",
  },
  lineMeta: {
    backgroundColor: "transparent",
  },
  lineText: {
    color: colors.foreground,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Menlo",
  },
  textAdd: {
    // Match desktop `.is-add` / DiffView green
    color: "#3fb950",
  },
  textDel: {
    // Match desktop `.is-del` / DiffView red
    color: "#f85149",
  },
  textHunk: {
    color: "#a5b4fc",
  },
  textMeta: {
    color: colors.muted,
  },
  emptyWrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
