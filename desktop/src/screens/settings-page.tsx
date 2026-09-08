import { ApiClientError } from "@backsteros/api-client";
import type {
  ApiKey,
  CreateApiKeyResponse,
} from "@backsteros/contracts";
import { API_KEY_SCOPES } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "@tanstack/react-router";

import {
  AccountSettingsSectionView,
  ApiKeysSettingsSectionView,
  GeneralSettingsSectionView,
  IntegrationConnectionSettingsView,
  SearchableDropdown,
  SettingsContentHeader,
  SettingsDetailLayout,
  buildAssigneeDropdownOptions,
  getSettingsTabMeta,
  isSettingsTabId,
  normalizeAppTimezone,
  type SettingsApiKeyItem,
  type SettingsTabId,
} from "@backsteros/ui";
import { useDesktopApi } from "../lib/api-context";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import {
  DEFAULT_ASSIGNEE_SETTINGS_KEY,
  getDefaultAssigneeId,
  parseDefaultAssigneeIdFromSettings,
  setDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  fetchWhoopDaySnapshot,
  fetchWhoopSettingsStatus,
  todayIsoDate,
  type WhoopSettingsStatus,
} from "../lib/whoop";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { projectFs } from "../lib/project-fs";
import { SettingsCursorTab } from "../components/settings-cursor-tab";
import { SettingsMoneybirdTab } from "../components/settings-moneybird-tab";
import { SettingsMapboxTab } from "../components/settings-mapbox-tab";
import { SettingsGithubTab } from "../components/settings-github-tab";
import { SettingsEmailTab } from "../components/settings-email-tab";

function SettingsAccountTab({
  settings,
  onSettingsSaved,
}: {
  settings: Record<string, unknown> | undefined;
  onSettingsSaved?: () => void;
}) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const contacts = workspace.contacts;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const [assigneeId, setAssigneeId] = useState<string | null>(() =>
    getDefaultAssigneeId(),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const synced = syncDefaultAssigneeIdFromSettings(settings);
    setAssigneeId(synced);

    const fromServer = parseDefaultAssigneeIdFromSettings(settings);
    if (fromServer !== undefined || !synced) return;
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
  }, [client, onSettingsSaved, settings]);

  const options = useMemo(
    () =>
      buildAssigneeDropdownOptions(withAvatarSrc(contacts, contactAvatarSrc)),
    [contactAvatarSrc, contacts],
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
    <AccountSettingsSectionView
      showEmail={false}
      assigneeField={assigneeField}
    />
  );
}

