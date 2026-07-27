import { useCallback, useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, RefreshCw } from "lucide-react";

import { projectFs, type FsTreeEntry } from "../../lib/project-fs";

type TreeNode = FsTreeEntry & {
  children?: TreeNode[];
  loaded?: boolean;
  open?: boolean;
};

export type AgentSurfaceFilesPaneProps = {
  cwd: string;
  onOpenFile?: (relativePath: string) => void;
};

export function AgentSurfaceFilesPane({
  cwd,
  onOpenFile,
}: AgentSurfaceFilesPaneProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
              onToggleDir={(p) => void toggleDir(p)}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      ) : null}
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
  onToggleDir,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  onToggleDir: (path: string) => void;
  onOpenFile?: (relativePath: string) => void;
}) {
  const isDir = node.kind === "directory";
  return (
    <li>
      <button
        type="button"
        className="agent-surface-files-row"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (isDir) onToggleDir(node.path);
          else onOpenFile?.(node.path);
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
          <File size={13} aria-hidden />
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
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
