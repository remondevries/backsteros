import { useUser } from "@clerk/clerk-react";
import { ApiClientError } from "@backsteros/api-client";
import type { ApiKey, CreateApiKeyResponse } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import {
  AccountSettingsSectionView,
  ApiKeysSettingsSectionView,
  ComingSoonSettingsSectionView,
  GeneralSettingsSectionView,
  IntegrationConnectionSettingsView,
  SearchableDropdown,
  SegmentedPillToggle,
  SettingsContentHeader,
  SettingsDetailLayout,
  SyncSettingsSectionView,
  buildAssigneeDropdownOptions,
  getSettingsTabMeta,
  isSettingsTabId,
  normalizeAppTimezone,
  type SettingsApiKeyItem,
  type SettingsTabId,
} from "@backsteros/ui";
import { useDesktopApi } from "../lib/api-context";
import {
  type BackendMode,
  apiOriginForMode,
} from "../lib/backend-mode";
import { useBackendMode } from "../lib/backend-mode-context";
import {
  DEFAULT_ASSIGNEE_SETTINGS_KEY,
  getDefaultAssigneeId,
  parseDefaultAssigneeIdFromSettings,
  setDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
import { getDesktopPublicEnvironment } from "../lib/env";
import { useDesktopPowerSync } from "../lib/powersync-context";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  fetchWhoopDaySnapshot,
  fetchWhoopSettingsStatus,
  todayIsoDate,
  type WhoopSettingsStatus,
} from "../lib/whoop";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

const BACKEND_MODE_OPTIONS: Array<{ value: BackendMode; label: string }> = [
  { value: "dev", label: "Dev" },
  { value: "prod", label: "Prod" },
];

function formatLastSyncedAt(date: Date | null): string {
  if (!date) return "Never";
  return date.toLocaleString();
}

function ClerkAccountEmailCard() {
  const { user } = useUser();
  return (
    <section className="settings-card">
      <h2>Email</h2>
      <p>The email address associated with your account.</p>
      <div className="settings-field">
        <span className="settings-static-value">
          {user?.primaryEmailAddress?.emailAddress ?? "—"}
        </span>
      </div>
    </section>
  );
}

function SettingsAccountTab({
  settings,
  onSettingsSaved,
}: {
  settings: Record<string, unknown> | undefined;
  onSettingsSaved?: () => void;
}) {
  const { client } = useDesktopApi();
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  const workspace = useDesktopWorkspaceData();
  const contacts = workspace.contacts;
  const [assigneeId, setAssigneeId] = useState<string | null>(() =>
    getDefaultAssigneeId(),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const synced = syncDefaultAssigneeIdFromSettings(settings);
    setAssigneeId(synced);

    const fromServer = parseDefaultAssigneeIdFromSettings(settings);
    if (fromServer !== undefined || !synced || !clerkKey) return;
    void client
      .requestJson("/api/v1/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [DEFAULT_ASSIGNEE_SETTINGS_KEY]: synced }),
      })
      .then(() => onSettingsSaved?.())
      .catch(() => {
        // keep local value if migrate fails
      });
  }, [clerkKey, client, onSettingsSaved, settings]);

  const options = useMemo(
    () => buildAssigneeDropdownOptions(contacts),
    [contacts],
  );

  const assigneeField =
    contacts.length === 0 ? (
      <p className="settings-hint">Add a contact to set a default assignee.</p>
    ) : (
      <div className="settings-field">
        <span>Assignee</span>
        <SearchableDropdown
          value={assigneeId ?? "__none__"}
          options={options}
          onChange={(next) => {
            const value = next === "__none__" ? null : next;
            setAssigneeId(value);
            setDefaultAssigneeId(value);
            if (!clerkKey) return;
            setSaving(true);
            void client
              .requestJson("/api/v1/settings", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  [DEFAULT_ASSIGNEE_SETTINGS_KEY]: value,
                }),
              })
              .then(() => onSettingsSaved?.())
              .catch(() => {
                // keep optimistic local value offline
              })
              .finally(() => setSaving(false));
          }}
          disabled={saving}
          searchPlaceholder="Set default assignee…"
          ariaLabel="Default assignee"
        />
      </div>
    );

  return (
    <>
      {clerkKey ? <ClerkAccountEmailCard /> : null}
      <AccountSettingsSectionView
        showEmail={false}
        assigneeField={assigneeField}
      />
    </>
  );
}

