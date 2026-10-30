import { ApiClientError } from "@backsteros/api-client";
import type {
  Agent,
  ApiKey,
  ApiKeyAuditLog,
  ApiKeyRequestLog,
  CreateApiKeyResponse,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "@tanstack/react-router";

import {
  AgentsSettingsSectionView,
  ApiKeysSettingsSectionView,
  IntegrationConnectionSettingsView,
  SettingsContentHeader,
  SettingsDetailLayout,
  classifyApiKeyType,
  getSettingsTabMeta,
  isLegacyIntegrationSettingsTab,
  isSettingsTabId,
  normalizeAppTimezone,
  type SettingsApiKeyAuditLogItem,
  type SettingsApiKeyItem,
  type SettingsApiKeyRequestLogItem,
  type SettingsAgentItem,
  type SettingsTabId,
} from "@backsteros/ui";
import { useDesktopApi } from "../lib/api-context";
import { SettingsAccountTab } from "../components/settings-account-tab";
import { SettingsLabelsTab } from "../components/settings-labels-tab";
import { SettingsDocumentPropertiesTab } from "../components/settings-document-properties-tab";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { syncDefaultAssigneeIdFromSettings } from "../lib/default-assignee";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";
import { projectFs } from "../lib/project-fs";
import { rememberDesktopVaultRoot, peekPersistedDesktopVaultRoot } from "../lib/desktop-vault";
import { localOnlyRestFailClosed } from "../lib/workspace/powersync-write-path";
import { SettingsIntegrationsTab } from "../components/settings-integrations-tab";
import { SettingsReplicationDeadLettersSection } from "../components/settings-replication-dead-letters";
import { SettingsSyncingWorkbench } from "../components/settings-syncing-workbench";

function toSettingsApiKey(key: ApiKey): SettingsApiKeyItem {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    contactId: key.contactId ?? null,
    expiresAt: key.expiresAt ?? null,
    lastUsedAt: key.lastUsedAt ?? null,
    lastUsedAddress: key.lastUsedAddress ?? null,
    createdAt: key.createdAt,
    hasRecoverableSecret: key.hasRecoverableSecret,
  };
}

function toSettingsAuditLog(entry: ApiKeyAuditLog): SettingsApiKeyAuditLogItem {
  return {
    id: entry.id,
    apiKeyId: entry.apiKeyId,
    apiKeyName: entry.apiKeyName,
    action: entry.action,
    actorKind: entry.actorKind,
    address: entry.address,
    createdAt: entry.createdAt,
  };
}

function toSettingsRequestLog(
  entry: ApiKeyRequestLog,
): SettingsApiKeyRequestLogItem {
  return {
    id: entry.id,
    apiKeyId: entry.apiKeyId,
    apiKeyName: entry.apiKeyName,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    address: entry.address,
    createdAt: entry.createdAt,
  };
}

