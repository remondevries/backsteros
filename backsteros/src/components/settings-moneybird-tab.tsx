import { useCallback, useMemo, useState } from "react";
import type {
  MoneybirdAdministrationSummary,
  MoneybirdSettings,
} from "@backsteros/contracts";
import {
  SegmentedPillToggle,
  SettingsSecretField,
  SettingsTestConnectionSwap,
  useIntegrationSettingsHeaderTrailing,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useWorkspaceIntegrationSettings } from "../lib/settings/use-workspace-integration-settings";
import type { IntegrationSettingsTabProps } from "./settings/integration-secret-settings-panel";

type MoneybirdSubTab = "api-token" | "administration";

const MONEYBIRD_SUB_TABS: { value: MoneybirdSubTab; label: string }[] = [
  { value: "api-token", label: "API Token" },
  { value: "administration", label: "Administration" },
];

export function SettingsMoneybirdTab({
  initialSettings,
}: IntegrationSettingsTabProps<MoneybirdSettings>) {
  const { client } = useDesktopApi();
  const [subTab, setSubTab] = useState<MoneybirdSubTab>("api-token");
  const [administrations, setAdministrations] = useState<
    MoneybirdAdministrationSummary[]
  >([]);
  const loadAdministrations = useCallback(
    async (body: MoneybirdSettings) => {
      if (!body.apiTokenConfigured) {
        setAdministrations([]);
        return;
      }
      try {
        const result = await client.requestJson<{
          administrations: MoneybirdAdministrationSummary[];
        }>("/api/v1/settings/moneybird/administrations");
        setAdministrations(result.administrations);
      } catch {
        setAdministrations([]);
      }
    },
    [client],
  );
  const { settings, settingsError, saving, patchSettings, testConnection } =
    useWorkspaceIntegrationSettings<
      MoneybirdSettings,
      { apiToken?: string; administrationId?: string | null }
    >({
      basePath: "/api/v1/settings/moneybird",
      label: "Moneybird",
      initialSettings,
      onLoaded: (body) => void loadAdministrations(body),
    });

  const headerTrailing = useMemo(
    () => (
      <SegmentedPillToggle
        ariaLabel="Moneybird settings sections"
        value={subTab}
        onChange={setSubTab}
        options={MONEYBIRD_SUB_TABS}
      />
    ),
    [subTab],
  );
  useIntegrationSettingsHeaderTrailing(headerTrailing);

  return (
    <>
      {subTab === "api-token" ? (
        <section className="settings-card settings-card--bare">
          <h2>API token</h2>
          <p>
            Create a{" "}
            <a
              href="https://moneybird.com/user/applications/new"
              target="_blank"
              rel="noreferrer"
            >
              personal Moneybird API token
            </a>{" "}
            with the <code>sales_invoices</code>, <code>bank</code>, and{" "}
            <code>settings</code> scopes for Finance invoices and bank
            transaction sync. Stored in core (not via PowerSync). Then pick an
            administration under Administration — open Finance → Invoices once
            connected.
          </p>
          <label className="settings-field">
            Moneybird API token
            <SettingsSecretField
              configured={Boolean(settings?.apiTokenConfigured)}
              preview={settings?.apiTokenPreview}
              emptyPlaceholder="Paste personal API token…"
              onSave={(value) => patchSettings({ apiToken: value })}
              trailing={
                <SettingsTestConnectionSwap
                  disabled={
                    settings === null || !settings.apiTokenConfigured
                  }
                  onTest={async () => {
                    await testConnection("Moneybird connection test failed.");
                  }}
                />
              }
            />
          </label>
          {settings?.apiTokenConfigured ? (
            settings.administrationId ? null : (
              <p className="settings-hint">
                Token saved — pick an administration under Administration.
              </p>
            )
          ) : (
            <p className="settings-hint">
              No token stored. Finance invoices stay unavailable until you save
              one.
            </p>
          )}
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "administration" ? (
        <section className="settings-card settings-card--bare">
          <h2>Administration</h2>
          <p>
            Every Moneybird API call needs an administration id. If you only
            have one, it is selected automatically when you save the token.
          </p>
          {settings?.apiTokenConfigured ? (
            <>
              <label className="settings-field">
                Administration
                <select
                  value={settings.administrationId ?? ""}
                  disabled={saving || administrations.length === 0}
                  onChange={(event) => {
                    const value = event.target.value;
                    void patchSettings({
                      administrationId: value.length > 0 ? value : null,
                    });
                  }}
                >
                  <option value="">
                    {administrations.length === 0
                      ? "Could not load administrations"
                      : "Select administration…"}
                  </option>
                  {administrations.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.name}
                      {admin.currency ? ` (${admin.currency})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {settings.administrationId ? (
                <p className="settings-hint">
                  Administration id: {settings.administrationId}
                </p>
              ) : null}
            </>
          ) : (
            <p className="settings-hint">
              Save an API token first, then pick an administration here.
            </p>
          )}
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
