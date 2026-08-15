import { useEffect, useMemo, useState } from "react";
import { PatchDiff } from "@pierre/diffs/react";

import { formatDiffStat } from "../lib/agent/agent-acp-activity";
import { changedFileToUnifiedPatch } from "../lib/agent/agent-chat-diff-render";
import {
  summarizeChangedFileStats,
  type AgentChatChangedFile,
} from "../lib/agent/agent-chat-timeline";

export type DesktopAgentChatDiffPanelProps = {
  files: readonly AgentChatChangedFile[];
  initialPath?: string | null;
  onClose: () => void;
  /** Docked beside chat, or full-body sheet on narrow rails. */
  variant?: "docked" | "sheet";
  /** When false, hide the Close control (e.g. Diff surface tab). Default true. */
  showClose?: boolean;
};

function UnifiedDiffFallback({
  file,
  reason,
}: {
  file: AgentChatChangedFile;
  reason?: string;
}) {
  if (file.lines.length === 0) {
    return (
      <p className="desktop-agent-chat__diff-panel-empty">
        No line-level diff was captured for this file. Stats only:{" "}
        {formatDiffStat(file)}.
      </p>
    );
  }

  return (
    <div className="desktop-agent-chat__diff-panel-fallback">
      {reason ? (
        <p className="desktop-agent-chat__diff-panel-empty">{reason}</p>
      ) : null}
      <pre className="desktop-agent-chat__diff-panel-body">
        {file.lines.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            className={`desktop-agent-chat__diff-line desktop-agent-chat__diff-line--${line.type}`}
          >
            <span className="desktop-agent-chat__diff-prefix" aria-hidden>
              {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
            </span>
            <span className="desktop-agent-chat__diff-text">
              {line.text || " "}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function PierreDiffBody({ file }: { file: AgentChatChangedFile }) {
  const patch = useMemo(() => changedFileToUnifiedPatch(file), [file]);
  if (!patch) {
    return <UnifiedDiffFallback file={file} />;
  }

  return (
    <div className="desktop-agent-chat__diff-panel-pierre">
      <PatchDiff
        patch={patch}
        disableWorkerPool
        options={{
          diffStyle: "unified",
          theme: "pierre-dark",
          themeType: "dark",
          overflow: "scroll",
          stickyHeader: false,
        }}
      />
    </div>
  );
}

export function DesktopAgentChatDiffPanel({
  files,
  initialPath = null,
  onClose,
  variant = "docked",
  showClose = true,
}: DesktopAgentChatDiffPanelProps) {
  const summary = useMemo(() => summarizeChangedFileStats(files), [files]);
  const [activePath, setActivePath] = useState<string | null>(() => {
    if (initialPath && files.some((file) => file.path === initialPath)) {
      return initialPath;
    }
    return files[0]?.path ?? null;
  });

  // Only re-sync when the turn's file list / open path changes — never when the
  // user picks a sidebar file. Depending on `activePath` + always applying
  // `initialPath` snapped every click back to the first file.
  useEffect(() => {
    if (initialPath && files.some((file) => file.path === initialPath)) {
      setActivePath(initialPath);
      return;
    }
    setActivePath((current) => {
      if (current && files.some((file) => file.path === current)) {
        return current;
      }
      return files[0]?.path ?? null;
    });
  }, [files, initialPath]);

  useEffect(() => {
    if (!showClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, showClose]);

  const activeFile =
    files.find((file) => file.path === activePath) ?? files[0] ?? null;
  const isSheet = variant === "sheet";

  return (
    <div
      className={`desktop-agent-chat__diff-panel desktop-agent-chat__diff-panel--${variant}`}
      role={isSheet ? "dialog" : "complementary"}
      aria-modal={isSheet && showClose ? true : undefined}
      aria-label="Turn diff"
    >
      <header className="desktop-agent-chat__diff-panel-header">
        <div className="desktop-agent-chat__diff-panel-heading">
          <span className="desktop-agent-chat__diff-panel-title">
            {files.length} changed file{files.length === 1 ? "" : "s"}
          </span>
          {summary.additions > 0 || summary.deletions > 0 ? (
            <span className="desktop-agent-chat__cf-stat">
              {summary.additions > 0 ? (
                <span className="is-add">+{summary.additions}</span>
              ) : null}
              {summary.deletions > 0 ? (
                <span className="is-del">−{summary.deletions}</span>
              ) : null}
            </span>
          ) : null}
        </div>
        {showClose ? (
          <button
            type="button"
            className="desktop-agent-chat__diff-panel-close"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </header>

      {files.length === 0 ? (
        <p className="desktop-agent-chat__diff-panel-empty">
          No changed files for this turn.
        </p>
      ) : (
        <div className="desktop-agent-chat__diff-panel-layout">
          <aside className="desktop-agent-chat__diff-panel-files">
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className={`desktop-agent-chat__diff-panel-file${
                      file.path === activeFile?.path ? " is-active" : ""
                    }`}
                    title={file.path}
                    onClick={() => setActivePath(file.path)}
                  >
                    <span className="desktop-agent-chat__diff-panel-file-name">
                      {file.name}
                    </span>
                    <span className="desktop-agent-chat__cf-stat">
                      {file.additions > 0 ? (
                        <span className="is-add">+{file.additions}</span>
                      ) : null}
                      {file.deletions > 0 ? (
                        <span className="is-del">−{file.deletions}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="desktop-agent-chat__diff-panel-main">
            {activeFile ? (
              <>
                <div className="desktop-agent-chat__diff-panel-path">
                  <span title={activeFile.path}>{activeFile.path}</span>
                  <span className="desktop-agent-chat__cf-stat">
                    {formatDiffStat(activeFile)}
                  </span>
                </div>
                <PierreDiffBody key={activeFile.path} file={activeFile} />
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
