import { useCallback, useEffect, useState } from "react";
import type {
  MoneybirdAdministrationSummary,
  MoneybirdSettings,
  MoneybirdTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsMoneybirdTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<MoneybirdSettings | null>(null);
  const [administrations, setAdministrations] = useState<
    MoneybirdAdministrationSummary[]
  >([]);
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const loadAdministrations = useCallback(
    async (configured: boolean) => {
      if (!configured) {
        setAdministrations([]);
        return;
      }
      try {
        const body = await client.requestJson<{
          administrations: MoneybirdAdministrationSummary[];
        }>("/api/v1/settings/moneybird/administrations");
        setAdministrations(body.administrations);
      } catch {
        setAdministrations([]);
      }
    },
    [client],
  );

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<MoneybirdSettings>(
        "/api/v1/settings/moneybird",
      );
      setSettings(body);
      setSettingsError(null);
      await loadAdministrations(body.apiTokenConfigured);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Moneybird settings.",
      );
      return null;
    }
  }, [client, loadAdministrations]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiToken?: string;
    administrationId?: string | null;
  }): Promise<MoneybirdSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<MoneybirdSettings>(
        "/api/v1/settings/moneybird",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(body);
      await loadAdministrations(body.apiTokenConfigured);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save Moneybird settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveToken = async () => {
    const value = apiTokenDraft.trim();
    if (!value) return;
    const body = await patchSettings({ apiToken: value });
    if (body) setApiTokenDraft("");
  };

  const onClearToken = async () => {
    await patchSettings({ apiToken: "", administrationId: null });
    setApiTokenDraft("");
  };

  const connected = settings?.connected ?? false;

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Connect a{" "}
            <a
              href="https://moneybird.com/user/applications/new"
              target="_blank"
              rel="noreferrer"
            >
              personal Moneybird API token
            </a>{" "}
            with the <code>sales_invoices</code> scope. Tokens are stored in
            core (not synced via PowerSync) and used to load invoices in Finance.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : settings.apiTokenConfigured
                ? "Token saved — pick an administration"
                : "Not connected"
        }
        secondaryLabel="Administration"
        secondaryValue={
          settings?.administrationName ?? settings?.administrationId ?? "—"
        }
        reason={
          !connected && settings?.apiTokenConfigured
            ? "Select an administration below, then test the connection."
            : null
        }
        hint={
          connected
            ? "Open Finance → Invoices to browse sales invoices."
            : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !settings.apiTokenConfigured}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<MoneybirdTestConnectionResult>(
                  "/api/v1/settings/moneybird/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              if (result.ok) {
                const admin = result.administrationName
                  ? ` (${result.administrationName})`
                  : "";
                const sample =
                  result.invoiceSampleCount != null
                    ? ` Sample invoices: ${result.invoiceSampleCount}.`
                    : "";
                setTestMessage(`Connected to Moneybird${admin}.${sample}`);
              } else {
                setTestMessage(
                  result.error ?? "Moneybird connection test failed.",
                );
              }
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Moneybird connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>API token</h2>
        <p>
          Create a personal API token in Moneybird and store it here. Prefer
          scoping to <code>sales_invoices</code> for invoice access.
        </p>
        <label className="settings-field">
          Moneybird API token
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.apiTokenConfigured
                ? `Configured (${settings.apiTokenPreview ?? "••••"})`
                : "Paste personal API token…"
            }
            value={apiTokenDraft}
            onChange={(event) => setApiTokenDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || !apiTokenDraft.trim()}
            onClick={() => void onSaveToken()}
          >
            {saving ? "Saving…" : "Save token"}
          </button>
          <button
            type="button"
            disabled={saving || !settings?.apiTokenConfigured}
            onClick={() => void onClearToken()}
          >
            Clear token
          </button>
        </div>
        {settings?.apiTokenConfigured ? (
          <p className="settings-hint">
            Token on file: {settings.apiTokenPreview}
          </p>
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

      {settings?.apiTokenConfigured ? (
        <section className="settings-card">
          <h2>Administration</h2>
          <p>
            Every Moneybird API call needs an administration id. If you only
            have one, it is selected automatically when you save the token.
          </p>
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
        </section>
      ) : null}
    </>
  );
}
