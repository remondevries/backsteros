"use client";

import { useState } from "react";
import {
  CONTACT_EMAIL_LABELS,
  contactEmailRowsForEditor,
  splitContactEmailRows,
  type ContactEmailEntry,
  type ContactEmailLabel,
} from "@backsteros/contracts";

import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";

export type { ContactEmailEntry, ContactEmailLabel };

export type ContactEmailsEditorProps = {
  email: string;
  emails: ContactEmailEntry[];
  disabled?: boolean;
  onChange: (next: { email: string; emails: ContactEmailEntry[] }) => void;
  onSave: (next: { email: string | null; emails: ContactEmailEntry[] }) => void;
};

const LABEL_OPTIONS = CONTACT_EMAIL_LABELS.map((value) => ({
  value,
  label: value === "personal" ? "Personal" : value === "work" ? "Work" : "Other",
}));

function RemoveEmailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8.5 12h7" />
    </svg>
  );
}

function rowsKey(rows: ContactEmailEntry[]): string {
  return JSON.stringify(rows);
}

function parentToRows(email: string, emails: ContactEmailEntry[]): ContactEmailEntry[] {
  return contactEmailRowsForEditor({ email, emails });
}

function rowsToParent(rows: ContactEmailEntry[]): {
  email: string;
  emails: ContactEmailEntry[];
} {
  const split = splitContactEmailRows(rows);
  return {
    email: split.email ?? "",
    // Persist labeled primary inside emails; drop blank drafts.
    emails: split.emails,
  };
}

/**
 * Primary + additional contact emails in one list. Index 0 is primary.
 * Uses SearchableDropdown for labels (not native &lt;select&gt;).
 */
export function ContactEmailsEditor({
  email,
  emails,
  disabled = false,
  onChange,
  onSave,
}: ContactEmailsEditorProps) {
  const remoteRows = parentToRows(email, emails);
  const remoteKey = rowsKey(remoteRows);
  const [rows, setRows] = useState(remoteRows);
  const [rowsSource, setRowsSource] = useState(remoteKey);

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    // Adopt remote when local still matches the last confirmed remote.
    if (rowsKey(rows) === rowsSource) {
      setRows(remoteRows);
    }
  }

  function setLocalRows(next: ContactEmailEntry[]) {
    setRows(next);
    const parent = rowsToParent(next);
    onChange(parent);
  }

  function commitRows(next: ContactEmailEntry[]) {
    setRows(next);
    const parent = rowsToParent(next);
    onChange(parent);
    onSave({ email: parent.email || null, emails: parent.emails });
    // rowsSource advances on remote echo; keep editing stable until then.
  }

  function updateRow(index: number, patch: Partial<ContactEmailEntry>) {
    setLocalRows(
      rows.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      commitRows([{ label: rows[0]?.label ?? "personal", address: "" }]);
      return;
    }
    commitRows(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    setLocalRows([...rows, { label: "personal", address: "" }]);
  }

  return (
    <div className="contact-emails">
      {rows.map((entry, index) => {
        const isPrimary = index === 0;
        return (
          <div key={`email-${index}`} className="contact-emails__row">
            <SearchableDropdown
              value={entry.label}
              options={LABEL_OPTIONS}
              disabled={disabled}
              searchPlaceholder="Label…"
              ariaLabel={
                isPrimary ? "Primary email label" : `Email label ${index + 1}`
              }
              panelAlign="start"
              panelWidth={160}
              showIcon={false}
              className="entity-overview-dropdown contact-emails__label"
              onChange={(label) => {
                const next = rows.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, label } : row,
                );
                setLocalRows(next);
                if (entry.address.trim()) {
                  onSave({
                    email: rowsToParent(next).email || null,
                    emails: rowsToParent(next).emails,
                  });
                }
              }}
              renderTrigger={({ selected, open, triggerId, onToggle }) => {
                const label =
                  selected?.label ??
                  LABEL_OPTIONS.find((option) => option.value === entry.label)
                    ?.label ??
                  "Other";
                return (
                  <button
                    type="button"
                    id={triggerId}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={`Email label: ${label}`}
                    title={label}
                    onClick={onToggle}
                    className={[
                      "entity-overview-input",
                      "entity-overview-dropdown-trigger",
                      "contact-emails__label-trigger",
                    ].join(" ")}
                  >
                    <span className="entity-overview-dropdown-trigger__label">
                      {label}
                    </span>
                    <span
                      className="entity-overview-dropdown-trigger__chevron"
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>
                );
              }}
            />
            <input
              id={isPrimary ? "contact-email" : undefined}
              type="email"
              aria-label={isPrimary ? "Email" : `Additional email ${index}`}
              value={entry.address}
              disabled={disabled}
              placeholder="name@example.com"
              onChange={(event) =>
                updateRow(index, { address: event.target.value })
              }
              onBlur={(event) => {
                const next = rows.map((row, rowIndex) =>
                  rowIndex === index
                    ? { ...row, address: event.target.value }
                    : row,
                );
                commitRows(next);
              }}
              className="entity-overview-input"
            />
            <button
              type="button"
              className="contact-emails__remove"
              disabled={
                disabled ||
                (isPrimary && rows.length === 1 && !entry.address.trim())
              }
              aria-label={
                isPrimary && rows.length === 1
                  ? "Clear email"
                  : `Remove email ${index + 1}`
              }
              title="Remove"
              onClick={() => removeRow(index)}
            >
              <RemoveEmailIcon />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="contact-emails__add"
        disabled={disabled || rows.length >= 20}
        onClick={addRow}
      >
        Add email address
      </button>
    </div>
  );
}
