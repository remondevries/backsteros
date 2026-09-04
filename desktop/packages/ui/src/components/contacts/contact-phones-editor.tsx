"use client";

import { useRef, useState } from "react";
import {
  CONTACT_PHONE_LABELS,
  contactPhoneRowsForEditor,
  splitContactPhoneRows,
  type ContactPhoneEntry,
  type ContactPhoneLabel,
} from "@backsteros/contracts";

import { XIcon } from "@primer/octicons-react";

import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type { ContactPhoneEntry, ContactPhoneLabel };

export type ContactPhoneEditorRow = {
  label: string;
  number: string;
};

export type ContactPhonesEditorProps = {
  phone: string;
  phones: ContactPhoneEditorRow[];
  disabled?: boolean;
  /** Override Personal/Work/Other (e.g. org General/Support/Other). */
  labelOptions?: ReadonlyArray<{ value: string; label: string }>;
  defaultLabel?: string;
  rowsForEditor?: (input: {
    phone: string;
    phones: ContactPhoneEditorRow[];
  }) => ContactPhoneEditorRow[];
  splitRows?: (rows: ContactPhoneEditorRow[]) => {
    phone: string | null;
    phones: ContactPhoneEditorRow[];
  };
  onChange: (next: {
    phone: string;
    phones: ContactPhoneEditorRow[];
  }) => void;
  onSave: (next: {
    phone: string | null;
    phones: ContactPhoneEditorRow[];
  }) => void;
};

const DEFAULT_LABEL_OPTIONS = CONTACT_PHONE_LABELS.map((value) => ({
  value,
  label:
    value === "personal" ? "Personal" : value === "work" ? "Work" : "Other",
}));

function rowsKey(rows: ContactPhoneEditorRow[]): string {
  return JSON.stringify(rows);
}

/**
 * Phone numbers as split pills: category dropdown | number input.
 */
export function ContactPhonesEditor({
  phone,
  phones,
  disabled = false,
  labelOptions = DEFAULT_LABEL_OPTIONS,
  defaultLabel = "personal",
  rowsForEditor = (input) =>
    contactPhoneRowsForEditor({
      phone: input.phone,
      phones: input.phones as ContactPhoneEntry[],
    }),
  splitRows = (rows) => splitContactPhoneRows(rows as ContactPhoneEntry[]),
  onChange,
  onSave,
}: ContactPhonesEditorProps) {
  const remoteRows = rowsForEditor({ phone, phones });
  const remoteKey = rowsKey(remoteRows);
  const [rows, setRows] = useState(remoteRows);
  const [rowsSource, setRowsSource] = useState(remoteKey);
  const numberInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

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

  function setLocalRows(next: ContactPhoneEditorRow[]) {
    setRows(next);
    const split = splitRows(next);
    onChange({
      phone: split.phone ?? "",
      phones: split.phones,
    });
  }

  function commitRows(next: ContactPhoneEditorRow[]) {
    setRows(next);
    const split = splitRows(next);
    onChange({
      phone: split.phone ?? "",
      phones: split.phones,
    });
    onSave({ phone: split.phone, phones: split.phones });
  }

  function updateRow(index: number, patch: Partial<ContactPhoneEditorRow>) {
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
    if (next[index]?.number.trim()) {
      commitRows(next);
    }
  }

  function commitNumber(index: number, number: string) {
    commitRows(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, number } : row,
      ),
    );
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      commitRows([{ label: rows[0]?.label ?? defaultLabel, number: "" }]);
      return;
    }
    commitRows(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    if (disabled || rows.length >= 20) return;
    const next = [...rows, { label: defaultLabel, number: "" }];
    setLocalRows(next);
    requestAnimationFrame(() => {
      numberInputRefs.current.get(next.length - 1)?.focus();
    });
  }

  const chips = rows
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (entry.number.trim()) return true;
      if (rows.length === 1) return true;
      return index === rows.length - 1;
    });

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        {chips.map(({ entry, index }) => {
          const label = labelDisplay(entry.label);
          const canRemove = Boolean(entry.number.trim()) || rows.length > 1;
          return (
            <div
              key={`phone-split-${index}`}
              className={[
                "contact-detail-split-chip",
                !entry.number.trim() ? "is-muted" : null,
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
                ariaLabel="Phone label"
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
                    aria-label={`Phone label: ${selected?.label ?? label}`}
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
                  if (node) numberInputRefs.current.set(index, node);
                  else numberInputRefs.current.delete(index);
                }}
                type="tel"
                aria-label="Phone number"
                value={entry.number}
                disabled={disabled}
                placeholder="+31 …"
                size={Math.max(entry.number.length, "+31 …".length, 4)}
                onChange={(event) =>
                  updateRow(index, { number: event.target.value })
                }
                onBlur={(event) => commitNumber(index, event.target.value)}
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
                  aria-label="Remove phone"
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
          aria-label="Add phone number"
          title="Add phone"
          onClick={addRow}
        >
          <SidePanelPlusIcon />
        </button>
      </div>
    </div>
  );
}
