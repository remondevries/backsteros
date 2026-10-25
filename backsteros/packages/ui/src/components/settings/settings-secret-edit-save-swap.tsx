"use client";

import { useMemo } from "react";

import {
  ActionSwap,
  type ActionSwapProps,
  type ActionSwapState,
} from "../action-swap/action-swap.js";

export type SettingsSecretEditSaveMode = "edit" | "save";

export type SettingsSecretEditSaveSwapProps = {
  mode: SettingsSecretEditSaveMode;
  disabled?: boolean;
  /** Unlock (or cancel edit when already unlocked). */
  onEdit: () => void;
  /** Persist the draft. Resolve on success; reject on failure. */
  onSave: () => void | PromiseLike<unknown>;
  editLabel?: string;
  saveLabel?: string;
  size?: ActionSwapProps["size"];
  className?: string;
};

/**
 * Single control for locked secrets: Edit unlocks the field; once the draft is
 * dirty the same control becomes Save (with a working phase while persisting).
 */
export function SettingsSecretEditSaveSwap({
  mode,
  disabled = false,
  onEdit,
  onSave,
  editLabel = "Edit",
  saveLabel = "Save",
  size = "sm",
  className,
}: SettingsSecretEditSaveSwapProps) {
  const states = useMemo<ActionSwapState[]>(
    () => [
      {
        id: "edit",
        label: editLabel,
        tone: "quiet",
        repeatable: true,
      },
      {
        id: "save",
        label: saveLabel,
        tone: "quiet",
        pendingLabel: "Saving…",
        repeatable: true,
      },
    ],
    [editLabel, saveLabel],
  );

  return (
    <ActionSwap
      className={className}
      size={size}
      disabled={disabled}
      value={mode}
      states={states}
      onAction={(next) => {
        if (next.id === "edit") {
          onEdit();
          return;
        }
        return onSave();
      }}
    />
  );
}
