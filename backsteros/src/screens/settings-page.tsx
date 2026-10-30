import { ApiClientError } from "@backsteros/api-client";
import type {
  Agent,
  AgentWebhookTestResult,
  ApiKey,
  ApiKeyAuditLog,
  ApiKeyRequestLog,
  CreateApiKeyResponse,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "@tanstack/react-router";

import {
  ApiKeysSettingsSectionView,
  IntegrationConnectionSettingsView,
  SettingsContentHeader,
  SettingsDetailLayout,
  getSettingsTabMeta,
  isLegacyIntegrationSettingsTab,
  isSettingsTabId,
  normalizeAppTimezone,
  type AgentWebhookSettings,
  type SettingsApiKeyAuditLogItem,
  type SettingsApiKeyItem,
  type SettingsApiKeyRequestLogItem,
  type SettingsTabId,
} from "@backsteros/ui";
import { useDesktopApi } from "../lib/api-context";
import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "../lib/cloud-core-api";
import { notifyShellAgentRosterChanged } from "../lib/shell-agent-roster";
import {
  clearAgentWebhookVerified,
  markAgentWebhookVerified,
} from "../lib/shell-agent-webhook-verified";
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

function cloudSettingsErrorMessage(error: unknown, fallback: string): string {
  if (isCloudCoreApiError(error) && error.status === 401) {
    return "Owner API key required for cloud agents (Tauri reads ~/.config/backsteros/cli.env; Vite serve loads it automatically). Restart the dev server after updating the key.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function toAgentWebhookSettings(agent: Agent): AgentWebhookSettings {
  return {
    agentId: agent.id,
    webhookUrl: agent.webhookUrl,
    webhookSecretConfigured: agent.webhookSecretConfigured,
  };
}

/**
 * Settings → API: API keys stay on local-core (agents door blocks `/api-keys`).
 * Chat agents/webhooks go through the cloud agents door so the shell roster
 * matches. Key ids are replicated, so linking `apiKeyId` on a cloud agent works.
 */
function SettingsApiTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const contactsWithAvatars = useMemo(
    () => withAvatarSrc(contacts, contactAvatarSrc),
    [contactAvatarSrc, contacts],
  );
  const [apiKeys, setApiKeys] = useState<SettingsApiKeyItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [auditLogs, setAuditLogs] = useState<SettingsApiKeyAuditLogItem[]>([]);
  const [requestLogs, setRequestLogs] = useState<
    SettingsApiKeyRequestLogItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const agentWebhookByApiKeyId = useMemo(() => {
    const map = new Map<string, AgentWebhookSettings>();
    for (const agent of agents) {
      if (!agent.apiKeyId) continue;
      map.set(agent.apiKeyId, toAgentWebhookSettings(agent));
    }
    return map;
  }, [agents]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [keysBody, auditBody, requestBody, agentsResult] =
        await Promise.all([
          client.requestJson<{ apiKeys: ApiKey[] }>("/api/v1/api-keys"),
          client.requestJson<{ auditLogs: ApiKeyAuditLog[] }>(
            "/api/v1/api-keys/audit-logs?limit=100",
          ),
          client.requestJson<{ requestLogs: ApiKeyRequestLog[] }>(
            "/api/v1/api-keys/request-logs?limit=200",
          ),
          cloudCoreRequestJson<{ agents: Agent[] }>("/api/v1/agents").then(
            (body) => ({ ok: true as const, body }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        ]);
      setApiKeys(keysBody.apiKeys.map(toSettingsApiKey));
      setAuditLogs(auditBody.auditLogs.map(toSettingsAuditLog));
      setRequestLogs(requestBody.requestLogs.map(toSettingsRequestLog));
      if (agentsResult.ok) {
        setAgents(agentsResult.body.agents);
      } else {
        setAgents([]);
        setErrorMessage(
          cloudSettingsErrorMessage(
            agentsResult.error,
            "Could not load cloud agents",
          ),
        );
      }
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

  async function saveAgentWebhook(
    apiKeyId: string,
    input: { webhookUrl?: string | null; webhookSecret?: string },
  ): Promise<AgentWebhookSettings | null> {
    const existing = agents.find((agent) => agent.apiKeyId === apiKeyId);
    const apiKey = apiKeys.find((entry) => entry.id === apiKeyId);
    try {
      let saved: Agent;
      if (existing) {
        saved = await cloudCoreRequestJson<Agent>(
          `/api/v1/agents/${encodeURIComponent(existing.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(input),
          },
        );
        setAgents((current) =>
          current.map((entry) => (entry.id === saved.id ? saved : entry)),
        );
      } else {
        if (!apiKey) {
          setErrorMessage("API key not found for agent webhook.");
          return null;
        }
        saved = await cloudCoreRequestJson<Agent>("/api/v1/agents", {
          method: "POST",
          body: JSON.stringify({
            name: apiKey.name,
            contactId: apiKey.contactId,
            apiKeyId,
            webhookUrl: input.webhookUrl ?? null,
            ...(input.webhookSecret !== undefined
              ? { webhookSecret: input.webhookSecret }
              : {}),
          }),
        });
        setAgents((current) => [saved, ...current]);
      }
      // Saving URL/secret is not enough for chat — clear prior Connected state
      // until SettingsTestConnectionSwap succeeds.
      if (saved.id) clearAgentWebhookVerified(saved.id);
      notifyShellAgentRosterChanged();
      return toAgentWebhookSettings(saved);
    } catch (error) {
      setErrorMessage(
        cloudSettingsErrorMessage(error, "Could not save agent webhook"),
      );
      return null;
    }
  }

  async function probeWebhookViaVite(input: {
    agentId: string;
    webhookUrl: string;
    webhookSecret: string;
    agentName: string;
  }): Promise<AgentWebhookTestResult> {
    const res = await fetch("/__webhook_probe__", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        url: input.webhookUrl,
        secret: input.webhookSecret,
        agentId: input.agentId,
        agentName: input.agentName,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text.trim() || `Probe failed (${res.status})`);
    }
    return (await res.json()) as AgentWebhookTestResult;
  }

  async function testAgentWebhook(
    agentId: string,
    input: {
      webhookUrl: string;
      webhookSecret: string | null;
      agentName: string;
    },
  ): Promise<void> {
    let result: AgentWebhookTestResult;
    try {
      result = await cloudCoreRequestJson<AgentWebhookTestResult>(
        `/api/v1/agents/${encodeURIComponent(agentId)}/webhook/test`,
        { method: "POST", body: "{}" },
      );
    } catch (error) {
      const missingOnCloud =
        isCloudCoreApiError(error) &&
        (error.status === 404 || error.status === 0);
      if (missingOnCloud && input.webhookSecret?.trim()) {
        result = await probeWebhookViaVite({
          agentId,
          webhookUrl: input.webhookUrl,
          webhookSecret: input.webhookSecret.trim(),
          agentName: input.agentName,
        });
      } else if (missingOnCloud) {
        throw new Error(
          "Re-save the webhook secret, then click Test (cloud test route is not deployed yet).",
        );
      } else {
        throw new Error(
          cloudSettingsErrorMessage(error, "Webhook test failed"),
        );
      }
    }
    if (!result.ok) {
      clearAgentWebhookVerified(agentId);
      notifyShellAgentRosterChanged();
      throw new Error(result.error?.trim() || "Webhook test failed");
    }
    markAgentWebhookVerified(agentId);
    notifyShellAgentRosterChanged();
  }

  return (
    <ApiKeysSettingsSectionView
      title={title}
      description={description}
      apiKeys={apiKeys}
      auditLogs={auditLogs}
      requestLogs={requestLogs}
      contacts={contactsWithAvatars}
      loading={loading}
      errorMessage={errorMessage}
      onRetry={() => void loadKeys()}
      agentWebhookByApiKeyId={agentWebhookByApiKeyId}
      onSaveAgentWebhook={saveAgentWebhook}
      onTestAgentWebhook={testAgentWebhook}
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
            error instanceof Error ? error.message : "Could not create API key",
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
            error instanceof Error ? error.message : "Could not rotate API key",
          );
          return null;
        }
      }}
      onRevoke={async (id) => {
        try {
          const linked = agents.filter((agent) => agent.apiKeyId === id);
          await client.requestJson(`/api/v1/api-keys/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          for (const agent of linked) {
            try {
              await cloudCoreRequestJson(
                `/api/v1/agents/${encodeURIComponent(agent.id)}`,
                { method: "DELETE" },
              );
            } catch {
              // Key revoke still succeeds; cloud agent cleanup is best-effort.
            }
          }
          setApiKeys((current) => current.filter((entry) => entry.id !== id));
          setAgents((current) =>
            current.filter((agent) => agent.apiKeyId !== id),
          );
          if (linked.length > 0) notifyShellAgentRosterChanged();
          void loadKeys();
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
