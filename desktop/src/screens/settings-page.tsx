import { useUser } from "@clerk/clerk-react";
import { ApiClientError } from "@backsteros/api-client";
import type {
  ApiKey,
  CreateApiKeyResponse,
  GithubConnectionStatus,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import {
  AccountSettingsSectionView,
  ApiKeysSettingsSectionView,
  GeneralSettingsSectionView,
  GithubSettingsSectionView,
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
import { getDesktopPublicEnvironment } from "../lib/env";
import {
  fetchGithubConnectionStatus,
  startGithubOauthConnect,
} from "../lib/github-oauth";
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

function SettingsGithubTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState<GithubConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchGithubConnectionStatus(client);
      setStatus(next);
      return next;
    } catch (error) {
      setStatus(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh().catch(() => {
      // status card shows empty / not connected
    });
  }, [refresh]);

  // After the OAuth popup returns, Clerk may have a new GitHub token before
  // React Query/status catches up — reload user + status on focus / soft notify.
  useEffect(() => {
    function onFocus() {
      void (async () => {
        try {
          await user?.reload();
        } catch {
          // ignore
        }
        void refresh().catch(() => undefined);
      })();
    }
    function onGithubStatusRefresh() {
      onFocus();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(
      "backsteros:github-status-refresh",
      onGithubStatusRefresh,
    );
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(
        "backsteros:github-status-refresh",
        onGithubStatusRefresh,
      );
    };
  }, [refresh, user]);

  const connectLabel =
    status?.connected ||
    user?.externalAccounts.some((account) => account.provider === "github")
      ? "Reconnect GitHub"
      : "Connect GitHub";

  return (
    <GithubSettingsSectionView
      title={title}
      headerDescription={description}
      loading={loading || !isLoaded}
      connected={status?.connected ?? false}
      login={status?.login ?? null}
      scopes={status?.scopes ?? []}
      missingScopes={status?.missingScopes ?? []}
      organizations={status?.organizations ?? []}
      repositoryCount={status?.repositoryCount ?? null}
      reason={actionError ?? status?.reason ?? null}
      connecting={connecting}
      testing={testing}
      testMessage={testMessage}
      testOk={testOk}
      connectLabel={connectLabel}
      connectDisabled={!user}
      onConnect={() => {
        if (!user) return;
        setConnecting(true);
        setActionError(null);
        void startGithubOauthConnect(user)
          .catch((error) => {
            setActionError(
              error instanceof Error
                ? error.message
                : "Could not start GitHub connection.",
            );
          })
          .finally(() => {
            setConnecting(false);
          });
      }}
      onTestConnection={() => {
        void (async () => {
          setTesting(true);
          setTestMessage(null);
          setTestOk(null);
          setActionError(null);
          try {
            const next = await refresh();
            if (!next.connected) {
              setTestOk(false);
              setTestMessage(next.reason ?? "GitHub is not connected.");
              return;
            }
            if (next.missingScopes.length > 0) {
              setTestOk(false);
              setTestMessage(
                `Connected as ${next.login}, but missing scopes: ${next.missingScopes.join(", ")}.`,
              );
              return;
            }
            const orgLabel =
              next.organizations.length > 0
                ? `${next.organizations.length} organization${next.organizations.length === 1 ? "" : "s"}`
                : "no organizations";
            setTestOk(true);
            setTestMessage(
              `Connected as ${next.login} with ${orgLabel} visible.`,
            );
          } catch (error) {
            setTestOk(false);
            setTestMessage(
              error instanceof Error
                ? error.message
                : "GitHub connection test failed",
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
      ) : activeTab === "moneybird" ? (
        <SettingsMoneybirdTab
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
          {activeTab === "api" ? <SettingsApiTab /> : null}
          {activeTab === "cursor" ? <SettingsCursorTab /> : null}
        </>
      )}
    </SettingsDetailLayout>
  );
}
