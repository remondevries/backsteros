"use client";

import type { ContactSocialAccount } from "@backsteros/contracts";

import { overviewDetailsInputClassName } from "@/components/overview/overview-details-field";

const PLATFORM_OPTIONS = [
  "LinkedIn",
  "X",
  "Instagram",
  "GitHub",
  "Website",
  "Other",
] as const;

type ContactSocialAccountsEditorProps = {
  value: ContactSocialAccount[];
  disabled?: boolean;
  error?: string | null;
  onChange: (next: ContactSocialAccount[]) => void;
  onSave: (next: ContactSocialAccount[]) => void;
};

function isPresetPlatform(platform: string): boolean {
  return (PLATFORM_OPTIONS as readonly string[]).includes(platform);
}

export function ContactSocialAccountsEditor({
  value,
  disabled = false,
  error,
  onChange,
  onSave,
}: ContactSocialAccountsEditorProps) {
  function updateRow(index: number, patch: Partial<ContactSocialAccount>) {
    const next = value.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry,
    );
    onChange(next);
  }

  function removeRow(index: number) {
    const next = value.filter((_, entryIndex) => entryIndex !== index);
    onChange(next);
    onSave(next);
  }

  function addRow() {
    const next = [...value, { platform: "LinkedIn", url: "" }];
    onChange(next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {value.length === 0 ? (
        <p className="text-sm text-foreground/45">No social accounts yet.</p>
      ) : null}

      {value.map((entry, index) => {
        const useCustomPlatform =
          entry.platform.length > 0 && !isPresetPlatform(entry.platform);
        const selectValue = useCustomPlatform ? "Other" : entry.platform || "LinkedIn";

        return (
          <div
            key={`social-${index}`}
            className="flex min-w-0 flex-col gap-1.5 rounded-md border border-white/10 bg-white/[0.03] p-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <select
                aria-label={`Social platform ${index + 1}`}
                value={selectValue}
                disabled={disabled}
                onChange={(event) => {
                  const nextPlatform = event.target.value;
                  if (nextPlatform === "Other") {
                    updateRow(index, {
                      platform: useCustomPlatform ? entry.platform : "",
                    });
                    return;
                  }
                  updateRow(index, { platform: nextPlatform });
                }}
                className={`${overviewDetailsInputClassName} max-w-[140px] shrink-0`}
              >
                {PLATFORM_OPTIONS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1.5 text-xs text-foreground/55 transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-60"
                disabled={disabled}
                onClick={() => removeRow(index)}
              >
                Remove
              </button>
            </div>

            {selectValue === "Other" ? (
              <input
                type="text"
                aria-label={`Custom platform name ${index + 1}`}
                value={useCustomPlatform || entry.platform === "" ? entry.platform : ""}
                disabled={disabled}
                placeholder="Platform name"
                onChange={(event) =>
                  updateRow(index, { platform: event.target.value })
                }
                onBlur={() => onSave(value)}
                className={overviewDetailsInputClassName}
              />
            ) : null}

            <input
              type="url"
              aria-label={`Social URL ${index + 1}`}
              value={entry.url}
              disabled={disabled}
              placeholder="https://…"
              onChange={(event) => updateRow(index, { url: event.target.value })}
              onBlur={() => onSave(value)}
              className={overviewDetailsInputClassName}
            />
          </div>
        );
      })}

      <button
        type="button"
        className="self-start rounded-md px-2 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-60"
        disabled={disabled || value.length >= 20}
        onClick={addRow}
      >
        Add social account
      </button>

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
