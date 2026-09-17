"use client";

import { useMemo, useState } from "react";
import {
  CONTACT_LANGUAGES,
  coerceContactLanguages,
  contactLanguageLabel,
  type ContactLanguage,
} from "@backsteros/contracts";
import { XIcon } from "@primer/octicons-react";

import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { ContactLanguageFlagIcon } from "./contact-language-flag-icon.js";

export type ContactLanguagesEditorProps = {
  languages: ContactLanguage[];
  disabled?: boolean;
  /**
   * `multiple` (default) — Details spoken languages.
   * `single` — one preferred language (Portal UI locale).
   */
  selectionMode?: "multiple" | "single";
  /** Restrict selectable codes (Portal uses `nl` | `en`). */
  allowedLanguages?: readonly ContactLanguage[];
  onChange: (languages: ContactLanguage[]) => void;
  onSave: (languages: ContactLanguage[]) => void;
};

type LanguageRow = {
  id: string;
  code: ContactLanguage | null;
};

function languagesKey(languages: ContactLanguage[]): string {
  return JSON.stringify(languages);
}

function committedFrom(rows: LanguageRow[]): ContactLanguage[] {
  return coerceContactLanguages(
    rows
      .map((row) => row.code)
      .filter((code): code is ContactLanguage => code != null),
  );
}

function rowsFromRemote(
  languages: ContactLanguage[],
  selectionMode: "multiple" | "single",
): LanguageRow[] {
  const codes = coerceContactLanguages(languages);
  const limited =
    selectionMode === "single" ? codes.slice(0, 1) : codes;
  if (limited.length === 0 && selectionMode === "single") {
    return [{ id: "lang-draft:portal", code: null }];
  }
  return limited.map((code) => ({
    id: `lang:${code}`,
    code,
  }));
}

let languageRowSeq = 0;
function createDraftRowId(): string {
  languageRowSeq += 1;
  return `lang-draft:${languageRowSeq}`;
}

/**
 * Language chips for contact Details (multi) or Portal tab (single).
 * Plus adds a local “Select language” draft (no save) until a value is chosen.
 */
