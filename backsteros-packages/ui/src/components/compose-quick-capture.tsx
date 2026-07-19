"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AddInboxTaskInline } from "./add-inbox-task-inline.js";

export type ComposeQuickCaptureProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTask: (title: string) => Promise<{ id: string } | void> | { id: string } | void;
  onCreated?: (taskId: string) => void;
};

/**
 * Lightweight compose overlay (C / sidebar) — creates an inbox triage task.
 * Full Next compose modal (task/letter/doc tabs) can replace this later.
 */
export function ComposeQuickCapture({
  open,
  onOpenChange,
  onCreateTask,
  onCreated,
}: ComposeQuickCaptureProps) {
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setCreating(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onOpenChange, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="compose-quick-capture"
      role="dialog"
      aria-modal="true"
      aria-label="Compose task"
    >
      <button
        type="button"
        className="compose-quick-capture__backdrop"
        aria-label="Close compose"
        onClick={() => onOpenChange(false)}
      />
      <div className="compose-quick-capture__panel">
        <header className="compose-quick-capture__header">
          <h2 className="compose-quick-capture__title">New task</h2>
          <p className="compose-quick-capture__hint">
            Saves to Inbox · Esc to cancel
          </p>
        </header>
        <AddInboxTaskInline
          placeholder="Task title"
          ariaLabel="Task title"
          disabled={creating}
          error={error}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (title) => {
            setCreating(true);
            setError(null);
            try {
              const created = await onCreateTask(title);
              onOpenChange(false);
              if (created?.id) onCreated?.(created.id);
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not create task.",
              );
            } finally {
              setCreating(false);
            }
          }}
        />
      </div>
    </div>,
    document.body,
  ) as ReactNode;
}