function SettingsSyncTab() {
  const sync = useDesktopPowerSync();
  const { mode, nextDevSwitchEnabled, setMode } = useBackendMode();
  const [pendingMode, setPendingMode] = useState<BackendMode>(mode);
  const dirty = nextDevSwitchEnabled && pendingMode !== mode;

  useEffect(() => {
    setPendingMode(mode);
  }, [mode]);

  const statusLabel = dirty
    ? "Waiting"
    : sync.offline
      ? "Offline"
      : sync.connecting
        ? "Connecting…"
        : sync.connected
          ? "Connected"
          : sync.status === "rest-only"
            ? "REST only"
            : sync.status === "unauthenticated"
              ? "Not signed in"
              : sync.error
                ? "Sync error"
                : "Not connected";

  const lastSyncLabel = dirty ? "-" : formatLastSyncedAt(sync.lastSyncedAt);
  const urlLabel = nextDevSwitchEnabled
    ? apiOriginForMode(dirty ? pendingMode : mode)
    : null;
  const errorMessage = dirty
    ? null
    : sync.error?.message ??
      (sync.status === "rest-only" ? sync.message : null);

  return (
    <SyncSettingsSectionView
      statusLabel={statusLabel}
      lastSyncLabel={lastSyncLabel}
      errorMessage={errorMessage}
      syncing={sync.connecting}
      urlLabel={urlLabel}
      warningText={
        nextDevSwitchEnabled && !dirty && pendingMode === "prod"
          ? "Prod mode: writes go to production data."
          : null
      }
      backendModeToggle={
        nextDevSwitchEnabled ? (
          <div className="settings-backend-mode-toggle">
            <SegmentedPillToggle
              ariaLabel="Backend mode"
              value={pendingMode}
              options={BACKEND_MODE_OPTIONS}
              onChange={setPendingMode}
            />
          </div>
        ) : null
      }
      confirmAction={
        dirty
          ? {
              label: "Confirm",
              danger: pendingMode === "prod",
              onConfirm: () => setMode(pendingMode),
            }
          : null
      }
      onSyncNow={dirty ? undefined : () => void sync.retry()}
    />
  );
}

