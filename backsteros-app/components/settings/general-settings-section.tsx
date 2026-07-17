"use client";

import { useState } from "react";
import { toast } from "sonner";

import { apiErrorMessage, useAppApi } from "@/lib/api-context";
import { APP_TIMEZONE_OPTIONS, normalizeAppTimezone } from "@/lib/settings/app-timezone";

type GeneralSettingsSectionProps = {
  timezone: string;
  onSaved: (timezone: string) => void;
};

export function GeneralSettingsSection({
  timezone,
  onSaved,
}: GeneralSettingsSectionProps) {
  const { client } = useAppApi();
  const [value, setValue] = useState(timezone);
  const [saving, setSaving] = useState(false);

  async function handleChange(nextValue: string) {
    const normalized = normalizeAppTimezone(nextValue);
    setValue(normalized);
    setSaving(true);
    try {
      await client.requestJson("/api/v1/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: normalized }),
      });
      onSaved(normalized);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>Timezone</h2>
      <p>
        Due dates, Today/Tomorrow task tabs, and journal due-task panels use
        this timezone — not your browser or server clock.
      </p>
      <label className="settings-field">
        <span>Timezone</span>
        <select
          value={value}
          disabled={saving}
          onChange={(event) => void handleChange(event.target.value)}
        >
          {APP_TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
