import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBacksterosProjectFsFile } from "~/backsteros/client";
import { BacksterosDocumentIcon } from "~/backsteros/DocumentIcon";
import {
  buildDocumentTree,
  codebaseRepoDocsToTreeSources,
  type DocumentTreeNode,
} from "~/backsteros/documentTree";
import { BacksterosMarkdownPreview } from "~/backsteros/markdown-editor";
import type { BacksterosProjectRepoDocEntry } from "~/backsteros/types";
import { cn } from "~/lib/utils";
import "~/backsteros/codebaseDocs.css";

function ChevronIcon(props: { readonly expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      className={cn("bos-codebase-docs__chevron", props.expanded && "is-expanded")}
    >
      <path
        d="M4 2.5L8 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function DocsTreeNodeView(props: {
  readonly node: DocumentTreeNode;
  readonly depth: number;
  readonly selectedPath: string | null;
  readonly collapsedFolderIds: ReadonlySet<string>;
  readonly onToggleFolder: (folderId: string) => void;
  readonly onSelectDocument: (path: string) => void;
}) {
  const { node, depth, selectedPath, collapsedFolderIds, onToggleFolder, onSelectDocument } = props;
  const paddingLeft = depth > 0 ? depth * 12 : undefined;

  if (node.type === "folder") {
    const collapsed = collapsedFolderIds.has(node.id);
    return (
      <li className="bos-codebase-docs__tree-item">
        <div style={paddingLeft != null ? { paddingLeft } : undefined}>
          <button
            type="button"
            className="bos-codebase-docs__row bos-codebase-docs__row--folder"
            aria-expanded={!collapsed}
            title="Click to expand or collapse"
            onClick={() => onToggleFolder(node.id)}
          >
            <span className="bos-codebase-docs__row-icon" aria-hidden="true">
              <ChevronIcon expanded={!collapsed} />
            </span>
            <span className="bos-codebase-docs__row-label">{node.title}</span>
          </button>
        </div>
        {!collapsed && node.children.length > 0 ? (
          <ul className="bos-codebase-docs__tree-children">
            {node.children.map((child) => (
              <DocsTreeNodeView
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                collapsedFolderIds={collapsedFolderIds}
                onToggleFolder={onToggleFolder}
                onSelectDocument={onSelectDocument}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const isSelected = node.path === selectedPath;
  return (
    <li className="bos-codebase-docs__tree-item">
      <div style={paddingLeft != null ? { paddingLeft } : undefined}>
        <button
          type="button"
          className={cn("bos-codebase-docs__row", isSelected && "is-selected")}
          onClick={() => onSelectDocument(node.path)}
        >
          <span className="bos-codebase-docs__row-icon" aria-hidden="true">
            <BacksterosDocumentIcon size={14} />
          </span>
          <span className="bos-codebase-docs__row-label">{node.title}</span>
        </button>
      </div>
    </li>
  );
}

function findDocumentTitle(nodes: readonly DocumentTreeNode[], path: string): string | null {
  for (const node of nodes) {
    if (node.type === "document" && node.path === path) return node.title;
    if (node.type === "folder") {
      const found = findDocumentTitle(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function isWorkingDirectoryError(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    (lower.includes("working directory") &&
      (lower.includes("not found") ||
        lower.includes("not linked") ||
        lower.includes("no local") ||
        lower.includes("cannot see"))) ||
    lower.includes("local-core is unreachable") ||
    lower.includes("local-core cannot")
  );
}

export function BacksterosCodebaseDocsPanel(props: {
  readonly projectId: string;
  readonly entries: readonly BacksterosProjectRepoDocEntry[];
  readonly docsPresent: boolean;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly workingDirectoryMissing?: boolean;
  readonly emptyLabel?: string;
  readonly onRetry?: () => void;
}) {
  const {
    projectId,
    entries,
    docsPresent,
    loading = false,
    error = null,
    workingDirectoryMissing = false,
    emptyLabel = "No docs in this repository.",
    onRetry,
  } = props;

  const tree = useMemo(() => buildDocumentTree(codebaseRepoDocsToTreeSources(entries)), [entries]);

  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPath(null);
    setBody("");
    setFileError(null);
    setCollapsedFolderIds(new Set());
  }, [projectId]);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setBody("");
      setFileError(null);
      return;
    }
    const controller = new AbortController();
    setFileLoading(true);
    setFileError(null);
    void fetchBacksterosProjectFsFile(projectId, selectedPath, controller.signal)
      .then((file) => {
        if (controller.signal.aborted) return;
        if (file.binary || file.content == null) {
          setBody("");
          setFileError("This file cannot be previewed as text.");
          return;
        }
        setBody(file.content);
        setFileError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setBody("");
        setFileError(err instanceof Error ? err.message : "Could not open this document.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setFileLoading(false);
      });
    return () => controller.abort();
  }, [projectId, selectedPath]);

  const selectedTitle = selectedPath
    ? (findDocumentTitle(tree, selectedPath) ?? selectedPath.split("/").pop() ?? selectedPath)
    : null;

  const cwdUnavailable = workingDirectoryMissing || isWorkingDirectoryError(error);

  const treeEmptyMessage = cwdUnavailable
    ? "Local-core cannot browse this project's working directory yet."
    : loading && entries.length === 0
      ? "Loading documents…"
      : error && entries.length === 0
        ? error
        : entries.length === 0
          ? emptyLabel
          : null;

  const showRetry =
    Boolean(onRetry) && Boolean(error) && entries.length === 0 && !cwdUnavailable && !loading;

  const detailOpen = Boolean(selectedPath) && entries.length > 0;

  return (
    <div
      className={cn(
        "bos-codebase-docs",
        detailOpen ? "bos-codebase-docs--split" : "bos-codebase-docs--list-only",
      )}
    >
      <div className="bos-codebase-docs__tree-pane">
        <div className="bos-codebase-docs__tree" role="navigation" aria-label="Project documents">
          {treeEmptyMessage ? (
            <div className="bos-codebase-docs__empty">
              <p>{treeEmptyMessage}</p>
              {cwdUnavailable ? (
                <p>
                  {workingDirectoryMissing
                    ? "Set a working directory with the folder chip in the overview (absolute path on this Mac)."
                    : "Start local-core (or the Mac API gateway). Files and Documents read the working copy from local-core — not the cloud product API."}
                </p>
              ) : null}
              {!docsPresent && !cwdUnavailable && !error && !loading && entries.length === 0 ? (
                <p>Looking for a `docs/` folder and pinned root files like `AGENTS.md`.</p>
              ) : null}
              {showRetry ? (
                <button type="button" className="bos-codebase-docs__retry" onClick={onRetry}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="bos-codebase-docs__tree-list">
              {tree.map((node) => (
                <DocsTreeNodeView
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  collapsedFolderIds={collapsedFolderIds}
                  onToggleFolder={toggleFolder}
                  onSelectDocument={setSelectedPath}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {detailOpen ? (
        <div className="bos-codebase-docs__detail">
          {fileLoading && !body && !fileError ? (
            <div className="bos-codebase-docs__empty">
              <p>Loading…</p>
            </div>
          ) : fileError ? (
            <div className="bos-codebase-docs__empty">
              <p role="alert">{fileError}</p>
            </div>
          ) : (
            <div className="bos-codebase-docs__scrollport">
              <article className="bos-codebase-docs__article">
                <h1 className="bos-codebase-docs__title">{selectedTitle}</h1>
                {body.trim() ? (
                  <BacksterosMarkdownPreview body={body} />
                ) : (
                  <p className="bos-codebase-docs__empty-hint">This document is empty.</p>
                )}
              </article>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