function SettingsApiTab() {
  const { client } = useDesktopApi();
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  const [apiKeys, setApiKeys] = useState<SettingsApiKeyItem[]>([]);
  const [loading, setLoading] = useState(Boolean(clerkKey));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!clerkKey) {
      setLoading(false);
      setApiKeys([]);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const body = await client.requestJson<{ apiKeys: ApiKey[] }>(
        "/api/v1/api-keys",
      );
      setApiKeys(
        body.apiKeys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          createdAt: key.createdAt,
        })),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load API keys",
      );
    } finally {
      setLoading(false);
    }
  }, [client, clerkKey]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  if (!clerkKey) {
    return (
      <section className="settings-card">
        <h2>API keys</h2>
        <p>
          Sign in to create and manage revocable bearer tokens for the external
          REST API.
        </p>
        <p className="settings-hint">Requires Clerk authentication.</p>
      </section>
    );
  }

  return (
    <ApiKeysSettingsSectionView
      apiKeys={apiKeys}
      loading={loading}
      errorMessage={errorMessage}
      onRetry={() => void loadKeys()}
      onCreate={async (name) => {
        try {
          const result = await client.requestJson<CreateApiKeyResponse>(
            "/api/v1/api-keys",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, scopes: ["read", "write"] }),
            },
          );
          setApiKeys((current) => [
            {
              id: result.apiKey.id,
              name: result.apiKey.name,
              prefix: result.apiKey.prefix,
              scopes: result.apiKey.scopes,
              createdAt: result.apiKey.createdAt,
            },
            ...current,
          ]);
          return result.secret;
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not create API key",
          );
          return null;
        }
      }}
      onRename={async (id, name) => {
        try {
          const updated = await client.requestJson<ApiKey>(
            `/api/v1/api-keys/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name }),
            },
          );
          setApiKeys((current) =>
            current.map((entry) =>
              entry.id === updated.id
                ? {
                    id: updated.id,
                    name: updated.name,
                    prefix: updated.prefix,
                    scopes: updated.scopes,
                    createdAt: updated.createdAt,
                  }
                : entry,
            ),
          );
          return true;
        } catch {
          return false;
        }
      }}
      onRevoke={async (id) => {
        try {
          await client.requestJson(
            `/api/v1/api-keys/${encodeURIComponent(id)}`,
            { method: "DELETE" },
          );
          setApiKeys((current) => current.filter((entry) => entry.id !== id));
          return true;
        } catch {
          return false;
        }
      }}
    />
  );
}

const STORAGE_NOT_CONFIGURED_REASON =
  "Object storage is not configured. Set Spaces credentials on the API deployment.";

type StorageStatusResult =
  | { configured: boolean }
  | { error: string };

function applyStorageConfigured(
  configured: boolean,
  setConfigured: (value: boolean) => void,
  setReason: (value: string | null) => void,
) {
  setConfigured(configured);
  setReason(configured ? null : STORAGE_NOT_CONFIGURED_REASON);
}

function SettingsStorageTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { apiUrl, client } = useDesktopApi();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<StorageStatusResult> => {
    // Prefer the authenticated settings endpoint; fall back to public /health
    // (same spacesConfigured flag) when auth fails or the route is unavailable.
    try {
      const body = await client.requestJson<{
        configured: boolean;
        provider?: string;
      }>("/api/v1/settings/storage");
      applyStorageConfigured(body.configured, setConfigured, setReason);
      return { configured: body.configured };
    } catch (error) {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, "")}/health`, {
          cache: "no-store",
        });
        if (response.ok) {
          const health = (await response.json()) as {
            spacesConfigured?: unknown;
          };
          if (typeof health.spacesConfigured === "boolean") {
            applyStorageConfigured(
              health.spacesConfigured,
              setConfigured,
              setReason,
            );
            return { configured: health.spacesConfigured };
          }
        }
      } catch {
        /* fall through to surface the original error */
      }

      const message =
        error instanceof ApiClientError
          ? error.status === 401 || error.status === 403
            ? "Could not authorize the storage check. Sync mode / session may be wrong."
            : error.message
          : error instanceof Error
            ? error.message
            : "Could not reach the API to check storage.";
      setConfigured(false);
      setReason(message);
      return { error: message };
    }
  }, [apiUrl, client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      connected={configured === null ? undefined : configured}
      body={
        <p>
          Letter PDFs and document content are stored in the deployment&apos;s
          DigitalOcean Spaces bucket. Credentials are configured on the API —
          BacksterOS does not store Spaces secrets in the app.
        </p>
      }
      statusLabel={
        configured === null
          ? "Loading…"
          : configured
            ? "Connected"
            : "Not connected"
      }
      secondaryLabel="Provider"
      secondaryValue="DigitalOcean Spaces"
      reason={reason}
      hint={
        configured
          ? "Credentials are present. Use Test connection to re-check status with the API."
          : null
      }
      testing={testing}
      testMessage={testMessage}
      testOk={testOk}
      onTestConnection={() => {
        void (async () => {
          setTesting(true);
          setTestMessage(null);
          setTestOk(null);
          const result = await refresh();
          if ("error" in result) {
            setTestOk(false);
            setTestMessage(result.error);
          } else if (result.configured) {
            setTestOk(true);
            setTestMessage("Connected — Spaces credentials are configured.");
          } else {
            setTestOk(false);
            setTestMessage(STORAGE_NOT_CONFIGURED_REASON);
          }
          setTesting(false);
        })();
      }}
    />
  );
}

function SettingsWhoopTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [status, setStatus] = useState<WhoopSettingsStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWhoopSettingsStatus();
      setStatus(next);
      return next;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read Whoop status.";
      const fallback: WhoopSettingsStatus = {
        connected: false,
        configured: false,
        email: null,
        reason: message,
        envPath: "",
      };
      setStatus(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connected = status?.connected ?? false;

  return (
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      connected={status === null ? undefined : connected}
      body={
        <p>
          Recovery, sleep, and strain appear above journal entries when Whoop
          credentials are configured. Tokens are read from a local{" "}
          <code>totem.env</code> file (shared with Circle). BacksterOS does not
          store Whoop passwords.
        </p>
      }
      statusLabel={
        status === null ? "Loading…" : connected ? "Connected" : "Not connected"
      }
      secondaryLabel="Account"
      secondaryValue={status?.email ?? "—"}
      reason={!connected ? status?.reason : null}
      hint={
        connected
          ? "Credentials are present. Use Test connection to load today\u2019s recovery, sleep, and strain snapshot."
          : status?.envPath
            ? `Looking for tokens at ${status.envPath}`
            : null
      }
      testing={testing}
      testMessage={testMessage}
      testOk={testOk}
      testDisabled={status === null}
      onTestConnection={() => {
        void (async () => {
          setTesting(true);
          setTestMessage(null);
          setTestOk(null);
          try {
            const result = await fetchWhoopDaySnapshot(todayIsoDate());
            await refresh();
            if (!result.authenticated) {
              setTestOk(false);
              setTestMessage(
                result.error ??
                  "Whoop is not connected. Add refresh or bearer tokens to totem.env.",
              );
              return;
            }
            if (result.snapshot) {
              setTestOk(true);
              setTestMessage("Connected — today\u2019s Whoop snapshot loaded.");
              return;
            }
            setTestOk(false);
            setTestMessage(
              result.error ?? "Could not load today\u2019s Whoop snapshot.",
            );
          } catch (error) {
            setTestOk(false);
            setTestMessage(
              error instanceof Error
                ? error.message
                : "Whoop connection test failed",
            );
          } finally {
            setTesting(false);
          }
        })();
      }}
    />
  );
}

export function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const { client } = useDesktopApi();
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  const activeTab: SettingsTabId =
    tab && isSettingsTabId(tab) ? tab : "general";
  const meta = getSettingsTabMeta(activeTab);

  const [timezone, setTimezone] = useState(() =>
    normalizeAppTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [workspaceSettings, setWorkspaceSettings] = useState<
    Record<string, unknown> | undefined
  >(undefined);

  useDesktopSectionBreadcrumb([
    { label: "Settings", href: "/settings/general" },
    { label: meta.label },
  ]);

  const reloadSettings = useCallback(async () => {
    if (!clerkKey) return;
    try {
      const body = await client.requestJson<{
        settings: Record<string, unknown>;
      }>("/api/v1/settings");
      setWorkspaceSettings(body.settings);
      setTimezone(
        normalizeAppTimezone(
          String(
            body.settings.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          ),
        ),
      );
      syncDefaultAssigneeIdFromSettings(body.settings);
    } catch {
      // keep local defaults
    }
  }, [client, clerkKey]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  if (!tab) {
    return <Navigate to="/settings/general" replace />;
  }

  if (!isSettingsTabId(tab)) {
    return <Navigate to="/settings/general" replace />;
  }

  return (
    <SettingsDetailLayout>
      {activeTab === "whoop" ? (
        <SettingsWhoopTab title={meta.label} description={meta.description} />
      ) : activeTab === "storage" ? (
        <SettingsStorageTab title={meta.label} description={meta.description} />
      ) : (
        <>
          <SettingsContentHeader
            title={meta.label}
            description={meta.description}
          />
          {activeTab === "general" ? (
            <GeneralSettingsSectionView
              timezone={timezone}
              saving={savingTimezone}
              onTimezoneChange={async (next) => {
                setTimezone(next);
                if (!clerkKey) return;
                setSavingTimezone(true);
                try {
                  await client.requestJson("/api/v1/settings", {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ timezone: next }),
                  });
                  await reloadSettings();
                } catch {
                  // keep optimistic value offline
                } finally {
                  setSavingTimezone(false);
                }
              }}
            />
          ) : null}
          {activeTab === "account" ? (
            <SettingsAccountTab
              settings={workspaceSettings}
              onSettingsSaved={() => void reloadSettings()}
            />
          ) : null}
          {activeTab === "sync" ? <SettingsSyncTab /> : null}
          {activeTab === "api" ? <SettingsApiTab /> : null}
          {activeTab === "cursor" ? (
            <ComingSoonSettingsSectionView
              title="Cursor"
              body="Cursor integration settings are not available yet. This section will cover API keys, agent profiles, and model selection when the feature is ready."
            />
          ) : null}
        </>
      )}
    </SettingsDetailLayout>
  );
}
