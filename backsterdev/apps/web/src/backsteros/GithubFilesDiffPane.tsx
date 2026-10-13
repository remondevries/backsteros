import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchBacksterosProjectGithubCommit,
  fetchBacksterosProjectGithubPullFiles,
} from "~/backsteros/client";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import type {
  BacksterosGithubPullRequestFile,
  BacksterosGithubPullRequestFileStatus,
} from "~/backsteros/types";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

function statusLabel(status: BacksterosGithubPullRequestFileStatus): string {
  switch (status) {
    case "added":
      return "A";
    case "removed":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "changed":
    case "modified":
      return "M";
    default:
      return "·";
  }
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "";
}

function PatchLines(props: { readonly patch: string }) {
  const lines = props.patch.replace(/\n$/, "").split("\n");
  return (
    <pre className="bos-github-patch" aria-label="Diff">
      {lines.map((line, index) => {
        const kind = line.startsWith("@@")
          ? "hunk"
          : line.startsWith("+")
            ? "add"
            : line.startsWith("-")
              ? "del"
              : "ctx";
        return (
          <span
            key={`${index}-${line.slice(0, 24)}`}
            className={`bos-github-patch__line is-${kind}`}
          >
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

export function BacksterosGithubFilesDiffPane(props: {
  readonly files: readonly BacksterosGithubPullRequestFile[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly hasMore?: boolean;
  readonly loadingMore?: boolean;
  readonly onLoadMore?: (() => void) | undefined;
}) {
  const {
    files,
    loading = false,
    error = null,
    hasMore = false,
    loadingMore = false,
    onLoadMore,
  } = props;
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFilename(files[0]?.filename ?? null);
  }, [files]);

  const selected = useMemo(
    () => files.find((file) => file.filename === selectedFilename) ?? null,
    [files, selectedFilename],
  );

  if (loading && files.length === 0) {
    return <p className="bos-github-files__status">Loading files…</p>;
  }

  if (error && files.length === 0) {
    return (
      <p className="bos-github-files__status bos-github-files__status--error" role="alert">
        {error}
      </p>
    );
  }

  if (!loading && files.length === 0) {
    return <p className="bos-github-files__status">No files changed.</p>;
  }

  return (
    <section className="bos-github-files" aria-label="Changed files">
      <aside className="bos-github-files__rail" aria-label="File list">
        {error ? (
          <p className="bos-github-files__status bos-github-files__status--error" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="bos-github-files__list">
          {files.map((file) => {
            const dir = dirname(file.filename);
            const name = basename(file.filename);
            return (
              <li key={file.filename}>
                <button
                  type="button"
                  className={cn(
                    "bos-github-files__item",
                    `is-${file.status}`,
                    selectedFilename === file.filename && "is-selected",
                  )}
                  title={file.filename}
                  onClick={() => setSelectedFilename(file.filename)}
                >
                  <span className="bos-github-files__item-status" aria-label={file.status}>
                    {statusLabel(file.status)}
                  </span>
                  <span className="bos-github-files__item-path">
                    <span className="bos-github-files__item-name">{name}</span>
                    {dir ? <span className="bos-github-files__item-dir">{dir}</span> : null}
                  </span>
                  <span className="bos-github-files__item-stat">
                    <span className="is-add">+{file.additions}</span>
                    <span className="is-del">−{file.deletions}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {hasMore && onLoadMore ? (
          <div className="bos-github-files__more">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="bos-github-files__diff">
        {selected ? (
          <>
            <header className="bos-github-files__diff-header">
              <div className="bos-github-files__diff-title">
                <ProjectOcticon icon="file" size={14} />
                <span title={selected.filename}>{selected.filename}</span>
              </div>
              <div className="bos-github-files__diff-stat" aria-label="Diff stats">
                <span className="is-add">+{selected.additions}</span>
                <span className="is-del">−{selected.deletions}</span>
              </div>
            </header>
            {selected.patch ? (
              <div className="bos-github-files__diff-body">
                <PatchLines patch={selected.patch} />
              </div>
            ) : (
              <div className="bos-github-files__diff-empty">
                <ProjectOcticon icon="diff" size={18} />
                <p>Binary file or diff too large to display.</p>
              </div>
            )}
          </>
        ) : (
          <div className="bos-github-files__diff-empty">
            <ProjectOcticon icon="file-directory" size={18} />
            <p>Select a file to view changes.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function useBacksterosCommitFiles(projectId: string, sha: string | null) {
  const [files, setFiles] = useState<readonly BacksterosGithubPullRequestFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sha) {
      setFiles([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchBacksterosProjectGithubCommit(projectId, sha, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setFiles(result.files ?? []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFiles([]);
        setError(err instanceof Error ? err.message : "Could not load commit files.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, sha]);

  return { files, loading, error };
}

export function useBacksterosPullFiles(projectId: string, pullNumber: number | null) {
  const [files, setFiles] = useState<readonly BacksterosGithubPullRequestFile[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean, signal?: AbortSignal) => {
      if (pullNumber == null) {
        setFiles([]);
        setError(null);
        return;
      }
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setFiles([]);
      }
      setError(null);
      try {
        const result = await fetchBacksterosProjectGithubPullFiles(
          projectId,
          pullNumber,
          nextPage,
          signal,
        );
        if (signal?.aborted) return;
        setFiles((prev) => (append ? [...prev, ...result.files] : result.files));
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (err) {
        if (signal?.aborted) return;
        if (!append) setFiles([]);
        setError(err instanceof Error ? err.message : "Could not load pull request files.");
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [projectId, pullNumber],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(1, false, controller.signal);
    return () => controller.abort();
  }, [loadPage]);

  return {
    files,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMore: () => void loadPage(page + 1, true),
  };
}