export function ContactLanguagesEditor({
  languages: remoteLanguages,
  disabled = false,
  selectionMode = "multiple",
  allowedLanguages,
  onChange,
  onSave,
}: ContactLanguagesEditorProps) {
  const catalog = useMemo(() => {
    if (!allowedLanguages || allowedLanguages.length === 0) {
      return [...CONTACT_LANGUAGES];
    }
    const allowed = new Set(allowedLanguages);
    return CONTACT_LANGUAGES.filter((code) => allowed.has(code));
  }, [allowedLanguages]);

  const remote = useMemo(() => {
    const codes = coerceContactLanguages(remoteLanguages).filter((code) =>
      catalog.includes(code),
    );
    return selectionMode === "single" ? codes.slice(0, 1) : codes;
  }, [remoteLanguages, catalog, selectionMode]);

  const remoteKey = languagesKey(remote);
  const [rows, setRows] = useState<LanguageRow[]>(() =>
    rowsFromRemote(remote, selectionMode),
  );
  const [rowsSource, setRowsSource] = useState(remoteKey);

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    // Adopt remote only when local committed values still match the prior
    // source (no in-flight edits). Keep trailing draft chips in multi mode.
    if (languagesKey(committedFrom(rows)) === rowsSource) {
      if (selectionMode === "single") {
        setRows(rowsFromRemote(remote, selectionMode));
      } else {
        const drafts = rows.filter((row) => row.code == null);
        setRows([...rowsFromRemote(remote, selectionMode), ...drafts]);
      }
    }
  }

  function persistCommitted(committed: ContactLanguage[]) {
    const next =
      selectionMode === "single" ? committed.slice(0, 1) : committed;
    onChange(next);
    onSave(next);
  }

  function commitRows(next: LanguageRow[]) {
    const committed = committedFrom(next);
    setRows(
      selectionMode === "single"
        ? committed.length > 0
          ? [{ id: `lang:${committed[0]}`, code: committed[0]! }]
          : [{ id: createDraftRowId(), code: null }]
        : next,
    );
    persistCommitted(committed);
  }

  function updateAt(index: number, nextCode: ContactLanguage) {
    if (!catalog.includes(nextCode)) return;
    if (selectionMode === "single") {
      commitRows([{ id: `lang:${nextCode}`, code: nextCode }]);
      return;
    }
    const usedElsewhere = new Set(
      rows
        .filter((_, entryIndex) => entryIndex !== index)
        .map((row) => row.code)
        .filter((code): code is ContactLanguage => code != null),
    );
    if (usedElsewhere.has(nextCode)) return;
    const next = rows.map((row, entryIndex) =>
      entryIndex === index ? { ...row, code: nextCode } : row,
    );
    commitRows(next);
  }

  function removeAt(index: number) {
    const removed = rows[index];
    if (selectionMode === "single") {
      setRows([{ id: createDraftRowId(), code: null }]);
      if (removed?.code != null) {
        persistCommitted([]);
      }
      return;
    }
    const next = rows.filter((_, entryIndex) => entryIndex !== index);
    setRows(next);
    // Draft-only remove: no persist. Removing a saved language: persist.
    if (removed?.code != null) {
      persistCommitted(committedFrom(next));
    }
  }

  function addLanguage() {
    if (disabled || selectionMode === "single") return;
    const committed = committedFrom(rows);
    const draftCount = rows.filter((row) => row.code == null).length;
    if (committed.length + draftCount >= catalog.length) return;
    // Local draft only — do not save until the user picks a language.
    setRows([...rows, { id: createDraftRowId(), code: null }]);
  }

  const canAdd =
    selectionMode === "multiple" &&
    !disabled &&
    committedFrom(rows).length +
      rows.filter((row) => row.code == null).length <
      catalog.length;

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        {rows.map((row, index) => {
          const usedElsewhere = new Set(
            selectionMode === "single"
              ? []
              : rows
                  .filter((_, entryIndex) => entryIndex !== index)
                  .map((entry) => entry.code)
                  .filter((code): code is ContactLanguage => code != null),
          );
          const options = catalog
            .filter(
              (option) => option === row.code || !usedElsewhere.has(option),
            )
            .map((option) => ({
              value: option,
              label: contactLanguageLabel(option),
              icon: <ContactLanguageFlagIcon code={option} size={14} />,
            }));
          const label = row.code
            ? contactLanguageLabel(row.code)
            : "Select language";
          const isDraft = row.code == null;
          return (
            <div
              key={row.id}
              className={[
                "contact-detail-split-chip",
                "contact-detail-language-chip",
                isDraft ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <SearchableDropdown
                value={row.code}
                options={options}
                disabled={disabled}
                searchPlaceholder="Language…"
                searchShortcutLabel=""
                emptySelectionLabel="Select language"
                ariaLabel="Language"
                panelAlign="start"
                panelWidth={180}
                showIcon
                className="contact-detail-split-chip__dropdown"
                onChange={(next) => updateAt(index, next)}
                renderTrigger={({ selected, open, triggerId, onToggle }) => (
                  <button
                    type="button"
                    id={triggerId}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={
                      selected
                        ? `Language: ${selected.label}`
                        : "Select language"
                    }
                    title={selected?.label ?? "Select language"}
                    onClick={onToggle}
                    className={[
                      "contact-detail-split-chip__value",
                      "contact-detail-split-chip__value--button",
                      isDraft ? "is-muted" : null,
                      open ? "is-open" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {selected?.icon ? (
                      <span
                        className="contact-detail-language-chip__flag"
                        aria-hidden="true"
                      >
                        {selected.icon}
                      </span>
                    ) : null}
                    {selected?.label ?? "Select language"}
                  </button>
                )}
              />
              <button
                type="button"
                className="contact-detail-split-chip__remove"
                disabled={disabled}
                aria-label={
                  isDraft ? "Cancel new language" : `Remove ${label}`
                }
                title="Remove"
                onClick={() => removeAt(index)}
              >
                <XIcon size={10} />
              </button>
            </div>
          );
        })}
        {selectionMode === "multiple" ? (
          <button
            type="button"
            className="contact-detail-chips__add"
            disabled={!canAdd}
            aria-label="Add language"
            title="Add language"
            onClick={addLanguage}
          >
            <SidePanelPlusIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
