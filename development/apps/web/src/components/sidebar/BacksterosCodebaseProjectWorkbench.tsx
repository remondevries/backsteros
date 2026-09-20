import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { BacksterosCodebaseDocsPanel } from "~/backsteros/CodebaseDocsPanel";
import {
  createBacksterosProjectUpdate,
  deleteBacksterosProjectUpdate,
  fetchBacksterosGithubStatus,
  fetchBacksterosProjectDocs,
  fetchBacksterosProjectFsEntries,
  fetchBacksterosProjectFsFile,
  fetchBacksterosProjectGithubBranches,
  fetchBacksterosProjectGithubCommits,
  fetchBacksterosProjectGithubPull,
  fetchBacksterosProjectGithubPulls,
  fetchBacksterosProjectUpdates,
  formatBacksterosLocalCoreError,
  patchBacksterosProjectUpdate,
} from "~/backsteros/client";
import {
  BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS,
  type BacksterosCodebaseListTab,
} from "~/backsteros/codebaseListTabs";
import {
  BacksterosCommitDetailPane,
  BacksterosGithubCommitListItem,
} from "~/backsteros/CommitDetailPane";
import { BacksterosPillNav } from "~/backsteros/PillNav";
import {
  BacksterosProjectUpdatesView,
  tasksToUpdateRelatedOptions,
} from "~/backsteros/ProjectUpdatesView";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import {
  BacksterosGithubPullListItem,
  BacksterosPullRequestDetailPane,
} from "~/backsteros/PullRequestDetailPane";
import { BacksterosSearchablePropertyMenu } from "~/backsteros/SearchablePropertyMenu";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import type {
  BacksterosCodebaseProject,
  BacksterosGithubCommit,
  BacksterosGithubPullRequest,
  BacksterosProjectFsEntry,
  BacksterosProjectRepoDocEntry,
  BacksterosProjectUpdate,
  BacksterosTask,
} from "~/backsteros/types";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { BacksterosCodebaseProjectOverviewPane } from "./BacksterosCodebaseProjectOverviewPane";
import "~/backsteros/codebaseWorkbench.css";
import "~/backsteros/githubWorkbench.css";

