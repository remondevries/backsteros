"use client";

import { useState } from "react";

import { ComposeFolderIcon } from "@backsteros/ui";

import { DirectoryPickerModal } from "@/components/directory-picker-modal";
import { apiErrorMessage } from "@/lib/api-context";

/**
 * Empty state when a project has no local working directory.
 * Used by the terminal (full pane) and the Files tab (compact side panel).
 */
export function TerminalDirectoryGate({
  onSelectDirectory,
  showHeader = true,
  message = "The terminal is unavailable until a working directory is defined for this project.",
  compact = false,
}: {
  onSelectDirectory: (directory: string) => void | Promise<void>;
  showHeader?: boolean;
  message?: string;
  /** Side-panel layout (Files tab) instead of the terminal chrome. */
  compact?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onClick={() => {
          setError(null);
          setPickerOpen(true);
        }}
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

  const picker = (
    <DirectoryPickerModal
      open={pickerOpen}
      initialPath={null}
      onClose={() => setPickerOpen(false)}
      onSelect={(next) => {
        setPickerOpen(false);
        setSaving(true);
        setError(null);
        void Promise.resolve(onSelectDirectory(next))
          .catch((err) => {
            setError(
              apiErrorMessage(err) || "Could not save working directory.",
            );
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    />
  );

  if (compact) {
    return (
      <>
        {gate}
        {picker}
      </>
    );
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
      {picker}
    </section>
  );
}
