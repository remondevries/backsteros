import { ApiClientError } from "@backsteros/api-client";
import type {
  Agent,
  AgentWebhookTestResult,
  ApiKey,
  ApiKeyAuditLog,
  ApiKeyRequestLog,
  ChatThreadMessage,
  ChatThreadWithMessages,
  CreateApiKeyResponse,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";

import {
  ApiKeysSettingsSectionView,
  IntegrationConnectionSettingsView,
  SettingsContentHeader,
  SettingsDetailLayout,
  getSettingsTabMeta,
  isApiKeyTypeTab,
  isApiKeysSettingsPanel,
  isLegacyIntegrationSettingsTab,
  isSettingsTabId,
  normalizeAppTimezone,
  type AgentWebhookSettings,
  type ApiKeyTypeTab,
  type ApiKeysSettingsPanel,
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
import {
  readAgentApiKeySortOrderIds,
  sortAgentsForDisplay,
  writeAgentApiKeySortOrderIds,
  writeAgentSortOrderIds,
} from "../lib/shell-agent-order";
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
    sortOrder: agent.sortOrder ?? 0,
  };
}

/**
 * Settings → API: API keys stay on local-core (agents door blocks `/api-keys`).
 * Chat agents/webhooks go through the cloud agents door so the shell roster
 * matches. Key ids are replicated, so linking `apiKeyId` on a cloud agent works.
 */
function parseApiKeysSearch(searchStr: string): {
  typeTab: ApiKeyTypeTab;
  panelView: ApiKeysSettingsPanel;
} {
  const params = new URLSearchParams(
    searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
  );
  const typeRaw = params.get("type");
  const panelRaw = params.get("panel");
  return {
    typeTab: isApiKeyTypeTab(typeRaw) ? typeRaw : "access",
    panelView: isApiKeysSettingsPanel(panelRaw) ? panelRaw : "keys",
  };
}

function SettingsApiTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const { typeTab, panelView } = useMemo(
    () => parseApiKeysSearch(searchStr),
    [searchStr],
  );
  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const contactsWithAvatars = useMemo(
    () => withAvatarSrc(contacts, contactAvatarSrc),
    [contactAvatarSrc, contacts],
  );
  const [apiKeys, setApiKeys] = useState<SettingsApiKeyItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentKeyOrderIds, setAgentKeyOrderIds] = useState<string[]>(() =>
    readAgentApiKeySortOrderIds(),
  );
  const [auditLogs, setAuditLogs] = useState<SettingsApiKeyAuditLogItem[]>([]);
  const [requestLogs, setRequestLogs] = useState<
    SettingsApiKeyRequestLogItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncApiKeysSearch = useCallback(
    (next: { typeTab: ApiKeyTypeTab; panelView: ApiKeysSettingsPanel }) => {
      void navigate({
        to: "/settings/$tab",
        params: { tab: "api" },
        search: {
          type: next.typeTab,
          ...(next.panelView === "logs" ? { panel: "logs" as const } : {}),
        },
        replace: true,
      });
    },
    [navigate],
  );

  // Keep the address bar in sync so deep links like ?type=agent work and
  // bare /settings/api still shows an explicit type.
  useEffect(() => {
    const params = new URLSearchParams(
      searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
    );
    const typeOk = isApiKeyTypeTab(params.get("type"));
    const panelRaw = params.get("panel");
    const panelOk = panelRaw == null || isApiKeysSettingsPanel(panelRaw);
    if (typeOk && panelOk) return;
    syncApiKeysSearch({ typeTab, panelView });
  }, [panelView, searchStr, syncApiKeysSearch, typeTab]);

  const agentWebhookByApiKeyId = useMemo(() => {
    const map = new Map<string, AgentWebhookSettings>();
    // Index = display order so webhook edits that return sortOrder 0 cannot
    // reshuffle the Agent tab (table sorts by this field).
    for (const [index, agent] of sortAgentsForDisplay(agents).entries()) {
      if (!agent.apiKeyId) continue;
      map.set(agent.apiKeyId, {
        ...toAgentWebhookSettings(agent),
        sortOrder: index,
      });
    }
    return map;
  }, [agents]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    // Local-core keys must not wait on the agents door — a hung
    // agent.backsteros.com / __cloud_core__ fetch used to leave this tab on
    // “Loading keys…” forever.
    try {
      const [keysBody, auditBody, requestBody] = await Promise.all([
        client.requestJson<{ apiKeys: ApiKey[] }>("/api/v1/api-keys"),
        client.requestJson<{ auditLogs: ApiKeyAuditLog[] }>(
          "/api/v1/api-keys/audit-logs?limit=100",
        ),
        client.requestJson<{ requestLogs: ApiKeyRequestLog[] }>(
          "/api/v1/api-keys/request-logs?limit=200",
        ),
      ]);
      setApiKeys(keysBody.apiKeys.map(toSettingsApiKey));
      setAuditLogs(auditBody.auditLogs.map(toSettingsAuditLog));
      setRequestLogs(requestBody.requestLogs.map(toSettingsRequestLog));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load API keys",
      );
      setLoading(false);
      return;
    }
    setLoading(false);

    let timeoutId: number | undefined;
    try {
      const agentsBody = await Promise.race([
        cloudCoreRequestJson<{ agents: Agent[] }>("/api/v1/agents"),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(
              new Error(
                "Cloud agents timed out (agent.backsteros.com). Keys still loaded from local-core.",
              ),
            );
          }, 8_000);
        }),
      ]);
      const ordered = sortAgentsForDisplay(agentsBody.agents);
      setAgents(ordered);
      writeAgentSortOrderIds(ordered.map((agent) => agent.id));
    } catch (error) {
      setAgents([]);
      setErrorMessage(
        cloudSettingsErrorMessage(error, "Could not load cloud agents"),
      );
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
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
        setAgents((current) => {
          const next = current.map((entry) =>
            entry.id === saved.id
              ? {
                  ...saved,
                  // Keep list position — PATCH often returns sortOrder 0.
                  sortOrder: entry.sortOrder ?? saved.sortOrder ?? 0,
                }
              : entry,
          );
          const ordered = sortAgentsForDisplay(next);
          writeAgentSortOrderIds(ordered.map((agent) => agent.id));
          return ordered;
        });
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
        setAgents((current) => {
          const ordered = sortAgentsForDisplay([...current, saved]);
          writeAgentSortOrderIds(ordered.map((agent) => agent.id));
          return ordered;
        });
      }
      // Saving URL/secret is not enough for chat — clear prior Connected state
      // until SettingsTestConnectionSwap succeeds.
      if (saved.id) clearAgentWebhookVerified(saved.id);
      notifyShellAgentRosterChanged();
      return toAgentWebhookSettings({
        ...saved,
        sortOrder: existing?.sortOrder ?? saved.sortOrder ?? 0,
      });
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
    workspaceId: string;
    threadId: string;
    replyUrl: string;
    testId: string;
  }): Promise<AgentWebhookTestResult> {
    const res = await fetch("/__webhook_probe__", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        url: input.webhookUrl,
        secret: input.webhookSecret,
        agentId: input.agentId,
        agentName: input.agentName,
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        replyUrl: input.replyUrl,
        testId: input.testId,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text.trim() || `Probe failed (${res.status})`);
    }
    return (await res.json()) as AgentWebhookTestResult;
  }

  async function waitForAgentReply(
    threadId: string,
    startedAtMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      try {
        const body = await cloudCoreRequestJson<{
          messages: ChatThreadMessage[];
        }>(
          `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
        );
        const reply = body.messages.find((message) => {
          if (message.role !== "assistant") return false;
          const created = Date.parse(message.createdAt);
          return Number.isFinite(created) && created >= startedAtMs - 2_000;
        });
        if (reply) return true;
      } catch {
        // Keep waiting — reply may still land.
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    return false;
  }

  async function testAgentWebhook(
    agentId: string,
    input: {
      webhookUrl: string;
      webhookSecret: string | null;
      agentName: string;
    },
  ): Promise<{ replyReceived: boolean }> {
    const startedAtMs = Date.now();
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
        const thread = await cloudCoreRequestJson<ChatThreadWithMessages>(
          "/api/v1/chat/threads",
          {
            method: "POST",
            body: JSON.stringify({ agentId }),
          },
        );
        const testId = crypto.randomUUID();
        const replyUrl = `https://agent.backsteros.com/api/v1/chat/threads/${encodeURIComponent(thread.id)}/messages`;
        result = await probeWebhookViaVite({
          agentId,
          webhookUrl: input.webhookUrl,
          webhookSecret: input.webhookSecret.trim(),
          agentName: input.agentName,
          workspaceId: thread.workspaceId,
          threadId: thread.id,
          replyUrl,
          testId,
        });
      } else if (missingOnCloud) {
        throw new Error(
          "Re-save the webhook secret, then click Test (cloud test route is not deployed yet).",
          { cause: error },
        );
      } else {
        throw new Error(
          cloudSettingsErrorMessage(error, "Webhook test failed"),
          { cause: error },
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

    const threadId = result.threadId?.trim() || null;
    if (!threadId) return { replyReceived: false };
    const replyReceived = await waitForAgentReply(threadId, startedAtMs);
    if (replyReceived) notifyShellAgentRosterChanged();
    return { replyReceived };
  }

  async function reorderAgentKeys(orderedApiKeyIds: string[]): Promise<void> {
    // Commit table order locally first so the drag preview can clear without
    // snapping back (many Agent-tab keys have no cloud agent row yet).
    writeAgentApiKeySortOrderIds(orderedApiKeyIds);
    setAgentKeyOrderIds(orderedApiKeyIds);

    const agentIds: string[] = [];
    const seen = new Set<string>();
    for (const apiKeyId of orderedApiKeyIds) {
      const linked = agents.find((agent) => agent.apiKeyId === apiKeyId);
      if (!linked || seen.has(linked.id)) continue;
      seen.add(linked.id);
      agentIds.push(linked.id);
    }
    for (const agent of agents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      agentIds.push(agent.id);
    }

    if (agentIds.length > 0) {
      writeAgentSortOrderIds(agentIds);
      setAgents((current) =>
        sortAgentsForDisplay(
          current.map((agent) => {
            const index = agentIds.indexOf(agent.id);
            return index >= 0 ? { ...agent, sortOrder: index } : agent;
          }),
          agentIds,
        ),
      );
      notifyShellAgentRosterChanged();
    }

    if (agentIds.length === 0) return;

    // Cloud sync in the background — do not block the table on the door.
    void cloudCoreRequestJson<{ agents: Agent[] }>("/api/v1/agents/reorder", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentIds }),
    })
      .then((body) => {
        const ordered = sortAgentsForDisplay(body.agents);
        setAgents(ordered);
        writeAgentSortOrderIds(ordered.map((agent) => agent.id));
        notifyShellAgentRosterChanged();
      })
      .catch(() => {
        // localStorage + optimistic state keep order until cloud migrates.
      });
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
      typeTab={typeTab}
      panelView={panelView}
      onTypeTabChange={(next) =>
        syncApiKeysSearch({ typeTab: next, panelView: "keys" })
      }
      onPanelViewChange={(next) =>
        syncApiKeysSearch({ typeTab, panelView: next })
      }
      agentWebhookByApiKeyId={agentWebhookByApiKeyId}
      onSaveAgentWebhook={saveAgentWebhook}
      onTestAgentWebhook={testAgentWebhook}
      onReorderAgentKeys={reorderAgentKeys}
      agentKeyOrderIds={agentKeyOrderIds}
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
