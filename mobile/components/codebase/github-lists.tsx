import type {
  GithubBranch,
  GithubCommit,
  GithubConnectionStatus,
  GithubPullRequest,
  GithubRepository,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  commitSubject,
  formatRelativeAge,
  pullRequestStateLabel,
} from "../../lib/github-format";
import { fetchGithubConnectionStatus } from "../../lib/github-oauth";
import { patchEntityViaPowerSyncOrApi } from "../../lib/entity-mutations";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { colors, spacing } from "../../lib/theme";
import { useLocalQuery } from "../../lib/use-local-query";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { BacksterFlashList } from "../lists/index";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "../property-option-sheet";
import { GithubEmptyState } from "./github-empty-state";

const NONE_REPO_VALUE = "__none__";

type ProjectGithubRow = {
  id: string;
  github_repository: string | null;
};

const PROJECT_GITHUB_SQL = `SELECT id, github_repository FROM projects
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

type ListProps = {
  projectId: string;
  selectedCommitSha: string | null;
  onSelectCommit: (commit: GithubCommit) => void;
  githubRefreshToken?: number;
};

/** Commits list with repository + branch chips. */
export function GithubCommitList({
  projectId,
  selectedCommitSha,
  onSelectCommit,
  githubRefreshToken = 0,
}: ListProps) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { data: projectRows } = useLocalQuery<ProjectGithubRow>(
    PROJECT_GITHUB_SQL,
    [projectId],
  );
  const githubRepository = projectRows?.[0]?.github_repository ?? null;

  const [status, setStatus] = useState<GithubConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [branches, setBranches] = useState<GithubBranch[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    void fetchGithubConnectionStatus(client)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            connected: false,
            login: null,
            scopes: [],
            requiredScopes: [],
            missingScopes: [],
            organizations: [],
            repositoryCount: null,
            reason: "Could not check GitHub connection.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, githubRefreshToken]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    void client
      .requestJson<{ repositories: GithubRepository[] }>(
        "/api/v1/github/repositories",
      )
      .then((body) => {
        if (!cancelled) setRepositories(body.repositories ?? []);
      })
      .catch(() => {
        if (!cancelled) setRepositories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, status?.connected, githubRefreshToken]);

  useEffect(() => {
    if (!githubRepository) {
      setBranches([]);
      setDefaultBranch(null);
      setSelectedBranch(null);
      return;
    }
    let cancelled = false;
    void client
      .requestJson<{
        repository: string | null;
        defaultBranch: string | null;
        branches: GithubBranch[];
      }>(`/api/v1/projects/${encodeURIComponent(projectId)}/github/branches`)
      .then((body) => {
        if (cancelled) return;
        setBranches(body.branches ?? []);
        setDefaultBranch(body.defaultBranch);
        setSelectedBranch((current) => {
          if (
            current &&
            body.branches.some((branch) => branch.name === current)
          ) {
            return current;
          }
          if (
            body.defaultBranch &&
            body.branches.some((branch) => branch.name === body.defaultBranch)
          ) {
            return body.defaultBranch;
          }
          return body.branches[0]?.name ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setBranches([]);
          setDefaultBranch(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, githubRepository, projectId, githubRefreshToken]);

  const loadCommits = useCallback(
    async (branch: string, nextPage: number, append: boolean) => {
      const generation = ++generationRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setCommits([]);
      }
      setError(null);
      try {
        const query = new URLSearchParams({
          branch,
          page: String(nextPage),
        });
        const result = await client.requestJson<{
          commits: GithubCommit[];
          page: number;
          hasMore: boolean;
        }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits?${query.toString()}`,
        );
        if (generation !== generationRef.current) return;
        setCommits((previous) =>
          append
            ? [...previous, ...(result.commits ?? [])]
            : (result.commits ?? []),
        );
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (reason) {
        if (generation !== generationRef.current) return;
        setError(
          reason instanceof Error ? reason.message : "Could not load commits.",
        );
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [client, projectId],
  );

  useEffect(() => {
    if (!githubRepository || !selectedBranch) {
      setCommits([]);
      return;
    }
    void loadCommits(selectedBranch, 1, false);
  }, [githubRepository, loadCommits, selectedBranch, githubRefreshToken]);

  const saveRepository = useCallback(
    async (fullName: string | null) => {
      setRepoSaving(true);
      try {
        await patchEntityViaPowerSyncOrApi(
          client,
          powerSync,
          "projects",
          projectId,
          { githubRepository: fullName },
          { github_repository: fullName },
        );
      } catch {
        // keep local optimistic value when possible
      } finally {
        setRepoSaving(false);
      }
    },
    [client, powerSync, projectId],
  );

  const repoOptions = useMemo<PropertyOption<string>[]>(
    () => [
      { value: NONE_REPO_VALUE, label: "No repository" },
      ...repositories.map((repo) => ({
        value: repo.fullName,
        label: repo.fullName,
      })),
    ],
    [repositories],
  );

  const branchOptions = useMemo<PropertyOption<string>[]>(
    () =>
      branches.map((branch) => ({
        value: branch.name,
        label:
          branch.name === defaultBranch
            ? `${branch.name} (default)`
            : branch.name,
      })),
    [branches, defaultBranch],
  );

  if (statusLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!status?.connected) {
    return (
      <GithubEmptyState
        title="Connect GitHub"
        message={
          status?.reason ??
          "Connect GitHub in Settings to browse commits for this project."
        }
        actionLabel="Open Settings"
        linkToGithubSettings
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.chips}>
        <Pressable
          onPress={() => setRepoPickerOpen(true)}
          disabled={repoSaving}
          style={({ pressed }) => [
            styles.chip,
            pressed ? { backgroundColor: colors.rowPressed } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select GitHub repository"
        >
          <Text style={styles.chipLabel} numberOfLines={1}>
            {githubRepository ?? "Select repository"}
          </Text>
        </Pressable>
        {githubRepository ? (
          <Pressable
            onPress={() => setBranchPickerOpen(true)}
            style={({ pressed }) => [
              styles.chip,
              pressed ? { backgroundColor: colors.rowPressed } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Select branch"
          >
            <Text style={styles.chipLabel} numberOfLines={1}>
              {selectedBranch ?? "Branch"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!githubRepository ? (
        <GithubEmptyState
          title="No repository"
          message="Select a GitHub repository to load commit history."
        />
      ) : loading && commits.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : error ? (
        <GithubEmptyState
          title="Could not load commits"
          message={error}
          actionLabel="Retry"
          onAction={() => {
            if (selectedBranch) void loadCommits(selectedBranch, 1, false);
          }}
        />
      ) : (
        <BacksterFlashList
          embedded
          data={commits}
          keyExtractor={(item) => item.sha}
          style={styles.list}
          contentContainerStyle={
            commits.length === 0 ? styles.listEmpty : undefined
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No commits on this branch.</Text>
          }
          onEndReached={() => {
            if (!hasMore || loadingMore || !selectedBranch) return;
            void loadCommits(selectedBranch, page + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.muted}
                style={{ marginVertical: 12 }}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const selected = item.sha === selectedCommitSha;
            return (
              <Pressable
                onPress={() => onSelectCommit(item)}
                style={({ pressed }) => [
                  styles.row,
                  selected ? styles.rowSelected : null,
                  pressed && !selected
                    ? { backgroundColor: colors.rowPressed }
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {commitSubject(item.message)}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.authorLogin || item.authorName || "Unknown"} ·{" "}
                    {item.shortSha}
                  </Text>
                </View>
                <Text style={styles.rowAge}>
                  {formatRelativeAge(item.authoredAt)}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <PropertyOptionSheet
        visible={repoPickerOpen}
        title="Repository"
        options={repoOptions}
        selected={githubRepository ?? NONE_REPO_VALUE}
        onSelect={(value) => {
          void saveRepository(value === NONE_REPO_VALUE ? null : value);
        }}
        onClose={() => setRepoPickerOpen(false)}
      />
      <PropertyOptionSheet
        visible={branchPickerOpen}
        title="Branch"
        options={branchOptions}
        selected={selectedBranch ?? ""}
        onSelect={(value) => {
          if (value) setSelectedBranch(value);
        }}
        onClose={() => setBranchPickerOpen(false)}
      />
    </View>
  );
}

type PullListProps = {
  projectId: string;
  selectedPullNumber: number | null;
  onSelectPull: (pull: GithubPullRequest) => void;
  githubRefreshToken?: number;
};

/** Pull request list with repository chip. */
export function GithubPullRequestList({
  projectId,
  selectedPullNumber,
  onSelectPull,
  githubRefreshToken = 0,
}: PullListProps) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const { data: projectRows } = useLocalQuery<ProjectGithubRow>(
    PROJECT_GITHUB_SQL,
    [projectId],
  );
  const githubRepository = projectRows?.[0]?.github_repository ?? null;

  const [status, setStatus] = useState<GithubConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [pullRequests, setPullRequests] = useState<GithubPullRequest[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    void fetchGithubConnectionStatus(client)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            connected: false,
            login: null,
            scopes: [],
            requiredScopes: [],
            missingScopes: [],
            organizations: [],
            repositoryCount: null,
            reason: "Could not check GitHub connection.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, githubRefreshToken]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    void client
      .requestJson<{ repositories: GithubRepository[] }>(
        "/api/v1/github/repositories",
      )
      .then((body) => {
        if (!cancelled) setRepositories(body.repositories ?? []);
      })
      .catch(() => {
        if (!cancelled) setRepositories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, status?.connected, githubRefreshToken]);

  const loadPulls = useCallback(
    async (nextPage: number, append: boolean) => {
      const generation = ++generationRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setPullRequests([]);
      }
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(nextPage),
          state: "all",
        });
        const result = await client.requestJson<{
          pullRequests: GithubPullRequest[];
          page: number;
          hasMore: boolean;
        }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls?${query.toString()}`,
        );
        if (generation !== generationRef.current) return;
        setPullRequests((previous) =>
          append
            ? [...previous, ...(result.pullRequests ?? [])]
            : (result.pullRequests ?? []),
        );
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (reason) {
        if (generation !== generationRef.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load pull requests.",
        );
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [client, projectId],
  );

  useEffect(() => {
    if (!githubRepository) {
      setPullRequests([]);
      return;
    }
    void loadPulls(1, false);
  }, [githubRepository, loadPulls, githubRefreshToken]);

  const saveRepository = useCallback(
    async (fullName: string | null) => {
      setRepoSaving(true);
      try {
        await patchEntityViaPowerSyncOrApi(
          client,
          powerSync,
          "projects",
          projectId,
          { githubRepository: fullName },
          { github_repository: fullName },
        );
      } catch {
        // ignore
      } finally {
        setRepoSaving(false);
      }
    },
    [client, powerSync, projectId],
  );

  const repoOptions = useMemo<PropertyOption<string>[]>(
    () => [
      { value: NONE_REPO_VALUE, label: "No repository" },
      ...repositories.map((repo) => ({
        value: repo.fullName,
        label: repo.fullName,
      })),
    ],
    [repositories],
  );

  if (statusLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!status?.connected) {
    return (
      <GithubEmptyState
        title="Connect GitHub"
        message={
          status?.reason ??
          "Connect GitHub in Settings to browse pull requests."
        }
        actionLabel="Open Settings"
        linkToGithubSettings
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.chips}>
        <Pressable
          onPress={() => setRepoPickerOpen(true)}
          disabled={repoSaving}
          style={({ pressed }) => [
            styles.chip,
            pressed ? { backgroundColor: colors.rowPressed } : null,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.chipLabel} numberOfLines={1}>
            {githubRepository ?? "Select repository"}
          </Text>
        </Pressable>
      </View>

      {!githubRepository ? (
        <GithubEmptyState
          title="No repository"
          message="Select a GitHub repository to load pull requests."
        />
      ) : loading && pullRequests.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : error ? (
        <GithubEmptyState
          title="Could not load pull requests"
          message={error}
          actionLabel="Retry"
          onAction={() => {
            void loadPulls(1, false);
          }}
        />
      ) : (
        <BacksterFlashList
          embedded
          data={pullRequests}
          keyExtractor={(item) => String(item.number)}
          style={styles.list}
          contentContainerStyle={
            pullRequests.length === 0 ? styles.listEmpty : undefined
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No pull requests.</Text>
          }
          onEndReached={() => {
            if (!hasMore || loadingMore) return;
            void loadPulls(page + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.muted}
                style={{ marginVertical: 12 }}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const selected = item.number === selectedPullNumber;
            return (
              <Pressable
                onPress={() => onSelectPull(item)}
                style={({ pressed }) => [
                  styles.row,
                  selected ? styles.rowSelected : null,
                  pressed && !selected
                    ? { backgroundColor: colors.rowPressed }
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    #{item.number} ·{" "}
                    {pullRequestStateLabel(item.state, item.draft)}
                    {item.authorLogin ? ` · ${item.authorLogin}` : ""}
                  </Text>
                </View>
                <Text style={styles.rowAge}>
                  {formatRelativeAge(item.updatedAt ?? item.createdAt)}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <PropertyOptionSheet
        visible={repoPickerOpen}
        title="Repository"
        options={repoOptions}
        selected={githubRepository ?? NONE_REPO_VALUE}
        onSelect={(value) => {
          void saveRepository(value === NONE_REPO_VALUE ? null : value);
        }}
        onClose={() => setRepoPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: spacing.screenX,
    paddingTop: 10,
    paddingBottom: 8,
  },
  chip: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  chipLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  list: {
    flex: 1,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    padding: spacing.screenX,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: {
    backgroundColor: "rgba(238, 122, 71, 0.12)",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  rowAge: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
