"use client";

import { useRef, useState } from "react";
import {
  CONTACT_EMAIL_LABELS,
  contactEmailRowsForEditor,
  normalizeContactEmailLabel,
  splitContactEmailRows,
  type ContactEmailEntry,
  type ContactEmailInput,
  type ContactEmailLabel,
} from "@backsteros/contracts";

import { XIcon } from "@primer/octicons-react";

import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type { ContactEmailEntry, ContactEmailLabel };

export type ContactEmailEditorRow = {
  label: string;
  address: string;
};

/**
 * `Row` is the caller's normalized entry type (contact vs organization
 * labels); the editor itself works on loose `ContactEmailEditorRow`s and
 * hands normalized rows back via `splitRows`.
 */
export type ContactEmailsEditorProps<
  Row extends ContactEmailEditorRow = ContactEmailEntry,
> = {
  email: string;
  emails: Row[];
  disabled?: boolean;
  /** Override Personal/Work/Other (e.g. org General/Support/Other). */
  labelOptions?: ReadonlyArray<{ value: string; label: string }>;
  defaultLabel?: string;
  rowsForEditor?: (input: {
    email: string;
    emails: Row[];
  }) => ContactEmailEditorRow[];
  splitRows?: (rows: ContactEmailEditorRow[]) => {
    email: string | null;
    emails: Row[];
  };
  onChange: (next: {
    email: string;
    emails: Row[];
  }) => void;
  onSave: (next: {
    email: string | null;
    emails: Row[];
  }) => void;
};

const DEFAULT_LABEL_OPTIONS = CONTACT_EMAIL_LABELS.map((value) => ({
  value,
  label:
    value === "personal" ? "Personal" : value === "work" ? "Work" : "Other",
}));

function defaultRowsForEditor(input: {
  email: string;
  emails: readonly ContactEmailInput[];
}): ContactEmailEditorRow[] {
  return contactEmailRowsForEditor(input);
}

function defaultSplitRows(rows: ContactEmailEditorRow[]): {
  email: string | null;
  emails: ContactEmailEntry[];
} {
  return splitContactEmailRows(
    rows.map((row) => ({
      label: normalizeContactEmailLabel(row.label),
      address: row.address,
    })),
  );
}

function rowsKey(rows: ContactEmailEditorRow[]): string {
  return JSON.stringify(rows);
}

/**
 * Email addresses as split pills: category dropdown | address input.
 */
export function ContactEmailsEditor<
  Row extends ContactEmailEditorRow = ContactEmailEntry,
>({
  email,
  emails,
  disabled = false,
  labelOptions = DEFAULT_LABEL_OPTIONS,
  defaultLabel = "personal",
  rowsForEditor = defaultRowsForEditor,
  // Defaults produce contact labels; callers with another label set
  // (organizations) pass their own `splitRows`.
  splitRows = defaultSplitRows as NonNullable<
    ContactEmailsEditorProps<Row>["splitRows"]
  >,
  onChange,
  onSave,
}: ContactEmailsEditorProps<Row>) {
  const remoteRows = rowsForEditor({ email, emails });
  const remoteKey = rowsKey(remoteRows);
  const [rows, setRows] = useState(remoteRows);
  const [rowsSource, setRowsSource] = useState(remoteKey);
  const addressInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    if (rowsKey(rows) === rowsSource) {
      setRows(remoteRows);
    }
  }

  function labelDisplay(label: string): string {
    return (
      labelOptions.find((option) => option.value === label)?.label ?? "Other"
    );
  }

  function setLocalRows(next: ContactEmailEditorRow[]) {
    setRows(next);
    const split = splitRows(next);
    onChange({
      email: split.email ?? "",
      emails: split.emails,
    });
  }

  function commitRows(next: ContactEmailEditorRow[]) {
    setRows(next);
    const split = splitRows(next);
    onChange({
      email: split.email ?? "",
      emails: split.emails,
    });
    onSave({ email: split.email, emails: split.emails });
  }

  function updateRow(index: number, patch: Partial<ContactEmailEditorRow>) {
    setLocalRows(
      rows.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function commitLabel(index: number, label: string) {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, label } : row,
    );
    setLocalRows(next);
    if (next[index]?.address.trim()) {
      commitRows(next);
    }
  }

  function commitAddress(index: number, address: string) {
    commitRows(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, address } : row,
      ),
    );
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      commitRows([{ label: rows[0]?.label ?? defaultLabel, address: "" }]);
      return;
    }
    commitRows(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    if (disabled || rows.length >= 20) return;
    const next = [...rows, { label: defaultLabel, address: "" }];
    setLocalRows(next);
    requestAnimationFrame(() => {
      addressInputRefs.current.get(next.length - 1)?.focus();
    });
  }

  const chips = rows
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (entry.address.trim()) return true;
      if (rows.length === 1) return true;
      return index === rows.length - 1;
    });

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        {chips.map(({ entry, index }) => {
          const label = labelDisplay(entry.label);
          const canRemove = Boolean(entry.address.trim()) || rows.length > 1;
          return (
            <div
              key={`email-split-${index}`}
              className={[
                "contact-detail-split-chip",
                !entry.address.trim() ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <SearchableDropdown
                value={entry.label}
                options={[...labelOptions]}
                disabled={disabled}
                searchPlaceholder="Label…"
                searchShortcutLabel=""
                ariaLabel="Email label"
                panelAlign="start"
                panelWidth={160}
                showIcon={false}
                className="contact-detail-split-chip__dropdown"
                onChange={(nextLabel) => commitLabel(index, nextLabel)}
                renderTrigger={({ selected, open, triggerId, onToggle }) => (
                  <button
                    type="button"
                    id={triggerId}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={`Email label: ${selected?.label ?? label}`}
                    title={selected?.label ?? label}
                    onClick={onToggle}
                    className={[
                      "contact-detail-split-chip__label",
                      "contact-detail-split-chip__label--muted",
                      open ? "is-open" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {selected?.label ?? label}
                  </button>
                )}
              />
              <input
                ref={(node) => {
                  if (node) addressInputRefs.current.set(index, node);
                  else addressInputRefs.current.delete(index);
                }}
                type="email"
                aria-label="Email address"
                value={entry.address}
                disabled={disabled}
                placeholder="name@example.com"
                size={Math.max(
                  entry.address.length,
                  "name@example.com".length,
                  4,
                )}
                onChange={(event) =>
                  updateRow(index, { address: event.target.value })
                }
                onBlur={(event) => commitAddress(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }
                  if (
                    event.key === "Backspace" &&
                    !(event.target as HTMLInputElement).value &&
                    rows.length > 1
                  ) {
                    event.preventDefault();
                    removeRow(index);
                  }
                }}
                className="contact-detail-split-chip__value"
              />
              {canRemove ? (
                <button
                  type="button"
                  className="contact-detail-split-chip__remove"
                  disabled={disabled}
                  aria-label="Remove email"
                  title="Remove"
                  onClick={() => removeRow(index)}
                >
                  <XIcon size={10} />
                </button>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="contact-detail-chips__add"
          disabled={disabled || rows.length >= 20}
          aria-label="Add email address"
          title="Add email"
          onClick={addRow}
        >
          <SidePanelPlusIcon />
        </button>
      </div>
    </div>
  );
}
