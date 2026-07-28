import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  FileDetailPane,
  FileTypeIcon,
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "@backsteros/ui";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";

import { projectFs, type FsTreeEntry } from "../../lib/project-fs";
import {
  AGENT_SURFACE_FOCUS,
  AGENT_SURFACE_FOCUS_ATTR,
  BLUR_AGENT_FILES_TREE_EVENT,
} from "../../lib/agent/agent-surface-focus";

type TreeNode = FsTreeEntry & {
  children?: TreeNode[];
  loaded?: boolean;
  open?: boolean;
};

export type AgentSurfaceFilesPaneProps = {
  cwd: string;
};

function flattenVisibleNodes(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.kind === "directory" && node.open && node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

function parentPathFor(nodes: TreeNode[], path: string): string | null {
  const stack: { list: TreeNode[]; parent: string | null }[] = [
    { list: nodes, parent: null },
  ];
  while (stack.length > 0) {
    const { list, parent } = stack.pop()!;
    for (const node of list) {
      if (node.path === path) return parent;
      if (node.children?.length) {
        stack.push({ list: node.children, parent: node.path });
      }
    }
  }
  return null;
}

/**
 * Project file browser matching the codebase workbench Files experience:
 * tree on the left, FileDetailPane (CodeMirror) on the right.
 */
export function AgentSurfaceFilesPane({ cwd }: AgentSurfaceFilesPaneProps) {
  const treeRef = useRef<HTMLUListElement | null>(null);
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  /** Orange keyboard ring only while the tree owns focus (cleared on Escape). */
  const [keyboardActive, setKeyboardActive] = useState(false);

  const visibleNodes = useMemo(() => flattenVisibleNodes(roots), [roots]);
  const visibleNodesRef = useRef(visibleNodes);
  visibleNodesRef.current = visibleNodes;
  const focusedPathRef = useRef(focusedPath);
  focusedPathRef.current = focusedPath;
  const keyboardActiveRef = useRef(keyboardActive);
  keyboardActiveRef.current = keyboardActive;
  const rootsRef = useRef(roots);
  rootsRef.current = roots;

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await projectFs.listEntries(cwd);
      if (result.error) {
        setError(result.error);
        setRoots([]);
        return;
      }
      setRoots(
        result.entries.map((entry) => ({
          ...entry,
          open: false,
          loaded: false,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list files.");
      setRoots([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot]);

  useEffect(() => {
    setOpenPaths([]);
    setActivePath(null);
    setFocusedPath(null);
    setKeyboardActive(false);
  }, [cwd]);

  // Remember a roving index for Tab re-entry; do not force a highlight until focused.
  useEffect(() => {
    if (focusedPath && visibleNodes.some((node) => node.path === focusedPath)) {
      return;
    }
    setFocusedPath(visibleNodes[0]?.path ?? null);
  }, [focusedPath, visibleNodes]);

  useEffect(() => {
    function handleBlurTree() {
      setKeyboardActive(false);
    }
    window.addEventListener(BLUR_AGENT_FILES_TREE_EVENT, handleBlurTree);
    return () =>
      window.removeEventListener(BLUR_AGENT_FILES_TREE_EVENT, handleBlurTree);
  }, []);

  const clearKeyboardFocus = useCallback(() => {
    setKeyboardActive(false);
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      treeRef.current?.contains(active)
    ) {
      active.blur();
    }
  }, []);

  const openFile = useCallback((path: string) => {
    setOpenPaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setActivePath(path);
    setFocusedPath(path);
  }, []);

  const focusRow = useCallback((path: string) => {
    setFocusedPath(path);
    setKeyboardActive(true);
    const row = treeRef.current?.querySelector<HTMLElement>(
      `[data-keyboard-nav-item="${CSS.escape(path)}"] .agent-surface-files-row`,
    );
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  }, []);

  const handleTreeFocusIn = useCallback(() => {
    setKeyboardActive(true);
  }, []);

  const handleTreeFocusOut = useCallback((event: FocusEvent<HTMLUListElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && treeRef.current?.contains(next)) return;
    setKeyboardActive(false);
  }, []);

  const toggleDir = useCallback(async (path: string) => {
    setFocusedPath(path);
    setRoots((current) => {
      const next = structuredClone(current) as TreeNode[];
      const walk = (nodes: TreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.path === path) {
            node.open = !node.open;
            return true;
          }
          if (node.children && walk(node.children)) return true;
        }
        return false;
      };
      walk(next);
      return next;
    });

    const target = findNode(rootsRef.current, path);
    if (!target || target.kind !== "directory" || target.loaded) return;

    try {
      const result = await projectFs.listEntries(path);
      const children = (result.entries ?? []).map((entry) => ({
        ...entry,
        open: false,
        loaded: false,
      }));
      setRoots((current) => {
        const next = structuredClone(current) as TreeNode[];
        const apply = (nodes: TreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === path) {
              node.children = children;
              node.loaded = true;
              node.open = true;
              return true;
            }
            if (node.children && apply(node.children)) return true;
          }
          return false;
        };
        apply(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open folder.");
    }
  }, []);

  const expandDir = useCallback(
    async (path: string) => {
      const target = findNode(rootsRef.current, path);
      if (!target || target.kind !== "directory") return;
      if (target.open) return;
      await toggleDir(path);
    },
    [toggleDir],
  );

  const collapseDir = useCallback((path: string) => {
    setRoots((current) => {
      const next = structuredClone(current) as TreeNode[];
      const walk = (nodes: TreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.path === path) {
            node.open = false;
            return true;
          }
          if (node.children && walk(node.children)) return true;
        }
        return false;
      };
      walk(next);
      return next;
    });
  }, []);

  const handleTreeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key;
      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clearKeyboardFocus();
        return;
      }

      const isNext =
        key === "ArrowDown" || key === "j" || key === "J";
      const isPrev = key === "ArrowUp" || key === "k" || key === "K";
      const isExpand = key === "ArrowRight";
      const isCollapse = key === "ArrowLeft";
      const isConfirm = key === "Enter" || key === " ";

      if (!isNext && !isPrev && !isExpand && !isCollapse && !isConfirm) {
        return;
      }

      // j/k only while the tree owns keyboard focus (after Tab / click-in).
      if (!keyboardActiveRef.current && (key === "j" || key === "J" || key === "k" || key === "K")) {
        return;
      }

      const nodes = visibleNodesRef.current;
      if (nodes.length === 0) return;

      const currentPath =
        focusedPathRef.current ??
        nodes.find((node) => node.path === activePath)?.path ??
        nodes[0]?.path ??
        null;
      if (!currentPath) return;
      const index = nodes.findIndex((node) => node.path === currentPath);
      if (index < 0) return;
      const current = nodes[index]!;

      if (isNext || isPrev) {
        event.preventDefault();
        event.stopPropagation();
        const nextIndex = isNext
          ? Math.min(nodes.length - 1, index + 1)
          : Math.max(0, index - 1);
        const next = nodes[nextIndex];
        if (next) focusRow(next.path);
        return;
      }

      if (isExpand) {
        event.preventDefault();
        event.stopPropagation();
        if (current.kind === "directory") {
          if (!current.open) {
            void expandDir(current.path);
            return;
          }
          const firstChild = current.children?.[0];
          if (firstChild) focusRow(firstChild.path);
        }
        return;
      }

      if (isCollapse) {
        event.preventDefault();
        event.stopPropagation();
        if (current.kind === "directory" && current.open) {
          collapseDir(current.path);
          focusRow(current.path);
          return;
        }
        const parent = parentPathFor(rootsRef.current, current.path);
        if (parent) focusRow(parent);
        return;
      }

      if (isConfirm) {
        event.preventDefault();
        event.stopPropagation();
        if (current.kind === "directory") {
          void toggleDir(current.path);
        } else {
          openFile(current.path);
        }
      }
    },
    [
      activePath,
      clearKeyboardFocus,
      collapseDir,
      expandDir,
      focusRow,
      openFile,
      toggleDir,
    ],
  );

  return (
    <div className="agent-surface-pane agent-surface-pane--files">
      <div className="agent-surface-files-toolbar">
        <span className="agent-surface-files-cwd" title={cwd}>
          {cwd}
        </span>
        <button
          type="button"
          className="agent-surface-files-refresh"
          aria-label="Refresh files"
          onClick={() => void loadRoot()}
        >
          <RefreshCw size={13} aria-hidden />
        </button>
      </div>
      <div className="agent-surface-files-layout">
        <div className="agent-surface-files-tree-pane">
          {loading ? (
            <p className="agent-surface-empty">Loading files…</p>
          ) : null}
          {error ? (
            <p className="agent-surface-empty" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !error ? (
            <ul
              ref={treeRef}
              className="agent-surface-files-tree"
              role="tree"
              aria-label="Project files"
              {...{ [AGENT_SURFACE_FOCUS_ATTR]: AGENT_SURFACE_FOCUS.filesTree }}
              onKeyDown={handleTreeKeyDown}
              onFocus={handleTreeFocusIn}
              onBlur={handleTreeFocusOut}
            >
              {roots.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={activePath}
                  focusedPath={focusedPath}
                  keyboardActive={keyboardActive}
                  onToggleDir={(p) => void toggleDir(p)}
                  onOpenFile={openFile}
                  onFocusPath={setFocusedPath}
                />
              ))}
            </ul>
          ) : null}
        </div>
        <div className="agent-surface-files-preview">
          {activePath && openPaths.length > 0 ? (
            <FileDetailPane
              workingDirectory={cwd}
              openPaths={openPaths}
              activePath={activePath}
              fs={projectFs}
              onActivatePath={setActivePath}
              onClosePath={(path) => {
                setOpenPaths((current) => {
                  const next = current.filter((entry) => entry !== path);
                  setActivePath((active) => {
                    if (active !== path) return active;
                    return next[next.length - 1] ?? null;
                  });
                  return next;
                });
              }}
              onFileDeleted={(path) => {
                void loadRoot();
                setOpenPaths((current) =>
                  current.filter((entry) => entry !== path),
                );
                setActivePath((active) => (active === path ? null : active));
              }}
            />
          ) : (
            <div className="agent-surface-empty agent-surface-empty--centered">
              <File size={20} aria-hidden strokeWidth={1.6} />
              <h3>Select a file</h3>
              <p>Choose a document in the tree to edit it here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  focusedPath,
  keyboardActive,
  onToggleDir,
  onOpenFile,
  onFocusPath,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  focusedPath: string | null;
  keyboardActive: boolean;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onFocusPath: (path: string) => void;
}) {
  const isDir = node.kind === "directory";
  const isSelected = !isDir && node.path === selectedPath;
  const isFocused = node.path === focusedPath;
  const showKeyboardHighlight = keyboardActive && isFocused;
  return (
    <li role="treeitem" aria-expanded={isDir ? Boolean(node.open) : undefined} {...keyboardNavItemProps(node.path)}>
      <button
        type="button"
        tabIndex={isFocused ? 0 : -1}
        className={`agent-surface-files-row${
          isSelected ? " is-selected" : ""
        } ${keyboardNavListItemClass(showKeyboardHighlight)}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onFocus={() => onFocusPath(node.path)}
        onClick={() => {
          onFocusPath(node.path);
          if (isDir) onToggleDir(node.path);
          else onOpenFile(node.path);
        }}
      >
        {isDir ? (
          <ChevronRight
            size={12}
            aria-hidden
            className={node.open ? "is-open" : undefined}
          />
        ) : (
          <span className="agent-surface-files-spacer" />
        )}
        {isDir ? (
          node.open ? (
            <FolderOpen size={13} aria-hidden />
          ) : (
            <Folder size={13} aria-hidden />
          )
        ) : (
          <FileTypeIcon pathValue={node.path} size={13} />
        )}
        <span>{node.name}</span>
      </button>
      {isDir && node.open && node.children?.length ? (
        <ul role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              focusedPath={focusedPath}
              keyboardActive={keyboardActive}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
              onFocusPath={onFocusPath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
