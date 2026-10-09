import { useCallback, useEffect, useState } from "react";
import type {
  GoogleCalendarCalendarSummary,
  GoogleCalendarOAuthStartResult,
  GoogleCalendarSettings,
  GoogleCalendarSyncResult,
  GoogleCalendarTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsGoogleCalendarTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<GoogleCalendarSettings | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarCalendarSummary[]>(
    [],
  );
  const [clientIdDraft, setClientIdDraft] = useState("");
  const [clientSecretDraft, setClientSecretDraft] = useState("");
  const [refreshTokenDraft, setRefreshTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<GoogleCalendarSettings>(
        "/api/v1/settings/google-calendar",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Google Calendar settings.",
      );
      return null;
    }
  }, [client]);

  const loadCalendars = useCallback(async () => {
    try {
      const body = await client.requestJson<{
        calendars: GoogleCalendarCalendarSummary[];
      }>("/api/v1/settings/google-calendar/calendars");
      setCalendars(body.calendars);
    } catch {
      setCalendars([]);
    }
  }, [client]);

  useEffect(() => {
    void (async () => {
      const body = await loadSettings();
      if (body?.connected) await loadCalendars();
    })();
  }, [loadCalendars, loadSettings]);

  const patchSettings = async (patch: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    selectedCalendarIds?: string[];
  }): Promise<GoogleCalendarSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<GoogleCalendarSettings>(
        "/api/v1/settings/google-calendar",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(body);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save Google Calendar settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveCredentials = async () => {
    const patch: {
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
    } = {};
    if (clientIdDraft.trim()) patch.clientId = clientIdDraft.trim();
    if (clientSecretDraft.trim()) patch.clientSecret = clientSecretDraft.trim();
    if (refreshTokenDraft.trim()) patch.refreshToken = refreshTokenDraft.trim();
    if (Object.keys(patch).length === 0) return;
    const body = await patchSettings(patch);
    if (body) {
      setClientIdDraft("");
      setClientSecretDraft("");
      setRefreshTokenDraft("");
    }
  };

  const onClearConnection = async () => {
    await patchSettings({
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      selectedCalendarIds: [],
    });
    setCalendars([]);
  };

  const onConnect = async () => {
    setConnecting(true);
    setSettingsError(null);
    try {
      const result = await client.requestJson<GoogleCalendarOAuthStartResult>(
        "/api/v1/settings/google-calendar/oauth/start",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      window.open(result.authorizeUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not start Google Calendar OAuth.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await client.requestJson<GoogleCalendarSyncResult>(
        "/api/v1/settings/google-calendar/sync",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      await loadSettings();
      setSyncMessage(
        result.ok
          ? `Synced ${result.upserted} events from ${result.calendarCount} calendar(s)${
              result.removed ? ` (${result.removed} removed)` : ""
            }.`
          : (result.error ?? "Sync failed."),
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Sync failed.",
      );
    } finally {
      setSyncing(false);
    }
  };

  const onToggleCalendar = async (calendarId: string, selected: boolean) => {
    // Empty selectedCalendarIds means "primary only" in the UI. Materialize that
    // before applying a toggle so checks/unchecks stick instead of snapping back.
    const stored = settings?.selectedCalendarIds ?? [];
    const current = new Set(
      stored.length > 0
        ? stored
        : calendars.filter((cal) => cal.selected).map((cal) => cal.id),
    );
    if (selected) current.add(calendarId);
    else current.delete(calendarId);

    let nextIds = [...current];
    // Keep at least the primary calendar so "empty → primary" does not fight the UI.
    if (nextIds.length === 0) {
      const primaryId = calendars.find((cal) => cal.primary)?.id;
      if (primaryId) nextIds = [primaryId];
    }

    setCalendars((prev) =>
      prev.map((cal) => ({
        ...cal,
        selected: nextIds.includes(cal.id),
      })),
    );

    await patchSettings({
      selectedCalendarIds: nextIds,
    });
    // Refresh from server (also reverts optimistic UI if the patch failed).
    await loadCalendars();
  };

  const connected = settings?.connected ?? false;

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        hideHeader={hideHeader}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Create an OAuth client in{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>{" "}
            (Desktop or Web), enable the{" "}
            <strong>Google Calendar API</strong>, and add this redirect URI:{" "}
            <code>{settings?.oauthRedirectUri ?? "…"}</code>. Scope is
            read-only. Events appear on the agenda as non-editable blocks — not
            as BacksterOS meetings.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? settings.accountEmail
                ? `Connected (${settings.accountEmail})`
                : "Connected"
              : "Not connected"
        }
        secondaryLabel="Last sync"
        secondaryValue={
          settings?.lastSyncedAt
            ? new Date(settings.lastSyncedAt).toLocaleString()
            : "—"
        }
        hint={
          settings != null && settings.connected
            ? settings.pushEnabled
              ? `Push on (${settings.pushChannelCount} channel${
                  settings.pushChannelCount === 1 ? "" : "s"
                }). Converted events sync title/time both ways — reconnect if edits fail with insufficient scopes.`
              : settings.pushError
                ? settings.pushError
                : "Use Sync now — push channels register after a successful sync when HTTPS webhook is configured. Reconnect Google if you connected before write scopes were added."
            : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !connected}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<GoogleCalendarTestConnectionResult>(
                  "/api/v1/settings/google-calendar/test",
                );
              await loadSettings();
              if (result.ok) await loadCalendars();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? `Connected${result.accountEmail ? ` as ${result.accountEmail}` : ""} (${result.calendarCount ?? 0} calendars).`
                  : (result.error ?? "Connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      {settingsError ? (
        <p className="settings-error" role="alert">
          {settingsError}
        </p>
      ) : null}

      <section className="settings-card">
        <h2>OAuth client</h2>
        <p>
          Paste the client id and secret from Google Cloud. Optional: paste a
          refresh token directly if you already completed OAuth elsewhere.
        </p>
        <label className="settings-field">
          Client ID
          <input
            type="text"
            autoComplete="off"
            placeholder={
              settings?.clientIdConfigured ? "Configured (••••)" : "….apps.googleusercontent.com"
            }
            value={clientIdDraft}
            onChange={(event) => setClientIdDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Client secret
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.clientSecretConfigured ? "Configured (••••)" : "GOCSPX-…"
            }
            value={clientSecretDraft}
            onChange={(event) => setClientSecretDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Refresh token (optional)
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.refreshTokenConfigured
                ? "Configured (••••)"
                : "Paste only if skipping browser Connect"
            }
            value={refreshTokenDraft}
            onChange={(event) => setRefreshTokenDraft(event.target.value)}
          />
        </label>
        <div className="settings-actions">
          <button
            type="button"
            disabled={
              saving ||
              (!clientIdDraft.trim() &&
                !clientSecretDraft.trim() &&
                !refreshTokenDraft.trim())
            }
            onClick={() => void onSaveCredentials()}
          >
            {saving ? "Saving…" : "Save credentials"}
          </button>
          <button
            type="button"
            disabled={
              connecting ||
              !(settings?.clientIdConfigured && settings.clientSecretConfigured)
            }
            onClick={() => void onConnect()}
          >
            {connecting ? "Opening…" : "Connect with Google"}
          </button>
          <button
            type="button"
            disabled={saving || !connected}
            onClick={() => void onClearConnection()}
          >
            Disconnect
          </button>
        </div>
      </section>

      {connected ? (
        <section className="settings-card">
          <h2>Calendars</h2>
          <p>
            Check the calendars to sync. Primary stays selected by default; add
            others as needed, then Sync now.
          </p>
          {calendars.length === 0 ? (
            <p>No calendars loaded yet — use Test connection.</p>
          ) : (
            <ul className="settings-checklist">
              {calendars.map((calendar) => (
                <li key={calendar.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={calendar.selected}
                      disabled={saving}
                      onChange={(event) => {
                        void onToggleCalendar(
                          calendar.id,
                          event.target.checked,
                        );
                      }}
                    />{" "}
                    {calendar.summary}
                    {calendar.primary ? " (primary)" : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="settings-actions">
            <button
              type="button"
              disabled={syncing || !connected}
              onClick={() => void onSync()}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
          {syncMessage ? <p>{syncMessage}</p> : null}
        </section>
      ) : null}
    </>
  );
}
