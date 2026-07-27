"use client";

import { ApiClientError } from "@backsteros/api-client";
import type {
  ApiKey,
  Contact as ApiContact,
  CreateApiKeyResponse,
} from "@backsteros/contracts";
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
import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SettingsGithubTab } from "@/components/settings-github-tab";
import {
  apiErrorMessage,
  useApiResource,
  useConsoleApi,
} from "@/lib/api-context";
import { useConsoleAvatarSrcMap, withAvatarSrc } from "@/lib/avatar-src";
import {
  DEFAULT_ASSIGNEE_SETTINGS_KEY,
  getDefaultAssigneeId,
  parseDefaultAssigneeIdFromSettings,
  setDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "@/lib/default-assignee";
import { getPublicEnvironment } from "@/lib/env";
import { useAgentTestingMode } from "@/lib/agent-testing-mode-context";
import { DEVELOPMENT_SETTINGS_NAV_TABS } from "@/lib/settings-tabs";

const STORAGE_NOT_CONFIGURED_REASON =
  "Object storage is not configured. Set Spaces credentials on the API deployment.";

function AgentTestingModeSettingsCard() {
  const { enabled, setEnabled } = useAgentTestingMode();

  return (
    <section className="settings-card">
      <h2>Agent testing</h2>
      <p>
        When on, the console shows controls to simulate agent flows (launch
        failure, holds, and more) without spending real agent turns. Stored in
        this browser only.
      </p>
      <div className="settings-toggle-row">
        <div className="settings-toggle-copy">
          <span className="settings-toggle-label">Agent testing mode</span>
          <span className="settings-hint">
            Reveals test buttons on task activity and related agent UI.
          </span>
        </div>
        <SegmentedPillToggle
          ariaLabel="Agent testing mode"
          value={enabled ? "on" : "off"}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
          onChange={(next) => setEnabled(next === "on")}
        />
      </div>
    </section>
  );
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
  const { client } = useConsoleApi();
  const clerkKey = getPublicEnvironment().clerkPublishableKey;
  const loadContacts = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const result = await api.requestJson<{ contacts: ApiContact[] }>(
        "/api/v1/contacts",
        { signal },
      );
      return result.contacts ?? [];
    },
    [],
  );
  const { data: contacts } = useApiResource(loadContacts, []);
  const contactAvatarSrc = useConsoleAvatarSrcMap("contact", contacts ?? []);
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
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts ?? [], contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const assigneeField =
    !contacts || contacts.length === 0 ? (
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
                // keep optimistic local value
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
  const { apiUrl, refresh } = useConsoleApi();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <SyncSettingsSectionView
      statusLabel="Connected"
      lastSyncLabel="Agent console uses the API directly (no offline sync)."
      urlLabel={apiUrl}
      syncing={refreshing}
      onSyncNow={() => {
        setRefreshing(true);
        refresh();
        window.setTimeout(() => setRefreshing(false), 400);
      }}
    />
  );
}

function SettingsApiTab() {
  const { client } = useConsoleApi();
  const clerkKey = getPublicEnvironment().clerkPublishableKey;
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
      setErrorMessage(apiErrorMessage(error));
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
          setErrorMessage(apiErrorMessage(error));
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
  const { apiUrl, client } = useConsoleApi();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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
        /* fall through */
      }

      const message =
        error instanceof ApiClientError
          ? error.status === 401 || error.status === 403
            ? "Could not authorize the storage check."
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
          object storage. Credentials are configured on the API — the agent
          console does not store Spaces secrets locally.
        </p>
      }
      statusLabel={
        configured === null
          ? "Loading…"
          : configured
            ? "Configured"
            : "Not configured"
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
          try {
            const result = await refresh();
            if ("error" in result) {
              setTestOk(false);
              setTestMessage(result.error ?? "Storage check failed.");
              return;
            }
            setTestOk(result.configured);
            setTestMessage(
              result.configured
                ? "Connected — Spaces credentials are configured."
                : STORAGE_NOT_CONFIGURED_REASON,
            );
          } finally {
            setTesting(false);
          }
        })();
      }}
    />
  );
}

export function ConsoleSettingsPage({ tab }: { tab: string | null }) {
  const { client } = useConsoleApi();
  const clerkKey = getPublicEnvironment().clerkPublishableKey;
  const allowed = DEVELOPMENT_SETTINGS_NAV_TABS.some((entry) => entry.id === tab);
  const activeTab: SettingsTabId =
    tab && isSettingsTabId(tab) && allowed ? tab : "general";
  const meta = getSettingsTabMeta(activeTab);

  const [timezone, setTimezone] = useState(() =>
    normalizeAppTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [workspaceSettings, setWorkspaceSettings] = useState<
    Record<string, unknown> | undefined
  >(undefined);

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

  return (
    <SettingsDetailLayout>
      {activeTab === "storage" ? (
        <SettingsStorageTab title={meta.label} description={meta.description} />
      ) : activeTab === "github" ? (
        <SettingsGithubTab title={meta.label} description={meta.description} />
      ) : (
        <>
          <SettingsContentHeader
            title={meta.label}
            description={meta.description}
          />
          {activeTab === "general" ? (
            <>
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
                    // keep optimistic value
                  } finally {
                    setSavingTimezone(false);
                  }
                }}
              />
              <AgentTestingModeSettingsCard />
            </>
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