function toSettingsAgent(agent: Agent): SettingsAgentItem {
  return {
    id: agent.id,
    name: agent.name,
    contactId: agent.contactId,
    apiKeyId: agent.apiKeyId,
    avatarUrl: agent.avatarUrl,
    role: agent.role,
    enabled: agent.enabled,
    webhookUrl: agent.webhookUrl,
    webhookSecretConfigured: agent.webhookSecretConfigured,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

function SettingsApiTab({
  title: _title,
  description: _description,
}: {
  title: string;
  description: string;
}) {
  void _title;
  void _description;
  const { client } = useDesktopApi();
  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const contactsWithAvatars = useMemo(
    () => withAvatarSrc(contacts, contactAvatarSrc),
    [contactAvatarSrc, contacts],
  );
  const [apiKeys, setApiKeys] = useState<SettingsApiKeyItem[]>([]);
  const [rawApiKeys, setRawApiKeys] = useState<ApiKey[]>([]);
  const [agents, setAgents] = useState<SettingsAgentItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<SettingsApiKeyAuditLogItem[]>([]);
  const [requestLogs, setRequestLogs] = useState<
    SettingsApiKeyRequestLogItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [keysBody, auditBody, requestBody, agentsBody] = await Promise.all([
        client.requestJson<{ apiKeys: ApiKey[] }>("/api/v1/api-keys"),
        client.requestJson<{ auditLogs: ApiKeyAuditLog[] }>(
          "/api/v1/api-keys/audit-logs?limit=100",
        ),
        client.requestJson<{ requestLogs: ApiKeyRequestLog[] }>(
          "/api/v1/api-keys/request-logs?limit=200",
        ),
        client.requestJson<{ agents: Agent[] }>("/api/v1/agents"),
      ]);
      setRawApiKeys(keysBody.apiKeys);
      setApiKeys(keysBody.apiKeys.map(toSettingsApiKey));
      setAuditLogs(auditBody.auditLogs.map(toSettingsAuditLog));
      setRequestLogs(requestBody.requestLogs.map(toSettingsRequestLog));
      setAgents(agentsBody.agents.map(toSettingsAgent));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load API settings",
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const agentKeyOptions = useMemo(
    () =>
      rawApiKeys
        .filter((key) => classifyApiKeyType(key) === "agent")
        .map((key) => ({
          id: key.id,
          name: key.name,
          contactId: key.contactId ?? null,
          expiresAt: key.expiresAt ?? null,
          scopes: key.scopes,
        })),
    [rawApiKeys],
  );

  async function patchApiKey(
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const updated = await client.requestJson<ApiKey>(
        `/api/v1/api-keys/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setApiKeys((current) =>
        current.map((entry) =>
          entry.id === updated.id ? toSettingsApiKey(updated) : entry,
        ),
      );
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update API key",
      );
      return false;
    }
  }

  return (
    <div className="settings-api-tab">
      <AgentsSettingsSectionView
        title="Agents"
        description="Chat agents with per-agent webhook URL and secret. Secrets are write-only and never shown again."
        agents={agents}
        contacts={contactsWithAvatars}
        apiKeys={agentKeyOptions}
        loading={loading}
        errorMessage={errorMessage}
        onRetry={() => void loadKeys()}
        onCreate={async (input) => {
          try {
            const created = await client.requestJson<Agent>("/api/v1/agents", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            setAgents((current) => [toSettingsAgent(created), ...current]);
            return true;
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "Could not create agent",
            );
            return false;
          }
        }}
        onUpdate={async (id, patch) => {
          try {
            const updated = await client.requestJson<Agent>(
              `/api/v1/agents/${encodeURIComponent(id)}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(patch),
              },
            );
            setAgents((current) =>
              current.map((entry) =>
                entry.id === updated.id ? toSettingsAgent(updated) : entry,
              ),
            );
            return true;
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "Could not update agent",
            );
            return false;
          }
        }}
        onDelete={async (id) => {
          try {
            await client.requestJson(
              `/api/v1/agents/${encodeURIComponent(id)}`,
              { method: "DELETE" },
            );
            setAgents((current) => current.filter((entry) => entry.id !== id));
            return true;
          } catch {
            return false;
          }
        }}
      />
      {/*
        OS-154 interim home for non-agent keys + logs until Remon picks a
        permanent place (proposal: Settings → Developer or /settings/api-keys).
      */}
      <div className="settings-api-tab__parked-keys">
        <ApiKeysSettingsSectionView
          title="API keys & logs"
          description="Access, Applications, TV, and Contacts sync keys — parked here until their final Settings home is chosen. Create, rotate, and revoke still work."
          flattenChrome
          apiKeys={apiKeys}
          auditLogs={auditLogs}
          requestLogs={requestLogs}
          contacts={contactsWithAvatars}
          loading={loading}
          errorMessage={null}
          onRetry={() => void loadKeys()}
          onRevealSecret={async (id) => {
            try {
              const body = await client.requestJson<{ secret: string }>(
                `/api/v1/api-keys/${encodeURIComponent(id)}/secret`,
              );
              return body.secret;
            } catch {
              return null;
            }
          }}
          onCreate={async (name, contactId, expiresAt, scopes, kind) => {
            try {
              const result = await client.requestJson<CreateApiKeyResponse>(
                "/api/v1/api-keys",
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    name,
                    kind,
                    scopes,
                    contactId,
                    expiresAt,
                  }),
                },
              );
              setApiKeys((current) => [
                toSettingsApiKey(result.apiKey),
                ...current,
              ]);
              void loadKeys();
              return { id: result.apiKey.id, secret: result.secret };
            } catch (error) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Could not create API key",
              );
              return null;
            }
          }}
          onRename={(id, name) => patchApiKey(id, { name })}
          onSetContact={(id, contactId) => patchApiKey(id, { contactId })}
          onSetExpiry={(id, expiresAt) => patchApiKey(id, { expiresAt })}
          onRotate={async (id) => {
            try {
              const result = await client.requestJson<CreateApiKeyResponse>(
                `/api/v1/api-keys/${encodeURIComponent(id)}/rotate`,
                { method: "POST" },
              );
              setApiKeys((current) =>
                current.map((entry) =>
                  entry.id === result.apiKey.id
                    ? toSettingsApiKey(result.apiKey)
                    : entry,
                ),
              );
              void loadKeys();
              return result.secret;
            } catch (error) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Could not rotate API key",
              );
              return null;
            }
          }}
          onRevoke={async (id) => {
            try {
              await client.requestJson(
                `/api/v1/api-keys/${encodeURIComponent(id)}`,
                { method: "DELETE" },
              );
              setApiKeys((current) =>
                current.filter((entry) => entry.id !== id),
              );
              void loadKeys();
              return true;
            } catch {
              return false;
            }
          }}
        />
      </div>
    </div>
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const applyStatus = useCallback((body: StorageStatus) => {
    setConfigured(body.configured);
    setVaultPath(body.vaultPath ?? null);
    if (body.vaultPath) rememberDesktopVaultRoot(body.vaultPath);
    setReason(body.configured ? null : STORAGE_NOT_CONFIGURED_REASON);
  }, []);

  const refresh = useCallback(async (): Promise<StorageStatusResult> => {
    const cloudClient = localOnlyRestFailClosed(apiUrl);
    if (cloudClient) {
      const local = peekPersistedDesktopVaultRoot();
      const fallback: StorageStatus = {
        configured: Boolean(local),
        provider: "local-vault",
        vaultPath: local,
      };
      applyStatus(fallback);
      return fallback;
    }
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
    setStatusMessage(null);
    setStatusOk(null);
    try {
      const next = await projectFs.pickDirectory(vaultPath ?? undefined);
      if (!next) {
        setSaving(false);
        return;
      }
      if (localOnlyRestFailClosed(apiUrl)) {
        rememberDesktopVaultRoot(next);
        applyStatus({
          configured: true,
          provider: "local-vault",
          vaultPath: next,
        });
        setStatusOk(true);
        setStatusMessage(
          "Saved on this Mac. Cloud-core does not store this path, and Docker was not started.",
        );
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
      setStatusOk(true);
      setStatusMessage(
        "Vault folder saved. Journal, Projects, Letters, and Spaces were created.",
      );
    } catch (error) {
      setStatusOk(false);
      setStatusMessage(
        error instanceof Error ? error.message : "Could not save vault path.",
      );
    } finally {
      setSaving(false);
    }
  }, [apiUrl, applyStatus, client, vaultPath]);

  return (
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      connected={configured === null ? undefined : configured}
      body={
        <>
          <p>
            Documents and letter PDFs can open from a folder on this Mac, or from
            cloud storage when the file is there. The folder stays on this computer.
            Choosing it does not start Docker or local-core.
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
          {statusMessage ? (
            <p
              className={statusOk === false ? "settings-error" : "settings-hint"}
              role="status"
            >
              {statusMessage}
            </p>
          ) : null}
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
      testing={saving}
      onTestConnection={async () => {
        const result = await refresh();
        if ("error" in result) {
          throw new Error(result.error);
        }
        if (!result.configured) {
          throw new Error(STORAGE_NOT_CONFIGURED_REASON);
        }
      }}
    />
  );
}

export function SettingsPage() {
  const { tab, apiKeyId } = useParams({ strict: false }) as {
    tab?: string;
    apiKeyId?: string;
  };
  const { client } = useDesktopApi();
  const activeTab: SettingsTabId = apiKeyId
    ? "api"
    : tab && isSettingsTabId(tab)
      ? tab
      : "account";
  const meta = getSettingsTabMeta(activeTab);

  const [workspaceTimezone, setWorkspaceTimezone] = useState(() =>
    normalizeAppTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [workspaceSettings, setWorkspaceSettings] = useState<
    Record<string, unknown> | undefined
  >(undefined);

  useDesktopSectionBreadcrumb([
    { label: "Settings", href: "/settings/account" },
    { label: meta.label },
  ]);

  const reloadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<{
        settings: Record<string, unknown>;
      }>("/api/v1/settings");
      setWorkspaceSettings(body.settings);
      setWorkspaceTimezone(
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

  // Legacy per-key URL — details now expand inline on the API keys list.
  if (apiKeyId) {
    return <Navigate to="/settings/$tab" params={{ tab: "api" }} replace />;
  }

  if (!tab) {
    return <Navigate to="/settings/$tab" params={{ tab: "account" }} replace />;
  }

  // Former General tab — timezone + prefs now live on Account.
  if (tab === "general") {
    return <Navigate to="/settings/$tab" params={{ tab: "account" }} replace />;
  }

  if (isLegacyIntegrationSettingsTab(tab)) {
    return (
      <Navigate
        to="/settings/$tab"
        params={{ tab: "integrations" }}
        search={{ open: tab } as never}
        replace
      />
    );
  }

  if (!isSettingsTabId(tab)) {
    return <Navigate to="/settings/$tab" params={{ tab: "account" }} replace />;
  }

  return (
    <SettingsDetailLayout
      wide={
        activeTab === "account" ||
        activeTab === "syncing" ||
        activeTab === "labels" ||
        activeTab === "document-properties" ||
        activeTab === "api" ||
        activeTab === "integrations"
      }
    >
      {activeTab === "storage" ? (
        <SettingsStorageTab title={meta.label} description={meta.description} />
      ) : activeTab === "api" ? (
        <SettingsApiTab title={meta.label} description={meta.description} />
      ) : (
        <>
          {activeTab === "account" || activeTab === "syncing" ? null : (
            <SettingsContentHeader
              title={meta.label}
              description={meta.description}
            />
          )}
          {activeTab === "account" ? (
            <div className="settings-account">
              <SettingsAccountTab
                settings={workspaceSettings}
                workspaceTimezone={workspaceTimezone}
                onSettingsSaved={() => void reloadSettings()}
              />
              <div className="settings-account__prefs">
                <SettingsReplicationDeadLettersSection />
              </div>
            </div>
          ) : null}
          {activeTab === "syncing" ? (
            <SettingsSyncingWorkbench
              title={meta.label}
              description={meta.description}
            />
          ) : null}
          {activeTab === "labels" ? <SettingsLabelsTab /> : null}
          {activeTab === "document-properties" ? (
            <SettingsDocumentPropertiesTab />
          ) : null}
          {activeTab === "integrations" ? (
            <SettingsIntegrationsTab
              workspaceSettings={workspaceSettings}
              onSettingsSaved={() => void reloadSettings()}
            />
          ) : null}
        </>
      )}
    </SettingsDetailLayout>
  );
}
