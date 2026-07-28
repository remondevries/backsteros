import { useCallback, useEffect, useState } from "react";
import { FileDetailPane, FileTypeIcon } from "@backsteros/ui";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";

import { projectFs, type FsTreeEntry } from "../../lib/project-fs";

type TreeNode = FsTreeEntry & {
  children?: TreeNode[];
  loaded?: boolean;
  open?: boolean;
};

export type AgentSurfaceFilesPaneProps = {
  cwd: string;
};

/**
 * Project file browser matching the codebase workbench Files experience:
 * tree on the left, FileDetailPane (CodeMirror) on the right.
 */
export function AgentSurfaceFilesPane({ cwd }: AgentSurfaceFilesPaneProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

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
    // Reset open editors when the working directory changes.
    setOpenPaths([]);
    setActivePath(null);
  }, [cwd]);

  const openFile = useCallback((path: string) => {
    setOpenPaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setActivePath(path);
  }, []);

  const toggleDir = async (path: string) => {
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

    const target = findNode(roots, path);
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
  };

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
            <ul className="agent-surface-files-tree">
              {roots.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={activePath}
                  onToggleDir={(p) => void toggleDir(p)}
                  onOpenFile={openFile}
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
  onToggleDir,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const isDir = node.kind === "directory";
  const isSelected = !isDir && node.path === selectedPath;
  return (
    <li>
      <button
        type="button"
        className={`agent-surface-files-row${isSelected ? " is-selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
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
        <ul>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
