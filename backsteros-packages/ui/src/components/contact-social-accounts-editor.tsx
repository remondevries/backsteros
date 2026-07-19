"use client";

export type ContactSocialAccount = {
  platform: string;
  url: string;
};

const PLATFORM_OPTIONS = [
  "LinkedIn",
  "X",
  "Instagram",
  "GitHub",
  "Website",
  "Other",
] as const;

export type ContactSocialAccountsEditorProps = {
  value: ContactSocialAccount[];
  disabled?: boolean;
  error?: string | null;
  onChange: (next: ContactSocialAccount[]) => void;
  onSave: (next: ContactSocialAccount[]) => void;
};

function isPresetPlatform(platform: string): boolean {
  return (PLATFORM_OPTIONS as readonly string[]).includes(platform);
}

/**
 * Platform + URL list for contact overview (max 20), matching Next UX.
 */
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
    onChange([...value, { platform: "LinkedIn", url: "" }]);
  }

  return (
    <div className="contact-social-accounts">
      {value.length === 0 ? (
        <p className="contact-social-accounts__empty">No social accounts yet.</p>
      ) : null}

      {value.map((entry, index) => {
        const useCustomPlatform =
          entry.platform.length > 0 && !isPresetPlatform(entry.platform);
        const selectValue = useCustomPlatform
          ? "Other"
          : entry.platform || "LinkedIn";

        return (
          <div
            key={`social-${index}`}
            className="contact-social-accounts__row"
          >
            <div className="contact-social-accounts__row-top">
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
                className="entity-overview-input contact-social-accounts__platform"
              >
                {PLATFORM_OPTIONS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="contact-social-accounts__remove"
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
                value={
                  useCustomPlatform || entry.platform === ""
                    ? entry.platform
                    : ""
                }
                disabled={disabled}
                placeholder="Platform name"
                onChange={(event) =>
                  updateRow(index, { platform: event.target.value })
                }
                onBlur={() => onSave(value)}
                className="entity-overview-input"
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
              className="entity-overview-input"
            />
          </div>
        );
      })}

      <button
        type="button"
        className="contact-social-accounts__add"
        disabled={disabled || value.length >= 20}
        onClick={addRow}
      >
        Add social account
      </button>

      {error ? (
        <p className="contact-social-accounts__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