function formatRelativeAge(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function EmptyPanel(props: { readonly children: ReactNode }) {
  return <div className="bos-codebase-workbench__empty">{props.children}</div>;
}

function LoadingPanel() {
  return (
    <EmptyPanel>
      <p>Loading…</p>
    </EmptyPanel>
  );
}

function ErrorPanel(props: { readonly message: string; readonly onRetry?: () => void }) {
  return (
    <EmptyPanel>
      <p role="alert">{props.message}</p>
      {props.onRetry ? (
        <Button type="button" size="xs" variant="outline" onClick={props.onRetry}>
          Retry
        </Button>
      ) : null}
    </EmptyPanel>
  );
}

type FolderState = {
  readonly children: readonly BacksterosProjectFsEntry[] | null;
  readonly loading: boolean;
  readonly error: string | null;
};

type VisibleFsNode = {
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly depth: number;
};

function flattenFsTree(
  entries: readonly BacksterosProjectFsEntry[],
  expanded: ReadonlySet<string>,
  folderState: Readonly<Record<string, FolderState>>,
  depth = 0,
): VisibleFsNode[] {
  const result: VisibleFsNode[] = [];
  for (const entry of entries) {
    result.push({
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      depth,
    });
    if (entry.kind === "directory" && expanded.has(entry.path)) {
      const children = folderState[entry.path]?.children;
      if (children) {
        result.push(...flattenFsTree(children, expanded, folderState, depth + 1));
      }
    }
  }
  return result;
}

function FilesTab(props: { readonly project: BacksterosCodebaseProject }) {
  const { project } = props;
  const cwd = project.localWorkingDirectory?.trim() ?? "";
  const [rootEntries, setRootEntries] = useState<readonly BacksterosProjectFsEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [folderState, setFolderState] = useState<Record<string, FolderState>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{
    readonly path: string;
    readonly name: string;
    readonly binary: boolean;
    readonly content: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setExpanded(new Set());
    setFolderState({});
    setSelectedPath(null);
    setFileContent(null);
  }, [project.id, cwd]);

  useEffect(() => {
    if (!cwd) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchBacksterosProjectFsEntries(project.id, "", controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        setRootEntries(entries);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(formatBacksterosLocalCoreError(err));
        setRootEntries([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cwd, project.id, reloadToken]);

  const loadFolder = useCallback(
    async (path: string) => {
      setFolderState((current) => ({
        ...current,
        [path]: { children: current[path]?.children ?? null, loading: true, error: null },
      }));
      try {
        const children = await fetchBacksterosProjectFsEntries(project.id, path);
        setFolderState((current) => ({
          ...current,
          [path]: { children, loading: false, error: null },
        }));
      } catch (err) {
        setFolderState((current) => ({
          ...current,
          [path]: {
            children: null,
            loading: false,
            error: formatBacksterosLocalCoreError(err),
          },
        }));
      }
    },
    [project.id],
  );

  const toggleDirectory = useCallback(
    (path: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(path)) {
          next.delete(path);
          return next;
        }
        next.add(path);
        if (!folderState[path]?.children) {
          void loadFolder(path);
        }
        return next;
      });
    },
    [folderState, loadFolder],
  );

  useEffect(() => {
    if (!selectedPath) {
      setFileContent(null);
      return;
    }
    const controller = new AbortController();
    setFileLoading(true);
    void fetchBacksterosProjectFsFile(project.id, selectedPath, controller.signal)
      .then((file) => {
        if (controller.signal.aborted) return;
        setFileContent(file);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFileContent({
          path: selectedPath,
          name: selectedPath.split("/").pop() ?? selectedPath,
          binary: false,
          content: err instanceof Error ? `Error: ${err.message}` : "Could not load file.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setFileLoading(false);
      });
    return () => controller.abort();
  }, [project.id, selectedPath]);

  if (!cwd) {
    return (
      <EmptyPanel>
        <p>Set a working directory on this project to browse local files.</p>
        <p>Use the folder chip in the overview side panel (absolute path on this Mac).</p>
      </EmptyPanel>
    );
  }

  if (loading && rootEntries.length === 0) return <LoadingPanel />;
  if (error) {
    return <ErrorPanel message={error} onRetry={() => setReloadToken((token) => token + 1)} />;
  }

  const visible = flattenFsTree(rootEntries, expanded, folderState);

  return (
    <div
      className={cn(
        "bos-codebase-workbench__list-detail",
        selectedPath && "bos-codebase-workbench__list-detail--split",
      )}
    >
      <div className="bos-codebase-workbench__tab-list">
        <div className="bos-codebase-workbench__list">
          {visible.length === 0 ? (
            <EmptyPanel>
              <p>This folder is empty.</p>
            </EmptyPanel>
          ) : (
            visible.map((node) => {
              const isExpanded = expanded.has(node.path);
              const folder = folderState[node.path];
              return (
                <button
                  key={node.path}
                  type="button"
                  className={cn(
                    "bos-codebase-workbench__row bos-codebase-workbench__row--link bos-codebase-workbench__fs-row",
                    selectedPath === node.path && "is-selected",
                  )}
                  style={{ paddingLeft: 12 + node.depth * 14 }}
                  onClick={() => {
                    if (node.kind === "directory") {
                      toggleDirectory(node.path);
                      return;
                    }
                    setSelectedPath(node.path);
                  }}
                >
                  <span className="bos-codebase-workbench__row-meta">
                    {node.kind === "directory" ? (isExpanded ? "▾" : "▸") : "·"}
                  </span>
                  <span className="bos-codebase-workbench__row-title">{node.name}</span>
                  {folder?.loading ? (
                    <span className="bos-codebase-workbench__row-sub">…</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
      {selectedPath ? (
        <div className="bos-codebase-workbench__tab-detail">
          <div className="bos-codebase-workbench__file-header">
            <span className="truncate">{selectedPath}</span>
            <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedPath(null)}>
              Close
            </Button>
          </div>
          {fileLoading && !fileContent ? (
            <LoadingPanel />
          ) : fileContent?.binary ? (
            <EmptyPanel>
              <p>Binary file — preview unavailable.</p>
            </EmptyPanel>
          ) : (
            <pre className="bos-codebase-workbench__file-pre">{fileContent?.content ?? ""}</pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DocsTab(props: { readonly project: BacksterosCodebaseProject }) {
  const { project } = props;
  const cwd = project.localWorkingDirectory?.trim() ?? "";
  const [entries, setEntries] = useState<readonly BacksterosProjectRepoDocEntry[]>([]);
  const [docsPresent, setDocsPresent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!cwd) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchBacksterosProjectDocs(project.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setDocsPresent(result.docsPresent);
        setEntries(result.entries);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(formatBacksterosLocalCoreError(err));
        setEntries([]);
        setDocsPresent(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cwd, project.id, reloadToken]);

  const emptyLabel = !cwd
    ? "Set a working directory to browse repository docs."
    : docsPresent
      ? "No documents to show."
      : "No docs in this repository.";

  return (
    <BacksterosCodebaseDocsPanel
      projectId={project.id}
      entries={entries}
      docsPresent={docsPresent}
      loading={loading}
      error={error}
      workingDirectoryMissing={!cwd}
      emptyLabel={emptyLabel}
      onRetry={() => setReloadToken((token) => token + 1)}
    />
  );
}

function CommitsTab(props: { readonly project: BacksterosCodebaseProject }) {
  const { project } = props;
  const repo = project.githubRepository?.trim() ?? "";
  const [commits, setCommits] = useState<readonly BacksterosGithubCommit[]>([]);
  const [branches, setBranches] = useState<readonly string[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchBacksterosGithubStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return;
        setGithubConnected(status.connected);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setGithubConnected(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (!repo || githubConnected !== true) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedSha(null);
    void (async () => {
      try {
        const branchPayload = await fetchBacksterosProjectGithubBranches(
          project.id,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const names = branchPayload.branches.map((entry) => entry.name);
        setBranches(names);
        const nextBranch = branchPayload.defaultBranch || names[0] || null;
        setBranch(nextBranch);
        if (!nextBranch) {
          setCommits([]);
          return;
        }
        const result = await fetchBacksterosProjectGithubCommits(
          project.id,
          nextBranch,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setCommits(result.commits);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load commits.");
        setCommits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [githubConnected, project.id, reloadToken, repo]);

  const loadBranch = useCallback(
    async (nextBranch: string) => {
      setBranch(nextBranch);
      setSelectedSha(null);
      setLoading(true);
      setError(null);
      try {
        const result = await fetchBacksterosProjectGithubCommits(project.id, nextBranch);
        setCommits(result.commits);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load commits.");
        setCommits([]);
      } finally {
        setLoading(false);
      }
    },
    [project.id],
  );

  const selected = commits.find((commit) => commit.sha === selectedSha) ?? null;

  if (githubConnected === false) {
    return (
      <EmptyPanel>
        <p>GitHub is not connected on this BacksterOS environment.</p>
        <p>Add a GitHub token in BacksterOS Settings to browse commits.</p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setReloadToken((t) => t + 1)}
        >
          Retry connection check
        </Button>
      </EmptyPanel>
    );
  }

  if (!repo) {
    return (
      <EmptyPanel>
        <p>Link a GitHub repository in the overview side panel to load commit history.</p>
      </EmptyPanel>
    );
  }

  return (
    <div
      className={cn(
        "bos-codebase-workbench__list-detail",
        selected && "bos-codebase-workbench__list-detail--split",
      )}
    >
      <div className="bos-codebase-workbench__tab-list">
        {branches.length > 0 ? (
          <div className="bos-codebase-workbench__branch-bar">
            <BacksterosSearchablePropertyMenu
              label={branch ?? "Select branch…"}
              muted={!branch}
              icon={<ProjectOcticon icon="git-branch" size={12} />}
              value={branch ?? ""}
              options={branches.map((name) => ({ value: name, label: name }))}
              searchPlaceholder="Change branch…"
              taskPropertyDropdownId="commitBranch"
              onChange={(value) => {
                void loadBranch(value);
              }}
            />
          </div>
        ) : null}
        {error ? (
          <ErrorPanel message={error} onRetry={() => setReloadToken((token) => token + 1)} />
        ) : loading && commits.length === 0 ? (
          <LoadingPanel />
        ) : (
          <div className="bos-github-commit-list">
            {commits.length === 0 ? (
              <EmptyPanel>
                <p>No commits on this branch.</p>
              </EmptyPanel>
            ) : (
              commits.map((commit) => (
                <BacksterosGithubCommitListItem
                  key={commit.sha}
                  commit={commit}
                  selected={selectedSha === commit.sha}
                  age={formatRelativeAge(commit.authoredAt)}
                  onSelect={() => setSelectedSha(commit.sha)}
                />
              ))
            )}
          </div>
        )}
      </div>
      {selected ? (
        <div className="bos-codebase-workbench__tab-detail">
          <BacksterosCommitDetailPane projectId={project.id} commit={selected} repository={repo} />
        </div>
      ) : null}
    </div>
  );
}

function PullsTab(props: { readonly project: BacksterosCodebaseProject }) {
  const { project } = props;
  const repo = project.githubRepository?.trim() ?? "";
  const [pulls, setPulls] = useState<readonly BacksterosGithubPullRequest[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<BacksterosGithubPullRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchBacksterosGithubStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return;
        setGithubConnected(status.connected);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setGithubConnected(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (!repo || githubConnected !== true) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchBacksterosProjectGithubPulls(project.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPulls(result.pullRequests);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load pull requests.");
        setPulls([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [githubConnected, project.id, reloadToken, repo]);

  useEffect(() => {
    if (selectedNumber == null) {
      setSelectedDetail(null);
      return;
    }
    const listItem = pulls.find((pull) => pull.number === selectedNumber) ?? null;
    setSelectedDetail(listItem);
    const controller = new AbortController();
    setDetailLoading(true);
    void fetchBacksterosProjectGithubPull(project.id, selectedNumber, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSelectedDetail(result.pullRequest);
      })
      .catch(() => {
        /* keep list item as fallback */
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [project.id, pulls, selectedNumber]);

  const selected = selectedDetail;

  if (githubConnected === false) {
    return (
      <EmptyPanel>
        <p>GitHub is not connected on this BacksterOS environment.</p>
        <p>Add a GitHub token in BacksterOS Settings to browse pull requests.</p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setReloadToken((t) => t + 1)}
        >
          Retry connection check
        </Button>
      </EmptyPanel>
    );
  }

  if (!repo) {
    return (
      <EmptyPanel>
        <p>Link a GitHub repository in the overview side panel to load pull requests.</p>
      </EmptyPanel>
    );
  }

  if (loading && pulls.length === 0) return <LoadingPanel />;
  if (error) {
    return <ErrorPanel message={error} onRetry={() => setReloadToken((token) => token + 1)} />;
  }

  return (
    <div
      className={cn(
        "bos-codebase-workbench__list-detail",
        selected && "bos-codebase-workbench__list-detail--split",
      )}
    >
      <div className="bos-codebase-workbench__tab-list">
        <div className="bos-github-commit-list">
          {pulls.length === 0 ? (
            <EmptyPanel>
              <p>No pull requests to show.</p>
            </EmptyPanel>
          ) : (
            pulls.map((pull) => (
              <BacksterosGithubPullListItem
                key={pull.number}
                pull={pull}
                selected={selectedNumber === pull.number}
                age={formatRelativeAge(pull.updatedAt)}
                onSelect={() => setSelectedNumber(pull.number)}
              />
            ))
          )}
        </div>
      </div>
      {selected ? (
        <div className="bos-codebase-workbench__tab-detail">
          {detailLoading && !selected.body ? (
            <p className="bos-github-files__status">Loading pull request…</p>
          ) : (
            <BacksterosPullRequestDetailPane
              projectId={project.id}
              pullRequest={selected}
              repository={repo}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function UpdatesTab(props: {
  readonly project: BacksterosCodebaseProject;
  readonly tasks: readonly BacksterosTask[];
}) {
  const { project, tasks } = props;
  const openTaskDetail = useBacksterosTaskDetailUiStore((store) => store.openTaskDetail);
  const [updates, setUpdates] = useState<readonly BacksterosProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const relatedTaskOptions = useMemo(
    () => tasksToUpdateRelatedOptions(tasks, project.key),
    [project.key, tasks],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchBacksterosProjectUpdates(project.id, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setUpdates(rows);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load updates.");
        setUpdates([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id, reloadToken]);

  const onCreate = useCallback(
    async (input: {
      title: string;
      body: string;
      kind: string;
      status: string;
      severity: string | null;
    }) => {
      setPosting(true);
      setError(null);
      try {
        const created = await createBacksterosProjectUpdate(project.id, input);
        setUpdates((current) => [created, ...current]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post update.");
        throw err;
      } finally {
        setPosting(false);
      }
    },
    [project.id],
  );

  const onPatch = useCallback(
    async (
      id: string,
      patch: Partial<{
        title: string;
        body: string;
        kind: string;
        status: string;
        severity: string | null;
        relatedTaskIds: string[];
      }>,
    ) => {
      setError(null);
      try {
        const updated = await patchBacksterosProjectUpdate(id, patch);
        setUpdates((current) => current.map((entry) => (entry.id === id ? updated : entry)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update post.");
        throw err;
      }
    },
    [],
  );

  const onDelete = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteBacksterosProjectUpdate(id);
      setUpdates((current) => current.filter((entry) => entry.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post.");
      throw err;
    }
  }, []);

  const onOpenRelatedTask = useCallback(
    (taskId: string) => {
      openTaskDetail({ taskId, project });
    },
    [openTaskDetail, project],
  );

  if (error && updates.length === 0 && !loading) {
    return <ErrorPanel message={error} onRetry={() => setReloadToken((token) => token + 1)} />;
  }

  return (
    <div className="bos-codebase-workbench__updates">
      <BacksterosProjectUpdatesView
        updates={updates}
        loading={loading}
        posting={posting}
        error={error}
        relatedTaskOptions={relatedTaskOptions}
        projectKey={project.key}
        onCreate={onCreate}
        onPatch={onPatch}
        onDelete={onDelete}
        onOpenRelatedTask={onOpenRelatedTask}
      />
    </div>
  );
}

/**
 * Desktop-parity codebase project workbench for BacksterDEV:
 * left overview (description / properties / activity) + content tabs.
 */
export function BacksterosCodebaseProjectWorkbench(props: {
  readonly project: BacksterosCodebaseProject;
  readonly tasks: readonly BacksterosTask[];
  readonly tasksPanel: ReactNode;
  readonly onProjectUpdated: (project: BacksterosCodebaseProject) => void;
}) {
  const { project, tasks, tasksPanel, onProjectUpdated } = props;
  const [tab, setTab] = useState<BacksterosCodebaseListTab>("tasks");

  useEffect(() => {
    setTab("tasks");
  }, [project.id]);

  const handleProjectUpdated = useCallback(
    (updated: BacksterosCodebaseProject) => {
      onProjectUpdated(updated);
    },
    [onProjectUpdated],
  );

  const tabBody = useMemo(() => {
    switch (tab) {
      case "tasks":
        return <div className="bos-codebase-workbench__panel">{tasksPanel}</div>;
      case "files":
        return <FilesTab project={project} />;
      case "docs":
        return <DocsTab project={project} />;
      case "commits":
        return <CommitsTab project={project} />;
      case "pulls":
        return <PullsTab project={project} />;
      case "updates":
        return <UpdatesTab project={project} tasks={tasks} />;
      default:
        return null;
    }
  }, [project, tab, tasks, tasksPanel]);

  return (
    <div
      className="bos-codebase-workbench min-h-0 flex-1"
      data-codebase-workbench
      data-content-detail
    >
      <aside className="bos-codebase-workbench__side" aria-label="Project overview">
        <BacksterosCodebaseProjectOverviewPane
          project={project}
          tasks={tasks}
          onProjectUpdated={handleProjectUpdated}
        />
      </aside>
      <div className="bos-codebase-workbench__main">
        <div className="bos-codebase-workbench__tabs">
          <BacksterosPillNav
            ariaLabel="Project contents"
            items={BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div className="bos-codebase-workbench__tab-body">{tabBody}</div>
      </div>
    </div>
  );
}
