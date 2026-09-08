import type {
  GithubPullRequestFile,
  GithubPullRequestFileStatus,
} from "@backsteros/contracts";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { toUnifiedDiff } from "../../codebase/pierre-diff-rendering.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { apiErrorMessage } from "./api-error-message.js";
import { PierreCommitFilesDiff } from "./pierre-commit-files-diff.js";
import type { CodebaseRequestJson } from "./project-fs-types.js";

import "@git-diff-view/react/styles/diff-view.css";

function langFromFilename(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  const ext = base.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "html":
    case "htm":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "py":
      return "python";
    case "rb":
      return "ruby";
    case "php":
      return "php";
    case "java":
      return "java";
    case "kt":
      return "kotlin";
    case "swift":
      return "swift";
    case "sql":
      return "sql";
    case "sh":
    case "bash":
    case "zsh":
      return "bash";
    case "toml":
      return "toml";
    case "xml":
      return "xml";
    case "vue":
      return "vue";
    case "svelte":
      return "svelte";
    default:
      return ext || "plaintext";
  }
}

function statusLabel(status: GithubPullRequestFileStatus): string {
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

type FilesPage = {
  files: GithubPullRequestFile[];
  page: number;
  hasMore: boolean;
};

export function GithubFilesDiffPane({
  cacheKey,
  fetchPage,
  autoFocusList = false,
  onSelectedFilenameChange,
  /**
   * `workbench` — file rail + split diff (project console).
   * `stacked` — unified multi-file scroll (BacksterDEV DiffPanel-style).
   */
  presentation = "workbench",
}: {
  cacheKey: string;
  fetchPage: (page: number) => Promise<FilesPage>;
  /** When true, claim j/k on the file list once files load (commit detail). */
  autoFocusList?: boolean;
  onSelectedFilenameChange?: (filename: string | null) => void;
  presentation?: "workbench" | "stacked";
}) {
  const [files, setFiles] = useState<GithubPullRequestFile[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const autoFocusedCacheKeyRef = useRef<string | null>(null);
  const fileListRef = useRef<HTMLUListElement>(null);
  const { setActiveZone } = useListKeyboardNavigationZone();
  const fileListContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const generation = requestGenerationRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setFiles([]);
        setSelectedFilename(null);
      }
      setError(null);
      try {
        const result = await fetchPage(nextPage);
        if (generation !== requestGenerationRef.current) return;
        setFiles((previous) =>
          append ? [...previous, ...result.files] : result.files,
        );
        setPage(result.page);
        setHasMore(result.hasMore);
        loadedForRef.current = cacheKey;
        if (!append) {
          setSelectedFilename(result.files[0]?.filename ?? null);
        }
      } catch (err) {
        if (generation !== requestGenerationRef.current) return;
        setError(apiErrorMessage(err));
        if (!append) {
          setFiles([]);
          setHasMore(false);
        }
      } finally {
        if (generation === requestGenerationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [cacheKey, fetchPage],
  );

  useEffect(() => {
    if (loadedForRef.current === cacheKey && files.length > 0) {
      return;
    }
    requestGenerationRef.current += 1;
    void loadPage(1, false);
  }, [cacheKey, files.length, loadPage]);

  const fileItemIds = useMemo(
    () => files.map((file) => file.filename),
    [files],
  );

  const selectFile = useCallback((filename: string) => {
    setSelectedFilename(filename);
  }, []);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: fileListRef,
    itemIds: fileItemIds,
    selectedId: selectedFilename,
    onNavigate: selectFile,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    priority: 20,
    enabled: autoFocusList && fileItemIds.length > 0,
  });

  useEffect(() => {
    if (!highlightedId) return;
    if (highlightedId === selectedFilename) return;
    setSelectedFilename(highlightedId);
  }, [highlightedId, selectedFilename]);

  useEffect(() => {
    onSelectedFilenameChange?.(selectedFilename);
  }, [onSelectedFilenameChange, selectedFilename]);

  useEffect(() => {
    if (!autoFocusList) return;
    if (fileItemIds.length === 0) return;
    if (autoFocusedCacheKeyRef.current === cacheKey) return;
    autoFocusedCacheKeyRef.current = cacheKey;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveZone("main", { activate: true });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusList, cacheKey, fileItemIds.length, setActiveZone]);

  const selected = useMemo(
    () => files.find((file) => file.filename === selectedFilename) ?? null,
    [files, selectedFilename],
  );

  const diffData = useMemo(() => {
    if (!selected?.patch) return null;
    const lang = langFromFilename(selected.filename);
    const oldName = selected.previousFilename ?? selected.filename;
    const unified = toUnifiedDiff(
      selected.filename,
      selected.previousFilename,
      selected.patch,
      selected.status,
    );
    return {
      oldFile: {
        fileName: oldName,
        fileLang: lang,
        content: "",
      },
      newFile: {
        fileName: selected.filename,
        fileLang: lang,
        content: "",
      },
      hunks: [unified],
    };
  }, [selected]);

  if (presentation === "stacked") {
    return (
      <section
        className="console-pull-files console-pull-files--stacked"
        aria-label="Changed files"
      >
        {error ? (
          <p className="console-github-pane-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading && files.length === 0 ? (
          <p className="console-github-pane-status">Loading files…</p>
        ) : null}
        {!loading && !error && files.length === 0 ? (
          <p className="console-github-pane-status">No files changed.</p>
        ) : null}
        {files.length > 0 ? (
          <div className="console-pull-files-stacked-scroll">
            <PierreCommitFilesDiff files={files} cacheKey={cacheKey} theme="dark" />
            {hasMore ? (
              <div className="console-github-pane-more">
                <button
                  type="button"
                  className="console-btn"
                  disabled={loadingMore}
                  onClick={() => {
                    void loadPage(page + 1, true);
                  }}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="console-pull-files" aria-label="Changed files">
      <aside className="console-pull-files-rail" aria-label="File list">
        {error ? (
          <p className="console-github-pane-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading && files.length === 0 ? (
          <p className="console-github-pane-status">Loading files…</p>
        ) : null}
        {!loading && !error && files.length === 0 ? (
          <p className="console-github-pane-status">No files changed.</p>
        ) : null}
        {files.length > 0 ? (
          <ul
            ref={fileListRef}
            className="console-pull-files-list"
            {...fileListContainerProps}
          >
            {files.map((file) => {
              const dir = dirname(file.filename);
              const name = basename(file.filename);
              return (
                <li key={file.filename}>
                  <button
                    type="button"
                    {...keyboardNavItemProps(file.filename)}
                    className={[
                      "console-pull-files-item",
                      keyboardNavListItemClass(highlightedId === file.filename),
                      selectedFilename === file.filename ? "is-selected" : null,
                      `is-${file.status}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedFilename(file.filename)}
                    title={file.filename}
                  >
                    <span
                      className="console-pull-files-item-status"
                      aria-label={file.status}
                    >
                      {statusLabel(file.status)}
                    </span>
                    <span className="console-pull-files-item-path">
                      <span className="console-pull-files-item-name">{name}</span>
                      {dir ? (
                        <span className="console-pull-files-item-dir">{dir}</span>
                      ) : null}
                    </span>
                    <span className="console-pull-files-item-stat">
                      <span className="is-add">+{file.additions}</span>
                      <span className="is-del">−{file.deletions}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {hasMore ? (
          <div className="console-github-pane-more">
            <button
              type="button"
              className="console-btn"
              disabled={loadingMore}
              onClick={() => {
                void loadPage(page + 1, true);
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </aside>

      <div className="console-pull-files-diff">
        {selected ? (
          <>
            <header className="console-pull-files-diff-header">
              <div className="console-pull-files-diff-title">
                <ProjectOcticon icon="file" size={14} />
                <span title={selected.filename}>{selected.filename}</span>
              </div>
              <div className="console-pull-files-diff-stat" aria-label="Diff stats">
                <span className="is-add">+{selected.additions}</span>
                <span className="is-del">−{selected.deletions}</span>
              </div>
            </header>
            {diffData ? (
              <div className="console-pull-files-diff-body">
                <DiffView
                  key={selected.filename}
                  data={diffData}
                  diffViewMode={DiffModeEnum.Split}
                  diffViewTheme="dark"
                  diffViewHighlight
                  diffViewWrap={false}
                  diffViewFontSize={12}
                />
              </div>
            ) : (
              <div className="console-pull-files-diff-empty">
                <ProjectOcticon icon="diff" size={18} />
                <p>Binary file or diff too large to display.</p>
              </div>
            )}
          </>
        ) : (
          <div className="console-pull-files-diff-empty">
            <ProjectOcticon icon="file-directory" size={18} />
            <p>Select a file to view changes.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function PullRequestFilesPane({
  projectId,
  pullNumber,
  requestJson,
  autoFocusList = false,
  onSelectedFilenameChange,
}: {
  projectId: string;
  pullNumber: number;
  requestJson: CodebaseRequestJson;
  /** When true, claim j/k on the file list once files load. */
  autoFocusList?: boolean;
  onSelectedFilenameChange?: (filename: string | null) => void;
}) {
  const fetchPage = useCallback(
    async (page: number) => {
      const query = new URLSearchParams({ page: String(page) });
      return requestJson<{
        files: GithubPullRequestFile[];
        page: number;
        hasMore: boolean;
      }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${encodeURIComponent(String(pullNumber))}/files?${query.toString()}`,
      );
    },
    [projectId, pullNumber, requestJson],
  );

  return (
    <GithubFilesDiffPane
      cacheKey={`pull:${projectId}:${pullNumber}`}
      fetchPage={fetchPage}
      autoFocusList={autoFocusList}
      onSelectedFilenameChange={onSelectedFilenameChange}
    />
  );
}

export function CommitFilesPane({
  projectId,
  sha,
  requestJson,
  autoFocusList = false,
  presentation = "workbench",
}: {
  projectId: string;
  sha: string;
  requestJson: CodebaseRequestJson;
  autoFocusList?: boolean;
  presentation?: "workbench" | "stacked";
}) {
  const fetchPage = useCallback(async () => {
    const result = await requestJson<{
      files: GithubPullRequestFile[];
    }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits/${encodeURIComponent(sha)}`,
    );
    return {
      files: result.files,
      page: 1,
      hasMore: false,
    };
  }, [projectId, requestJson, sha]);

  return (
    <GithubFilesDiffPane
      cacheKey={`commit:${projectId}:${sha}`}
      fetchPage={fetchPage}
      autoFocusList={autoFocusList}
      presentation={presentation}
    />
  );
}
