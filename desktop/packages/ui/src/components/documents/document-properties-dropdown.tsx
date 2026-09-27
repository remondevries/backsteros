"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { PropertyFieldGroup } from "../content/property-field-group.js";

export type DocumentPropertiesDropdownOption = {
  value: string;
  label: string;
};

export type DocumentPropertiesFieldConfig = {
  key: string;
  label: string;
  kind: "dropdown" | "date" | "text";
  options?: DocumentPropertiesDropdownOption[];
};

export type DocumentPropertiesDropdownProps = {
  docKey: string | null;
  properties: Record<string, unknown>;
  frontMatterValid: boolean;
  contentVersion: number;
  fields: DocumentPropertiesFieldConfig[];
  readOnly?: boolean;
  previewOnly?: boolean;
  onSave?: (input: {
    properties: Record<string, unknown>;
    ifMatchVersion: number;
  }) => Promise<{ ok: true; contentVersion: number } | { ok: false; error: string }>;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function DocumentPropertiesIconButton({
  label,
  expanded,
  onClick,
  disabled,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="document-properties-trigger"
      aria-label={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="document-properties-trigger__glyph" aria-hidden>
        ⚙
      </span>
    </button>
  );
}

export function DocumentPropertiesDropdown({
  docKey,
  properties,
  frontMatterValid,
  contentVersion,
  fields,
  readOnly = false,
  previewOnly = false,
  onSave,
}: DocumentPropertiesDropdownProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(contentVersion);

  useEffect(() => {
    setVersion(contentVersion);
  }, [contentVersion]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.key] = readString(properties[field.key]);
    }
    setDraft(next);
    setError(null);
  }, [fields, open, properties]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const handleSave = useCallback(async () => {
    if (previewOnly || readOnly || !onSave) return;
    setSaving(true);
    setError(null);
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const next = draft[field.key]?.trim() ?? "";
      const prev = readString(properties[field.key]);
      if (next !== prev) {
        patch[field.key] = next.length ? next : null;
      }
    }
    if (Object.keys(patch).length === 0) {
      setSaving(false);
      setOpen(false);
      return;
    }
    const result = await onSave({ properties: patch, ifMatchVersion: version });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVersion(result.contentVersion);
    setOpen(false);
  }, [draft, fields, onSave, previewOnly, properties, readOnly, version]);

  const disabled = !frontMatterValid || readOnly;

  return (
    <div ref={rootRef} className="document-properties-dropdown">
      <DocumentPropertiesIconButton
        label={
          previewOnly
            ? "Preview document properties"
            : "Edit document properties"
        }
        expanded={open}
        disabled={disabled && !previewOnly}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div
          id={menuId}
          className="document-properties-dropdown__panel"
          role="dialog"
          aria-label="Document properties"
        >
          {docKey ? (
            <p className="document-properties-dropdown__doc-key">{docKey}</p>
          ) : null}
          {!frontMatterValid ? (
            <p className="document-properties-dropdown__error" role="alert">
              Fix invalid YAML front matter before editing properties.
            </p>
          ) : null}
          <div className="entity-properties-stack">
            {fields.map((field) => {
              const value = previewOnly
                ? readString(properties[field.key])
                : (draft[field.key] ?? "");
              const control =
                field.kind === "dropdown" ? (
                  <select
                    className="property-field-input"
                    value={value}
                    disabled={previewOnly || disabled || saving}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="property-field-input"
                    type={field.kind === "date" ? "date" : "text"}
                    value={value}
                    disabled={previewOnly || disabled || saving}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                );
              return (
                <PropertyFieldGroup key={field.key} label={field.label}>
                  {control}
                </PropertyFieldGroup>
              );
            })}
          </div>
          <button
            type="button"
            className="document-properties-dropdown__add"
            disabled
            title="Coming in phase 3."
          >
            Add property
          </button>
          {previewOnly ? null : (
            <div className="document-properties-dropdown__actions">
              {error ? (
                <p className="document-properties-dropdown__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn--primary"
                disabled={disabled || saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save properties"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export const CORE_DOCUMENT_PROPERTY_FIELDS: DocumentPropertiesFieldConfig[] = [
  {
    key: "type",
    label: "Type",
    kind: "dropdown",
    options: [
      { value: "reference", label: "Reference" },
      { value: "runbook", label: "Runbook" },
      { value: "house-rule", label: "House rule" },
      { value: "meeting-notes", label: "Meeting notes" },
      { value: "decision", label: "Decision" },
      { value: "letter", label: "Letter" },
      { value: "draft", label: "Draft" },
    ],
  },
  {
    key: "audience",
    label: "Audience",
    kind: "dropdown",
    options: [
      { value: "agents", label: "Agents" },
      { value: "remon", label: "Remon" },
      { value: "client", label: "Client" },
      { value: "public", label: "Public" },
    ],
  },
  {
    key: "status",
    label: "Status",
    kind: "dropdown",
    options: [
      { value: "draft", label: "Draft" },
      { value: "current", label: "Current" },
      { value: "superseded", label: "Superseded" },
      { value: "archived", label: "Archived" },
    ],
  },
  {
    key: "reviewDate",
    label: "Review date",
    kind: "date",
  },
  {
    key: "supersededBy",
    label: "Superseded by",
    kind: "text",
  },
  {
    key: "owner",
    label: "Owner (contact id)",
    kind: "text",
  },
  {
    key: "linkedTasks",
    label: "Linked tasks (KEY-n, comma-separated)",
    kind: "text",
  },
  {
    key: "linkedContacts",
    label: "Linked contacts (ids, comma-separated)",
    kind: "text",
  },
];

export function normalizeDocumentPropertiesForSave(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...patch };
  for (const key of ["linkedTasks", "linkedContacts"] as const) {
    if (typeof next[key] === "string") {
      const raw = next[key].trim();
      if (!raw) {
        next[key] = null;
        continue;
      }
      next[key] = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return next;
}
