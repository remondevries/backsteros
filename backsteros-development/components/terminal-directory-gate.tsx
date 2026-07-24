"use client";

import { useState } from "react";

import { ComposeFolderIcon } from "@backsteros/ui";

import { DirectoryPickerModal } from "@/components/directory-picker-modal";
import { apiErrorMessage } from "@/lib/api-context";

/**
 * Centered empty state when a project has no local working directory.
 * Replaces the terminal until the user picks a folder.
 */
export function TerminalDirectoryGate({
  onSelectDirectory,
  showHeader = true,
}: {
  onSelectDirectory: (directory: string) => void | Promise<void>;
  showHeader?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="console-pane console-pane--terminal">
      {showHeader ? (
        <div className="console-pane-header console-pane-header--terminal">
          <div className="console-pane-header-title">
            <span>Terminal</span>
          </div>
        </div>
      ) : null}
      <div className="terminal-frame">
        <div className="terminal-stage terminal-directory-gate">
          <p className="terminal-directory-gate__copy">
            The terminal is unavailable until a working directory is defined for
            this project.
          </p>
          <button
            type="button"
            className="console-btn console-btn--primary terminal-directory-gate__button"
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
      </div>

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
    </section>
  );
}
