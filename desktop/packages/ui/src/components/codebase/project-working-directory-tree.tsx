"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { LIST_KEYBOARD_NAV_ZONE_CONTENT } from "../../list-nav/list-keyboard-nav-zone.js";
import { boardKeyboardNavDirection } from "../../list-nav/board-keyboard-nav.js";
import { isBlockingModalOpen } from "../../shortcuts/shortcut-guards.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";
import { useCommandPalette } from "../command-palette/command-palette-context.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { ComposeFolderIcon } from "../compose/compose-folder-icon.js";
import { FileTypeIcon } from "../documents/file-type-icon.js";
import { FileDeleteConfirmModal } from "./file-delete-confirm-modal.js";
import { FsTreeInlineCreate } from "./fs-tree-inline-create.js";
import {
  isFsTreeCreateShortcutKey,
  setFsTreeKeyboardActive,
} from "./fs-tree-create-shortcut.js";
import type { SelectProjectFileHandler } from "./select-project-file.js";
import type { FsTreeEntry, ProjectFsClient } from "./project-fs-types.js";

type PendingCreate = {
  kind: "file" | "directory";
  parentPath: string;
  depth: number;
};

type VisibleNode = {
  path: string;
  name: string;
  kind: "file" | "directory";
  depth: number;
  parentPath: string | null;
};

