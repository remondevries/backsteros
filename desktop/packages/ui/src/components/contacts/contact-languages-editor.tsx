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

function rowsFromRemote(languages: ContactLanguage[]): LanguageRow[] {
  return coerceContactLanguages(languages).map((code) => ({
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
 * Multi language chips for contact Details — value-only dropdowns.
 * Plus adds a local “Select language” draft (no save) until a value is chosen,
 * matching email/phone chip stability while editing.
 */
export function ContactLanguagesEditor({
  languages: remoteLanguages,
  disabled = false,
  onChange,
  onSave,
}: ContactLanguagesEditorProps) {
  const remote = useMemo(
    () => coerceContactLanguages(remoteLanguages),
    [remoteLanguages],
  );
  const remoteKey = languagesKey(remote);
  const [rows, setRows] = useState<LanguageRow[]>(() => rowsFromRemote(remote));
  const [rowsSource, setRowsSource] = useState(remoteKey);

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    // Adopt remote only when local committed values still match the prior
    // source (no in-flight edits). Keep trailing draft chips.
    if (languagesKey(committedFrom(rows)) === rowsSource) {
      const drafts = rows.filter((row) => row.code == null);
      setRows([...rowsFromRemote(remote), ...drafts]);
    }
  }

  function commitRows(next: LanguageRow[]) {
    const committed = committedFrom(next);
    setRows(next);
    onChange(committed);
    onSave(committed);
  }

  function updateAt(index: number, nextCode: ContactLanguage) {
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
    const next = rows.filter((_, entryIndex) => entryIndex !== index);
    setRows(next);
    // Draft-only remove: no persist. Removing a saved language: persist.
    if (removed?.code != null) {
      const committed = committedFrom(next);
      onChange(committed);
      onSave(committed);
    }
  }

  function addLanguage() {
    if (disabled) return;
    const committed = committedFrom(rows);
    const draftCount = rows.filter((row) => row.code == null).length;
    if (committed.length + draftCount >= CONTACT_LANGUAGES.length) return;
    // Local draft only — do not save until the user picks a language.
    setRows([...rows, { id: createDraftRowId(), code: null }]);
  }

  const canAdd =
    !disabled &&
    committedFrom(rows).length +
      rows.filter((row) => row.code == null).length <
      CONTACT_LANGUAGES.length;

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        {rows.map((row, index) => {
          const usedElsewhere = new Set(
            rows
              .filter((_, entryIndex) => entryIndex !== index)
              .map((entry) => entry.code)
              .filter((code): code is ContactLanguage => code != null),
          );
          const options = CONTACT_LANGUAGES.filter(
            (option) => option === row.code || !usedElsewhere.has(option),
          ).map((option) => ({
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
      </div>
    </div>
  );
}
