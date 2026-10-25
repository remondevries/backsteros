"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  SettingsSecretEditSaveSwap,
  type SettingsSecretEditSaveMode,
} from "./settings-secret-edit-save-swap.js";

const SECRET_SET_CLASS = "settings-field__input--has-secret";

function secretPlaceholder(
  preview: string | null | undefined,
  fallback = "••••••••••••",
): string {
  const trimmed = preview?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export type SettingsSecretFieldProps = {
  /** When true, a secret is already stored — lock the input until Edit. */
  configured: boolean;
  /** Masked preview shown as the placeholder while locked / empty. */
  preview?: string | null;
  /** Placeholder when nothing is stored yet. */
  emptyPlaceholder: string;
  saving?: boolean;
  disabled?: boolean;
  inputType?: "password" | "text";
  autoComplete?: string;
  /** Persist draft. Empty string clears a configured secret. */
  onSave: (value: string) => void | PromiseLike<unknown>;
  /** Optional Test (or other) control embedded in the field chrome. */
  trailing?: ReactNode;
  editLabel?: string;
  saveLabel?: string;
  className?: string;
};

/**
 * Locked secret input + single Edit/Save control.
 * Configured secrets stay read-only until Edit; dirty drafts morph Edit → Save.
 */
export function SettingsSecretField({
  configured,
  preview,
  emptyPlaceholder,
  saving = false,
  disabled = false,
  inputType = "password",
  autoComplete = "off",
  onSave,
  trailing,
  editLabel = "Edit",
  saveLabel = "Save",
  className,
}: SettingsSecretFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!configured) setEditing(false);
  }, [configured]);

  const locked = configured && !editing;
  const dirty = draft.trim().length > 0;
  // No stored secret → Save (disabled until dirty). Stored → Edit until dirty.
  const mode: SettingsSecretEditSaveMode = dirty
    ? "save"
    : configured
      ? "edit"
      : "save";
  const buttonDisabled = disabled || saving || (mode === "save" && !dirty);

  async function handleSave() {
    const value = draft.trim();
    await onSave(value);
    setDraft("");
    setEditing(false);
  }

  function handleEdit() {
    if (locked) {
      setEditing(true);
      setDraft("");
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setEditing(false);
    setDraft("");
  }

  return (
    <div
      className={["settings-secret-field-row", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "settings-secret-field-row__control",
          locked ? "settings-secret-field-row__control--locked" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          ref={inputRef}
          id={inputId}
          type={inputType}
          autoComplete={autoComplete}
          disabled={disabled || saving || locked}
          className={configured ? SECRET_SET_CLASS : undefined}
          placeholder={
            configured
              ? secretPlaceholder(preview)
              : emptyPlaceholder
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {trailing}
        <SettingsSecretEditSaveSwap
          mode={mode}
          disabled={buttonDisabled}
          editLabel={editLabel}
          saveLabel={saveLabel}
          onEdit={handleEdit}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
