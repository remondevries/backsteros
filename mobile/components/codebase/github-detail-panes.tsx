import type {
  GithubCommit,
  GithubPullRequest,
  GithubPullRequestFile,
} from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  commitBody,
  commitSubject,
  formatCommitDetailDate,
} from "../../lib/github-format";
import { colors, spacing } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { GithubFileDiffModal } from "./github-file-diff-modal";

type Props = {
  projectId: string;
  commit: GithubCommit;
  repository: string | null;
};

function ChangedFileRow({
  file,
  onPress,
}: {
  file: GithubPullRequestFile;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View diff for ${file.filename}`}
      style={({ pressed }) => [
        styles.fileRow,
        pressed ? { backgroundColor: colors.rowPressed } : null,
      ]}
    >
      <Text style={styles.fileName} numberOfLines={2}>
        {file.filename}
      </Text>
      <View style={styles.fileStatsRow}>
        <Text style={styles.statAdd}>+{file.additions}</Text>
        <Text style={styles.statDel}>−{file.deletions}</Text>
      </View>
    </Pressable>
  );
}

/** Commit detail — subject, body, meta, changed files. */
export function GithubCommitDetail({
  projectId,
  commit,
  repository,
}: Props) {
  const client = useMobileApiClient();
  const [files, setFiles] = useState<GithubPullRequestFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffFile, setDiffFile] = useState<GithubPullRequestFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{
        commit: GithubCommit;
        files: GithubPullRequestFile[];
      }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits/${encodeURIComponent(commit.sha)}`,
      );
      setFiles(body.files ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load commit.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, commit.sha, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const subject = commitSubject(commit.message);
  const body = commitBody(commit.message);
  const author = commit.authorLogin || commit.authorName || "Unknown";
  const authoredLabel = formatCommitDetailDate(commit.authoredAt);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.title}>{subject}</Text>
          <View style={styles.titleRow}>
            <Pressable
              onPress={() => {
                void Linking.openURL(commit.htmlUrl);
              }}
              accessibilityRole="link"
              accessibilityLabel={`Open commit ${commit.shortSha} on GitHub`}
            >
              <Text style={styles.sha}>{commit.shortSha}</Text>
            </Pressable>
          </View>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <Text style={styles.meta}>
            {author}
            {authoredLabel ? ` · ${authoredLabel}` : ""}
            {repository ? ` · ${repository}` : ""}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Files</Text>
        {loading ? (
          <ActivityIndicator color={colors.muted} style={{ marginTop: 12 }} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && files.length === 0 ? (
          <Text style={styles.empty}>No file changes listed.</Text>
        ) : null}
        {files.map((file) => (
          <ChangedFileRow
            key={file.filename}
            file={file}
            onPress={() => setDiffFile(file)}
          />
        ))}
      </ScrollView>
      <GithubFileDiffModal
        visible={diffFile != null}
        file={diffFile}
        onClose={() => setDiffFile(null)}
      />
    </>
  );
}

/** Lightweight placeholder when no commit is selected (iPad detail pane). */
export function GithubCommitDetailEmpty() {
  return (
    <View style={styles.emptyPane}>
      <Text style={styles.emptyPaneText}>Select a commit from the list.</Text>
    </View>
  );
}

type PrProps = {
  projectId: string;
  pullRequest: GithubPullRequest;
  repository: string | null;
};

/** PR detail — title, body, meta, commits + files lists (API metadata). */
export function GithubPullRequestDetail({
  projectId,
  pullRequest,
  repository,
}: PrProps) {
  const client = useMobileApiClient();
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [files, setFiles] = useState<GithubPullRequestFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"overview" | "commits" | "files">(
    "overview",
  );
  const [diffFile, setDiffFile] = useState<GithubPullRequestFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, commitsBody, filesBody] = await Promise.all([
        client.requestJson<{ pullRequest: GithubPullRequest }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${pullRequest.number}`,
        ),
        client.requestJson<{ commits: GithubCommit[] }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${pullRequest.number}/commits`,
        ),
        client.requestJson<{ files: GithubPullRequestFile[] }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${pullRequest.number}/files`,
        ),
      ]);
      void detail;
      setCommits(commitsBody.commits ?? []);
      setFiles(filesBody.files ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load pull request.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, projectId, pullRequest.number]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.hero}>
        <Text style={styles.title}>{pullRequest.title}</Text>
        <Pressable
          onPress={() => {
            void Linking.openURL(pullRequest.htmlUrl);
          }}
          accessibilityRole="link"
        >
          <Text style={styles.sha}>#{pullRequest.number}</Text>
        </Pressable>
        {pullRequest.body ? (
          <Text style={styles.body} numberOfLines={12}>
            {pullRequest.body}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {pullRequest.authorLogin ?? "Unknown"}
          {pullRequest.headRef && pullRequest.baseRef
            ? ` · ${pullRequest.headRef} → ${pullRequest.baseRef}`
            : ""}
          {repository ? ` · ${repository}` : ""}
        </Text>
      </View>

      <View style={styles.segmentRow}>
        {(
          [
            ["overview", "Overview"],
            ["commits", "Commits"],
            ["files", "Files"],
          ] as const
        ).map(([id, label]) => {
          const active = section === id;
          return (
            <Pressable
              key={id}
              onPress={() => setSection(id)}
              style={[styles.segment, active ? styles.segmentActive : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  active ? styles.segmentLabelActive : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.muted} style={{ marginTop: 16 }} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error && section === "overview" ? (
        <View style={styles.statsBlock}>
          <Text style={styles.statLine}>
            {pullRequest.commitsCount ?? commits.length} commits ·{" "}
            {pullRequest.changedFilesCount ?? files.length} files
            {pullRequest.additions != null
              ? ` · +${pullRequest.additions}`
              : ""}
            {pullRequest.deletions != null
              ? ` −${pullRequest.deletions}`
              : ""}
          </Text>
          <Text style={styles.statLine}>
            State: {pullRequest.draft ? "Draft · " : ""}
            {pullRequest.state}
          </Text>
        </View>
      ) : null}

      {!loading && !error && section === "commits"
        ? commits.map((entry) => (
            <View key={entry.sha} style={styles.fileRow}>
              <Text style={styles.fileName} numberOfLines={2}>
                {commitSubject(entry.message)}
              </Text>
              <Text style={styles.fileStats}>{entry.shortSha}</Text>
            </View>
          ))
        : null}

      {!loading && !error && section === "files"
        ? files.map((file) => (
            <ChangedFileRow
              key={file.filename}
              file={file}
              onPress={() => setDiffFile(file)}
            />
          ))
        : null}
      </ScrollView>
      <GithubFileDiffModal
        visible={diffFile != null}
        file={diffFile}
        onClose={() => setDiffFile(null)}
      />
    </>
  );
}

export function GithubPullRequestDetailEmpty() {
  return (
    <View style={styles.emptyPane}>
      <Text style={styles.emptyPaneText}>
        Select a pull request from the list.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 4,
  },
  hero: {
    gap: 8,
    marginBottom: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sha: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 4,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fileName: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 18,
  },
  fileStats: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  fileStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statAdd: {
    color: "#3fb950",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  statDel: {
    color: "#f85149",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    marginTop: 8,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 8,
  },
  emptyPane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyPaneText: {
    color: colors.muted,
    fontSize: 14,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  segmentLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  segmentLabelActive: {
    color: colors.foreground,
  },
  statsBlock: {
    gap: 6,
    marginTop: 8,
  },
  statLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