type FolderState = {
  children: FsTreeEntry[] | null;
  loading: boolean;
  error: string | null;
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={`console-fs-tree-chevron${expanded ? " is-expanded" : ""}`}
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function flattenVisible(
  entries: FsTreeEntry[],
  expandedPaths: ReadonlySet<string>,
  folderState: Record<string, FolderState>,
  depth = 0,
  parentPath: string | null = null,
): VisibleNode[] {
  const result: VisibleNode[] = [];
  for (const entry of entries) {
    result.push({
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      depth,
      parentPath,
    });
    if (entry.kind === "directory" && expandedPaths.has(entry.path)) {
      const children = folderState[entry.path]?.children;
      if (children) {
        result.push(
          ...flattenVisible(
            children,
            expandedPaths,
            folderState,
            depth + 1,
            entry.path,
          ),
        );
      }
    }
  }
  return result;
}

export type ProjectWorkingDirectoryTreeProps = {
  workingDirectory: string | null;
  fs: ProjectFsClient;
  selectedPath?: string | null;
  onSelectFile?: SelectProjectFileHandler;
  /** Called after a highlighted file or folder is deleted from the tree. */
  onEntryDeleted?: (path: string) => void;
  keyboardEnabled?: boolean;
  /** Increment to reload the tree (e.g. after deleting a file). */
  refreshToken?: number;
};

export function ProjectWorkingDirectoryTree({
  workingDirectory,
  fs,
  selectedPath = null,
  onSelectFile,
  onEntryDeleted,
  keyboardEnabled = true,
  refreshToken = 0,
}: ProjectWorkingDirectoryTreeProps) {
  const fsRef = useRef(fs);
  fsRef.current = fs;

  const [entries, setEntries] = useState<FsTreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [folderState, setFolderState] = useState<Record<string, FolderState>>(
    {},
  );
  const folderStateRef = useRef(folderState);
  folderStateRef.current = folderState;
  const { open: commandPaletteOpen } = useCommandPalette();
  const { activeZone } = useListKeyboardNavigationZone();
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<{
    path: string;
    name: string;
    kind: "file" | "directory";
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const treeRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_CONTENT,
  );

  useEffect(() => {
    setExpandedPaths(new Set());
    setFolderState({});
  }, [workingDirectory]);

  useEffect(() => {
    if (!workingDirectory) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fsRef.current.listEntries(workingDirectory)
      .then((listing) => {
        if (controller.signal.aborted) return;
        if (listing.error) {
          setEntries([]);
          setError(listing.error);
          return;
        }
        setEntries(listing.entries);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if ((loadError as { name?: string }).name === "AbortError") return;
        setEntries([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not list working directory.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshToken, workingDirectory]);

  const loadFolder = useCallback(async (path: string, signal?: AbortSignal) => {
    setFolderState((current) => ({
      ...current,
      [path]: {
        children: current[path]?.children ?? null,
        loading: true,
        error: null,
      },
    }));
    try {
      const listing = await fsRef.current.listEntries(path);
      if (signal?.aborted) return;
      if (listing.error) {
        setFolderState((current) => ({
          ...current,
          [path]: {
            children: current[path]?.children ?? null,
            loading: false,
            error: listing.error ?? "Could not list folder.",
          },
        }));
        return;
      }
      setFolderState((current) => ({
        ...current,
        [path]: {
          children: listing.entries,
          loading: false,
          error: null,
        },
      }));
    } catch (loadError: unknown) {
      if (signal?.aborted) return;
      if ((loadError as { name?: string }).name === "AbortError") return;
      setFolderState((current) => ({
        ...current,
        [path]: {
          children: current[path]?.children ?? null,
          loading: false,
          error:
            loadError instanceof Error
              ? loadError.message
              : "Could not list folder.",
        },
      }));
    }
  }, []);

  // Load children for newly expanded folders. Depend only on `expandedPaths`
  // so completing a fetch (folderState update) does not abort in-flight work.
  useEffect(() => {
    const controllers: AbortController[] = [];
    for (const path of expandedPaths) {
      const state = folderStateRef.current[path];
      if (state?.children != null || state?.loading) continue;
      const controller = new AbortController();
      controllers.push(controller);
      void loadFolder(path, controller.signal);
    }
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, [expandedPaths, loadFolder]);

  useEffect(() => {
    if (!refreshToken || !workingDirectory) return;
    const controller = new AbortController();
    for (const folderPath of expandedPaths) {
      void loadFolder(folderPath, controller.signal);
    }
    return () => controller.abort();
    // Re-fetch expanded folders only when refreshToken changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [refreshToken]);

  const expandFolder = useCallback((path: string) => {
    setExpandedPaths((current) => {
      if (current.has(path)) return current;
      const next = new Set(current);
      next.add(path);
      return next;
    });
  }, []);

  const collapseFolder = useCallback((path: string) => {
    setExpandedPaths((current) => {
      if (!current.has(path)) return current;
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const visibleNodes = useMemo(
    () => flattenVisible(entries, expandedPaths, folderState),
    [entries, expandedPaths, folderState],
  );
  const itemIds = useMemo(
    () => visibleNodes.map((node) => node.path),
    [visibleNodes],
  );
  const nodesByPath = useMemo(() => {
    const map = new Map<string, VisibleNode>();
    for (const node of visibleNodes) map.set(node.path, node);
    return map;
  }, [visibleNodes]);
  const nodesByPathRef = useRef(nodesByPath);
  nodesByPathRef.current = nodesByPath;
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  const resolveNextItemId = useCallback(
    ({
      key,
      currentId,
      itemIds: ids,
    }: {
      key: string;
      currentId: string | null;
      itemIds: string[];
    }) => {
      const direction = boardKeyboardNavDirection(key);
      if (!direction) return null;

      if (direction === "up" || direction === "down") {
        if (ids.length === 0) return null;
        const index = currentId != null ? ids.indexOf(currentId) : -1;
        if (direction === "down") {
          return ids[Math.min(index + 1, ids.length - 1)] ?? ids[0] ?? null;
        }
        return ids[Math.max(index - 1, 0)] ?? ids[0] ?? null;
      }

      if (!currentId) return null;
      const node = nodesByPathRef.current.get(currentId);
      if (!node) return null;

      if (direction === "right") {
        if (node.kind !== "directory") return currentId;
        if (!expandedPathsRef.current.has(currentId)) {
          expandFolder(currentId);
          return currentId;
        }
        const children = folderStateRef.current[currentId]?.children;
        return children?.[0]?.path ?? currentId;
      }

      // left: collapse, or move to parent
      if (node.kind === "directory" && expandedPathsRef.current.has(currentId)) {
        collapseFolder(currentId);
        return currentId;
      }
      return node.parentPath ?? currentId;
    },
    [collapseFolder, expandFolder],
  );

  const onActivate = useCallback(
    (itemId: string) => {
      const node = nodesByPathRef.current.get(itemId);
      if (!node) return;
      if (node.kind === "directory") {
        toggleFolder(itemId);
        return;
      }
      onSelectFile?.(itemId, { focusEditor: true });
    },
    [onSelectFile, toggleFolder],
  );

  const navEnabled =
    keyboardEnabled && Boolean(workingDirectory) && itemIds.length > 0;
  const { highlightedId } = useListKeyboardNavigation({
    containerRef: treeRef,
    itemIds,
    selectedId: selectedPath,
    onNavigate: onActivate,
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    // Keep the content-zone registration alive during inline create. Disabling
    // it unregisters the tree, sync falls through to the sidepanel, and that
    // steals focus → blur-cancels the empty rename field.
    enabled: navEnabled,
    resolveNextItemId,
  });
  const highlightedIdRef = useRef(highlightedId);
  highlightedIdRef.current = highlightedId;
  const selectedPathRef = useRef(selectedPath);
  selectedPathRef.current = selectedPath;
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;

  // Keep compose suppressed while the files list owns the content zone so
  // plain C creates a file here instead of opening compose.
  const filesTreeFocused =
    keyboardEnabled &&
    Boolean(workingDirectory) &&
    !commandPaletteOpen &&
    activeZone === LIST_KEYBOARD_NAV_ZONE_CONTENT;
  const ownsTreeShortcuts =
    filesTreeFocused && pendingCreate == null && pendingDelete == null;

  useEffect(() => {
    setFsTreeKeyboardActive(filesTreeFocused);
    return () => setFsTreeKeyboardActive(false);
  }, [filesTreeFocused]);

  const beginCreate = useCallback(
    (kind: "file" | "directory") => {
      const root = workingDirectoryRef.current;
      if (!root) return false;

      const focusPath =
        highlightedIdRef.current ?? selectedPathRef.current ?? null;
      let parentPath = root;
      let depth = 0;

      if (focusPath) {
        const node = nodesByPathRef.current.get(focusPath);
        if (node?.kind === "directory") {
          parentPath = node.path;
          depth = node.depth + 1;
          expandFolder(node.path);
        } else if (node) {
          parentPath = node.parentPath ?? root;
          depth = node.depth;
        }
      }

      setPendingCreate({ kind, parentPath, depth });
      return true;
    },
    [expandFolder],
  );

  const beginDeleteHighlighted = useCallback(() => {
    const focusPath =
      highlightedIdRef.current ?? selectedPathRef.current ?? null;
    if (!focusPath) return false;
    const node = nodesByPathRef.current.get(focusPath);
    if (!node) return false;
    if (node.path === workingDirectoryRef.current) return false;
    setDeleteError(null);
    setPendingDelete({
      path: node.path,
      name: node.name,
      kind: node.kind,
    });
    return true;
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || !workingDirectory || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await fsRef.current.deleteEntry(workingDirectory, pendingDelete.path);
      const deletedPath = pendingDelete.path;
      setPendingDelete(null);
      onEntryDeleted?.(deletedPath);

      // Refresh local tree state immediately.
      const rootListing = await fsRef.current.listEntries(workingDirectory);
      if (rootListing.error) {
        throw new Error(rootListing.error);
      }
      setEntries(rootListing.entries);
      setExpandedPaths((current) => {
        const next = new Set<string>();
        for (const path of current) {
          if (path === deletedPath) continue;
          if (path.startsWith(`${deletedPath}/`)) continue;
          next.add(path);
        }
        return next;
      });
      setFolderState((current) => {
        const next: Record<string, FolderState> = {};
        for (const [path, state] of Object.entries(current)) {
          if (path === deletedPath || path.startsWith(`${deletedPath}/`)) {
            continue;
          }
          next[path] = state;
        }
        return next;
      });
    } catch (deleteErr: unknown) {
      setDeleteError(
        deleteErr instanceof Error
          ? deleteErr.message
          : "Could not delete.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleting, onEntryDeleted, pendingDelete, workingDirectory]);

  useEffect(() => {
    if (!ownsTreeShortcuts) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isBlockingModalOpen() || !shouldHandleGlobalShortcut(event)) return;

      if (isFsTreeCreateShortcutKey(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        beginCreate(event.shiftKey ? "directory" : "file");
        return;
      }

      if (
        event.key.toLowerCase() === "d" &&
        !event.shiftKey &&
        beginDeleteHighlighted()
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [beginCreate, beginDeleteHighlighted, ownsTreeShortcuts]);

  useEffect(() => {
    if (!pendingDelete) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "d" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      void confirmDelete();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [confirmDelete, pendingDelete]);

  const submitCreate = useCallback(
    async (name: string) => {
      const pending = pendingCreate;
      const root = workingDirectory;
      if (!pending || !root) {
        return { ok: false as const, error: "Nothing to create." };
      }

      try {
        const created = await fsRef.current.createEntry({
          root,
          parent: pending.parentPath,
          name,
          kind: pending.kind,
        });
        const createdPath = created.path;
        if (!createdPath) {
          return { ok: false as const, error: "Could not create." };
        }

        // Refresh root listing and the parent folder (if nested).
        const rootListing = await fsRef.current.listEntries(root);
        if (rootListing.error) {
          return { ok: false as const, error: rootListing.error };
        }
        setEntries(rootListing.entries);
        if (pending.parentPath !== root) {
          await loadFolder(pending.parentPath);
          expandFolder(pending.parentPath);
        }

        if (pending.kind === "file") {
          onSelectFile?.(createdPath, { focusEditor: true });
        } else {
          expandFolder(createdPath);
        }

        return { ok: true as const };
      } catch (createError: unknown) {
        return {
          ok: false as const,
          error:
            createError instanceof Error
              ? createError.message
              : "Could not create.",
        };
      }
    },
    [
      expandFolder,
      loadFolder,
      onSelectFile,
      pendingCreate,
      workingDirectory,
    ],
  );

  if (!workingDirectory) {
    return (
      <p className="console-github-pane-status">
        Set a working directory to browse project files.
      </p>
    );
  }

  if (loading && entries.length === 0 && !pendingCreate) {
    return <p className="console-github-pane-status">Loading files…</p>;
  }

  if (error && entries.length === 0 && !pendingCreate) {
    return (
      <p className="console-github-pane-error" role="alert">
        {error}
      </p>
    );
  }

  const showEmptyHint = entries.length === 0 && !pendingCreate;

  return (
    <>
    <ul
      ref={treeRef}
      className="console-fs-tree"
      role="tree"
      aria-label="Working directory"
      {...listContainerProps}
    >
      {pendingCreate && pendingCreate.parentPath === workingDirectory ? (
        <FsTreeInlineCreate
          kind={pendingCreate.kind}
          depth={pendingCreate.depth}
          onCancel={() => setPendingCreate(null)}
          onSubmit={submitCreate}
        />
      ) : null}

      {showEmptyHint ? (
        <li className="console-fs-tree-status" role="presentation">
          Empty — press C for a file, ⇧C for a folder.
        </li>
      ) : null}

      {visibleNodes.map((node) => {
        const expanded =
          node.kind === "directory" && expandedPaths.has(node.path);
        const folder = folderState[node.path];
        const highlighted = highlightedId === node.path;
        const selected = selectedPath === node.path;
        const showCreateAfter =
          pendingCreate != null &&
          pendingCreate.parentPath === node.path &&
          node.kind === "directory";

        return (
          <Fragment key={node.path}>
            <li
              className="console-fs-tree-item"
              {...keyboardNavItemProps(node.path)}
            >
              <button
                type="button"
                className={`console-fs-tree-row${
                  node.kind === "file" ? " is-file" : ""
                }${selected ? " is-selected" : ""} ${keyboardNavListItemClass(
                  highlighted,
                )}`}
                style={{ paddingLeft: 8 + node.depth * 14 }}
                aria-expanded={
                  node.kind === "directory" ? expanded : undefined
                }
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  if (node.kind === "directory") {
                    toggleFolder(node.path);
                    return;
                  }
                  onSelectFile?.(node.path, {
                    newTab: event.metaKey || event.ctrlKey,
                    focusEditor: true,
                  });
                }}
              >
                {node.kind === "directory" ? (
                  <ChevronIcon expanded={expanded} />
                ) : (
                  <span
                    className="console-fs-tree-chevron-spacer"
                    aria-hidden="true"
                  />
                )}
                {node.kind === "directory" ? (
                  <ComposeFolderIcon className="console-fs-tree-icon" />
                ) : (
                  <FileTypeIcon
                    pathValue={node.path}
                    className="console-fs-tree-icon console-fs-tree-file-type-icon"
                  />
                )}
                <span className="console-fs-tree-name">{node.name}</span>
              </button>
              {node.kind === "directory" &&
              expanded &&
              folder?.loading &&
              folder.children == null ? (
                <p
                  className="console-fs-tree-status"
                  style={{ paddingLeft: 24 + node.depth * 14 }}
                >
                  Loading…
                </p>
              ) : null}
              {node.kind === "directory" && expanded && folder?.error ? (
                <p
                  className="console-fs-tree-status is-error"
                  style={{ paddingLeft: 24 + node.depth * 14 }}
                >
                  {folder.error}
                </p>
              ) : null}
              {node.kind === "directory" &&
              expanded &&
              folder?.children &&
              folder.children.length === 0 &&
              !folder.loading &&
              !showCreateAfter ? (
                <p
                  className="console-fs-tree-status"
                  style={{ paddingLeft: 24 + node.depth * 14 }}
                >
                  Empty
                </p>
              ) : null}
            </li>
            {showCreateAfter && pendingCreate ? (
              <FsTreeInlineCreate
                kind={pendingCreate.kind}
                depth={pendingCreate.depth}
                onCancel={() => setPendingCreate(null)}
                onSubmit={submitCreate}
              />
            ) : null}
          </Fragment>
        );
      })}
    </ul>

    {pendingDelete ? (
      <FileDeleteConfirmModal
        fileName={pendingDelete.name}
        kind={pendingDelete.kind}
        deleting={deleting}
        error={deleteError}
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
      />
    ) : null}
    </>
  );
}
