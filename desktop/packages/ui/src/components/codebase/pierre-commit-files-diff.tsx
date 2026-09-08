import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import type { GithubPullRequestFile } from "@backsteros/contracts";
import { useCallback, useMemo, useState } from "react";

import {
  PIERRE_DIFF_UNSAFE_CSS,
  parseGithubFilesToPierreDiffs,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "../../codebase/pierre-diff-rendering.js";
import { PierreDiffWorkerPoolProvider } from "./pierre-diff-worker-pool.js";

function collapseIconClass(fileDiff: FileDiffMetadata): string {
  switch (fileDiff.type) {
    case "new":
      return "pierre-commit-diff__collapse is-added";
    case "deleted":
      return "pierre-commit-diff__collapse is-removed";
    case "change":
    case "rename-pure":
    case "rename-changed":
      return "pierre-commit-diff__collapse is-modified";
    default:
      return "pierre-commit-diff__collapse";
  }
}

/**
 * Multi-file Pierre CodeView for task Changes / stacked commit diffs.
 * Matches BacksterDEV DiffPanel surface (unified, sticky headers, worker pool).
 */
export function PierreCommitFilesDiff({
  files,
  cacheKey,
  theme = "dark",
}: {
  files: ReadonlyArray<GithubPullRequestFile>;
  cacheKey: string;
  theme?: "light" | "dark";
}) {
  const { fileDiffs, skipped } = useMemo(
    () => parseGithubFilesToPierreDiffs(files, cacheKey),
    [cacheKey, files],
  );

  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleCollapsed = useCallback((fileKey: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  }, []);

  const items = useMemo((): CodeViewItem[] => {
    return fileDiffs.map((fileDiff) => {
      const id = resolveFileDiffPath(fileDiff) || fileDiff.cacheKey || "file";
      return {
        type: "diff" as const,
        id,
        fileDiff,
        collapsed: collapsedIds.has(id),
      };
    });
  }, [collapsedIds, fileDiffs]);

  const diffThemeName = resolveDiffThemeName(theme);

  if (fileDiffs.length === 0 && skipped.length === 0) {
    return <p className="console-github-pane-status">No files changed.</p>;
  }

  return (
    <div className="pierre-commit-diff">
      {fileDiffs.length > 0 ? (
        <PierreDiffWorkerPoolProvider theme={theme}>
          <CodeView
            className="pierre-commit-diff__view"
            items={items}
            renderHeaderPrefix={(item) => {
              if (item.type !== "diff") return null;
              const fileDiff = item.fileDiff;
              const fileKey = item.id;
              const collapsed = item.collapsed === true;
              const filePath = resolveFileDiffPath(fileDiff);
              return (
                <button
                  type="button"
                  className={collapseIconClass(fileDiff)}
                  aria-label={collapsed ? `Expand ${filePath}` : `Collapse ${filePath}`}
                  aria-expanded={!collapsed}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsed(fileKey);
                  }}
                >
                  <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
                </button>
              );
            }}
            options={{
              diffStyle: "unified",
              lineDiffType: "none",
              overflow: "scroll",
              theme: diffThemeName,
              preferredHighlighter: "shiki-wasm",
              themeType: theme,
              stickyHeaders: true,
              unsafeCSS: PIERRE_DIFF_UNSAFE_CSS,
              itemMetrics: {
                diffHeaderHeight: 32,
                hunkSeparatorHeight: 24,
                spacing: 0,
                paddingTop: 0,
                paddingBottom: 8,
              },
              layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
            }}
          />
        </PierreDiffWorkerPoolProvider>
      ) : null}
      {skipped.map((file) => (
        <article
          key={file.filename}
          className="console-pull-files-stacked-file"
          aria-label={file.filename}
        >
          <header className="console-pull-files-stacked-header">
            <span className="console-pull-files-stacked-path" title={file.filename}>
              {file.filename}
            </span>
          </header>
          <div className="console-pull-files-diff-empty console-pull-files-diff-empty--inline">
            <p>Binary file or diff too large to display.</p>
          </div>
        </article>
      ))}
    </div>
  );
}
