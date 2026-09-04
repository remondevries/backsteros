"use client";

import { useRef, useState } from "react";
import { XIcon } from "@primer/octicons-react";

import {
  CONTACT_SOCIAL_PLATFORMS,
  formatSocialHandleInput,
  isContactSocialPlatform,
  isSocialUrlPrefixOnly,
  socialHandlePlaceholder,
  socialPlatformIcon,
  socialPlatformUrlPrefix,
  socialUrlForPlatform,
  socialUrlFromHandle,
} from "../../contacts/social-platforms.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type ContactSocialAccount = {
  platform: string;
  url: string;
};

export type ContactSocialAccountsEditorProps = {
  value: ContactSocialAccount[];
  disabled?: boolean;
  error?: string | null;
  onChange: (next: ContactSocialAccount[]) => void;
  onSave: (next: ContactSocialAccount[]) => void;
};

const PLATFORM_DROPDOWN_OPTIONS = CONTACT_SOCIAL_PLATFORMS.map((value) => ({
  value,
  label: value === "X" ? "X / Twitter" : value,
  icon: socialPlatformIcon(value, 14),
}));

function rowsKey(rows: ContactSocialAccount[]): string {
  return JSON.stringify(rows);
}

function dropdownValue(platform: string): string {
  if (isContactSocialPlatform(platform)) return platform;
  return platform.trim() ? "Other" : "LinkedIn";
}

function hasCompletableUrl(entry: ContactSocialAccount): boolean {
  const trimmed = entry.url.trim();
  if (!trimmed) return false;
  return !isSocialUrlPrefixOnly(trimmed);
}

/**
 * Social accounts as split chips: platform icon | @username (full URL stored).
 */
export function ContactSocialAccountsEditor({
  value,
  disabled = false,
  error,
  onChange,
  onSave,
}: ContactSocialAccountsEditorProps) {
  const remoteKey = rowsKey(value);
  const [rows, setRows] = useState(value);
  const [rowsSource, setRowsSource] = useState(remoteKey);
  const [draftHandles, setDraftHandles] = useState<Record<number, string>>({});
  const urlInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    if (
      rowsKey(rows.filter(hasCompletableUrl)) === rowsSource ||
      rowsKey(rows) === rowsSource
    ) {
      setRows(value);
      setDraftHandles({});
    }
  }

  function persistCompleted(next: ContactSocialAccount[]) {
    const cleaned = next
      .map((entry) => ({
        platform: entry.platform.trim() || "Other",
        url: entry.url.trim(),
      }))
      .filter(hasCompletableUrl);
    const drafts = next.filter((entry) => !hasCompletableUrl(entry));
    setRows(drafts.length > 0 ? [...cleaned, ...drafts] : cleaned);
    setDraftHandles({});
    onChange(cleaned);
    onSave(cleaned);
  }

  function updateHandle(index: number, handleInput: string) {
    const platform = rows[index]?.platform ?? "LinkedIn";
    const url = socialUrlFromHandle(platform, handleInput);
    const next = rows.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, url } : entry,
    );
    setRows(next);
    setDraftHandles((prev) => ({ ...prev, [index]: handleInput }));
    onChange(next.filter(hasCompletableUrl));
  }

  function commitPlatform(index: number, platform: string) {
    const current = rows[index];
    if (!current) return;
    const nextPlatform =
      platform === "Other" &&
      current.platform.trim() &&
      !isContactSocialPlatform(current.platform)
        ? current.platform
        : platform;
    const nextUrl = socialUrlForPlatform(nextPlatform, current.url);
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { platform: nextPlatform, url: nextUrl } : row,
    );
    setRows(next);
    setDraftHandles((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    onChange(next.filter(hasCompletableUrl));
    if (hasCompletableUrl({ platform: nextPlatform, url: nextUrl })) {
      persistCompleted(next);
    }
    requestAnimationFrame(() => {
      urlInputRefs.current.get(index)?.focus();
    });
  }

  function commitHandle(index: number, handleInput: string) {
    const platform = rows[index]?.platform ?? "LinkedIn";
    const url = socialUrlFromHandle(platform, handleInput);
    persistCompleted(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, url } : row,
      ),
    );
  }

  function removeRow(index: number) {
    persistCompleted(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    if (disabled || rows.length >= 20) return;
    const completed = rows.filter(hasCompletableUrl);
    const withDraft: ContactSocialAccount[] = [
      ...completed,
      {
        platform: "LinkedIn",
        url: socialPlatformUrlPrefix("LinkedIn") ?? "",
      },
    ];
    setRows(withDraft);
    setDraftHandles({});
    onChange(completed);
    requestAnimationFrame(() => {
      urlInputRefs.current.get(withDraft.length - 1)?.focus();
    });
  }

  const chips = rows.map((entry, index) => ({ entry, index }));

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        {chips.map(({ entry, index }) => {
          const platformValue = dropdownValue(entry.platform);
          const canRemove = chips.length > 0;
          const muted = !hasCompletableUrl(entry);
          const handleValue =
            draftHandles[index] ??
            formatSocialHandleInput(entry.platform, entry.url);
          return (
            <div
              key={`social-split-${index}`}
              className={[
                "contact-detail-split-chip",
                muted ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title={hasCompletableUrl(entry) ? entry.url : undefined}
            >
              <SearchableDropdown
                value={platformValue}
                options={PLATFORM_DROPDOWN_OPTIONS}
                disabled={disabled}
                searchPlaceholder="Platform…"
                searchShortcutLabel=""
                ariaLabel="Social platform"
                panelAlign="start"
                panelWidth={200}
                showIcon={false}
                className="contact-detail-split-chip__dropdown"
                onChange={(nextPlatform) =>
                  commitPlatform(index, nextPlatform)
                }
                renderTrigger={({ selected, open, triggerId, onToggle }) => {
                  const label =
                    selected?.label ?? (entry.platform || "Platform");
                  return (
                    <button
                      type="button"
                      id={triggerId}
                      disabled={disabled}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      aria-label={`Social platform: ${label}`}
                      title={label}
                      onClick={onToggle}
                      className={[
                        "contact-detail-split-chip__label",
                        "contact-detail-split-chip__label--icon",
                        open ? "is-open" : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {socialPlatformIcon(platformValue, 14)}
                    </button>
                  );
                }}
              />
              <input
                ref={(node) => {
                  if (node) urlInputRefs.current.set(index, node);
                  else urlInputRefs.current.delete(index);
                }}
                type="text"
                spellCheck={false}
                autoComplete="off"
                aria-label="Social username"
                value={handleValue}
                disabled={disabled}
                placeholder={socialHandlePlaceholder(entry.platform)}
                size={Math.max(
                  handleValue.length,
                  socialHandlePlaceholder(entry.platform).length,
                  4,
                )}
                onChange={(event) =>
                  updateHandle(index, event.target.value)
                }
                onBlur={(event) => commitHandle(index, event.target.value)}
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
                  aria-label="Remove social account"
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
          aria-label="Add social account"
          title="Add social account"
          onClick={addRow}
        >
          <SidePanelPlusIcon />
        </button>
      </div>

      {error ? (
        <p className="contact-social-accounts__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
