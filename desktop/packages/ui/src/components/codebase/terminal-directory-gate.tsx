"use client";

import { useState } from "react";

import { ComposeFolderIcon } from "../compose/compose-folder-icon.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { ProjectFsClient } from "./project-fs-types.js";

/**
 * Empty state when a project has no local working directory.
 * Used by the terminal (full pane) and the Files tab (compact side panel).
 */
export type TerminalDirectoryGateProps = {
  onSelectDirectory: (directory: string) => void | Promise<void>;
  fs: ProjectFsClient;
  showHeader?: boolean;
  message?: string;
  /** Side-panel layout (Files tab) instead of the terminal chrome. */
  compact?: boolean;
};

export function TerminalDirectoryGate({
  onSelectDirectory,
  fs,
  showHeader = true,
  message = "The terminal is unavailable until a working directory is defined for this project.",
  compact = false,
}: TerminalDirectoryGateProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseDirectory = () => {
    setError(null);
    setSaving(true);
    void (async () => {
      try {
        const next = await fs.pickDirectory();
        if (!next) return;
        await onSelectDirectory(next);
      } catch (err) {
        setError(
          apiErrorMessage(err) || "Could not save working directory.",
        );
      } finally {
        setSaving(false);
      }
    })();
  };

  const gate = (
    <div
      className={
        compact
          ? "terminal-directory-gate terminal-directory-gate--compact"
          : "terminal-stage terminal-directory-gate"
      }
    >
      <p className="terminal-directory-gate__copy">{message}</p>
      <button
        type="button"
        className="console-btn terminal-directory-gate__button"
        disabled={saving}
        onClick={chooseDirectory}
      >
        <ComposeFolderIcon />
        Define working directory
      </button>
      {error ? (
        <p className="terminal-directory-gate__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (compact) {
    return gate;
  }

  return (
    <section className="console-pane console-pane--terminal">
      {showHeader ? (
        <div className="console-pane-header console-pane-header--terminal">
          <div className="console-pane-header-title">
            <span>Terminal</span>
          </div>
        </div>
      ) : null}
      <div className="terminal-frame">{gate}</div>
    </section>
  );
}
