import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatDiffStat } from "../lib/agent/agent-acp-activity";
import {
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  summarizeChangedFileStats,
  type AgentChatChangedFile,
} from "../lib/agent/agent-chat-timeline";
import {
  buildChangedFilesTree,
  type ChangedFileTreeNode,
} from "../lib/agent/agent-chat-work-ui";
import { DesktopAgentFileIcon } from "./desktop-agent-file-icon";

export type DesktopAgentChatChangedFilesProps = {
  turnId: string;
  files: readonly AgentChatChangedFile[];
  /** Auto-expand tree for the latest turn when the change set is small. */
  isLatestTurn?: boolean;
  onOpenTurnDiff: (turnId: string, filePath?: string) => void;
};

function DiffStat({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="desktop-agent-chat__cf-stat">
      {additions > 0 ? <span className="is-add">+{additions}</span> : null}
      {deletions > 0 ? <span className="is-del">−{deletions}</span> : null}
    </span>
  );
}

function TreeNodes({
  nodes,
  depth,
  turnId,
  expandedDirs,
  onToggleDir,
  onOpenTurnDiff,
}: {
  nodes: readonly ChangedFileTreeNode[];
  depth: number;
  turnId: string;
  expandedDirs: Record<string, boolean>;
  onToggleDir: (path: string) => void;
  onOpenTurnDiff: (turnId: string, filePath?: string) => void;
}) {
  return (
    <ul
      className="desktop-agent-chat__cf-tree"
      style={{ paddingLeft: depth > 0 ? 12 : 0 }}
    >
      {nodes.map((node) => {
        if (node.kind === "file") {
          return (
            <li key={node.path}>
              <button
                type="button"
                className="desktop-agent-chat__cf-file"
                title={node.path}
                onClick={() => onOpenTurnDiff(turnId, node.path)}
              >
                <DesktopAgentFileIcon
                  pathValue={node.path}
                  kind="file"
                  className="desktop-agent-chat__cf-file-icon"
                />
                <span className="desktop-agent-chat__cf-file-name">
                  {node.name}
                </span>
                <DiffStat
                  additions={node.additions}
                  deletions={node.deletions}
                />
              </button>
            </li>
          );
        }

        const open = expandedDirs[node.path] ?? true;
        return (
          <li key={node.path}>
            <button
              type="button"
              className="desktop-agent-chat__cf-dir"
              aria-expanded={open}
              onClick={() => onToggleDir(node.path)}
            >
              <span className="desktop-agent-chat__cf-chevron" aria-hidden>
                {open ? (
                  <ChevronDown size={12} strokeWidth={2} />
                ) : (
                  <ChevronRight size={12} strokeWidth={2} />
                )}
              </span>
              <span className="desktop-agent-chat__cf-file-name">{node.name}</span>
              <DiffStat additions={node.additions} deletions={node.deletions} />
            </button>
            {open ? (
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                turnId={turnId}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onOpenTurnDiff={onOpenTurnDiff}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DesktopAgentChatChangedFiles({
  turnId,
  files,
  isLatestTurn = false,
  onOpenTurnDiff,
}: DesktopAgentChatChangedFilesProps) {
  const summary = useMemo(() => summarizeChangedFileStats(files), [files]);
  const tree = useMemo(() => buildChangedFilesTree(files), [files]);
  const [expanded, setExpanded] = useState(() =>
    shouldAutoExpandChangedFiles(files, isLatestTurn),
  );
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const previewFiles = useMemo(
    () => selectChangedFilePreview(files),
    [files],
  );

  if (files.length === 0) return null;

  return (
    <div
      className="desktop-agent-chat__cf-card"
      data-changed-files-state={expanded ? "expanded" : "collapsed"}
    >
      <div className="desktop-agent-chat__cf-header">
        <button
          type="button"
          className="desktop-agent-chat__cf-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="desktop-agent-chat__cf-chevron" aria-hidden>
            {expanded ? (
              <ChevronDown size={12} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2} />
            )}
          </span>
          <span className="desktop-agent-chat__cf-title">
            {files.length} changed file{files.length === 1 ? "" : "s"}
          </span>
          <DiffStat
            additions={summary.additions}
            deletions={summary.deletions}
          />
          <span className="desktop-agent-chat__cf-hint">
            {expanded ? "Hide files" : "Show files"}
          </span>
        </button>
        <button
          type="button"
          className="desktop-agent-chat__cf-open"
          title="Open the full diff"
          onClick={() => onOpenTurnDiff(turnId, files[0]?.path)}
        >
          Open diff
        </button>
      </div>

      {expanded ? (
        <TreeNodes
          nodes={tree}
          depth={0}
          turnId={turnId}
          expandedDirs={expandedDirs}
          onToggleDir={(path) =>
            setExpandedDirs((prev) => ({
              ...prev,
              [path]: !(prev[path] ?? true),
            }))
          }
          onOpenTurnDiff={onOpenTurnDiff}
        />
      ) : isLatestTurn ? (
        <div className="desktop-agent-chat__cf-preview">
          <div className="desktop-agent-chat__cf-preview-chips">
            {previewFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                className="desktop-agent-chat__cf-chip"
                title={file.path}
                onClick={() => onOpenTurnDiff(turnId, file.path)}
              >
                <DesktopAgentFileIcon
                  pathValue={file.path}
                  kind="file"
                  className="desktop-agent-chat__cf-chip-icon"
                />
                <span className="desktop-agent-chat__cf-chip-label">
                  {file.name}
                  {file.additions > 0 || file.deletions > 0
                    ? ` ${formatDiffStat(file)}`
                    : ""}
                </span>
              </button>
            ))}
            {files.length > previewFiles.length ? (
              <button
                type="button"
                className="desktop-agent-chat__cf-more"
                onClick={() => setExpanded(true)}
              >
                Show all {files.length} files
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