function SettingsApiTab() {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const contacts = workspace.contacts;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const [apiKeys, setApiKeys] = useState<SettingsApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
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
          contactId: key.contactId ?? null,
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
  }, [client]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  return (
    <ApiKeysSettingsSectionView
      apiKeys={apiKeys}
      contacts={withAvatarSrc(contacts, contactAvatarSrc)}
      loading={loading}
      errorMessage={errorMessage}
      onRetry={() => void loadKeys()}
      onCreate={async (name, contactId) => {
        try {
          const result = await client.requestJson<CreateApiKeyResponse>(
            "/api/v1/api-keys",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name,
                scopes: [...API_KEY_SCOPES],
                contactId,
              }),
            },
          );
          setApiKeys((current) => [
            {
              id: result.apiKey.id,
              name: result.apiKey.name,
              prefix: result.apiKey.prefix,
              scopes: result.apiKey.scopes,
              contactId: result.apiKey.contactId ?? null,
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
                    contactId: updated.contactId ?? null,
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
      onSetContact={async (id, contactId) => {
        try {
          const updated = await client.requestJson<ApiKey>(
            `/api/v1/api-keys/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ contactId }),
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
                    contactId: updated.contactId ?? null,
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
  "Local vault is not configured. Choose a vault folder in Settings → Storage.";

type StorageStatus = {
  configured: boolean;
  provider?: string;
  vaultPath?: string | null;
};

type StorageStatusResult =
  | StorageStatus
  | { error: string };

function SettingsStorageTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { apiUrl, client } = useDesktopApi();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const applyStatus = useCallback((body: StorageStatus) => {
    setConfigured(body.configured);
    setVaultPath(body.vaultPath ?? null);
    setReason(body.configured ? null : STORAGE_NOT_CONFIGURED_REASON);
  }, []);

  const refresh = useCallback(async (): Promise<StorageStatusResult> => {
    try {
      const body = await client.requestJson<StorageStatus>(
        "/api/v1/settings/storage",
      );
      applyStatus(body);
      return body;
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
            const fallback: StorageStatus = {
              configured: health.spacesConfigured,
              provider: "local-vault",
              vaultPath: null,
            };
            applyStatus(fallback);
            return fallback;
          }
        }
      } catch {
        /* fall through */
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
  }, [apiUrl, applyStatus, client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chooseVaultFolder = useCallback(async () => {
    setSaving(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const next = await projectFs.pickDirectory(vaultPath ?? undefined);
      if (!next) {
        setSaving(false);
        return;
      }
      const body = await client.requestJson<StorageStatus>(
        "/api/v1/settings/storage",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vaultPath: next }),
        },
      );
      applyStatus(body);
      setTestOk(true);
      setTestMessage("Vault folder saved. Journal, Projects, Letters, and Knowledge Base were created.");
    } catch (error) {
      setTestOk(false);
      setTestMessage(
        error instanceof Error ? error.message : "Could not save vault path.",
      );
    } finally {
      setSaving(false);
    }
  }, [applyStatus, client, vaultPath]);

  return (
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      connected={configured === null ? undefined : configured}
      body={
        <>
          <p>
            Documents, journal notes, and letter PDFs live in a local Obsidian-style
            vault on the computer running the API. Pick a folder once; BacksterOS
            creates <code>Journal</code>, <code>Projects</code>,{" "}
            <code>Letters</code>, and <code>Knowledge Base</code> automatically.
          </p>
          <div className="settings-field" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void chooseVaultFolder();
              }}
            >
              {saving
                ? "Saving…"
                : configured
                  ? "Change vault folder…"
                  : "Choose vault folder…"}
            </button>
          </div>
        </>
      }
      statusLabel={
        configured === null
          ? "Loading…"
          : configured
            ? "Configured"
            : "Not configured"
      }
      secondaryLabel="Vault path"
      secondaryValue={vaultPath ?? "—"}
      reason={reason}
      hint={
        configured
          ? "Every project gets Documents, Updates, and .cursor skills; Codebase is added only for codebase projects."
          : null
      }
      testing={testing || saving}
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
            setTestMessage(
              result.vaultPath
                ? `Vault ready at ${result.vaultPath}`
                : "Local vault is configured.",
            );
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
          <code>totem.env</code> file under{" "}
          <code>~/.backsteros-agent/</code>. BacksterOS does not store Whoop
          passwords.
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
  const { tab } = useParams({ strict: false }) as { tab?: string };
  const { client } = useDesktopApi();
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
  }, [client]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  if (!tab) {
    return <Navigate to="/settings/$tab" params={{ tab: "general" }} replace />;
  }

  if (!isSettingsTabId(tab)) {
    return <Navigate to="/settings/$tab" params={{ tab: "general" }} replace />;
  }

  return (
    <SettingsDetailLayout>
      {activeTab === "whoop" ? (
        <SettingsWhoopTab title={meta.label} description={meta.description} />
      ) : activeTab === "moneybird" ? (
        <SettingsMoneybirdTab
          title={meta.label}
          description={meta.description}
        />
      ) : activeTab === "mapbox" ? (
        <SettingsMapboxTab
          title={meta.label}
          description={meta.description}
        />
      ) : activeTab === "email" ? (
        <SettingsEmailTab
          title={meta.label}
          description={meta.description}
        />
      ) : activeTab === "storage" ? (
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
            <GeneralSettingsSectionView
              timezone={timezone}
              saving={savingTimezone}
              onTimezoneChange={async (next) => {
                setTimezone(next);
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
          {activeTab === "api" ? <SettingsApiTab /> : null}
          {activeTab === "cursor" ? <SettingsCursorTab /> : null}
        </>
      )}
    </SettingsDetailLayout>
  );
}
