import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type {
  AgentMailSettings,
  CloudflareSettings,
  CursorSettings,
  GithubSettings,
  MapboxSettings,
  MoneybirdSettings,
  TransipSettings,
} from "@backsteros/contracts";
import {
  IntegrationSettingsModal,
  IntegrationsOverviewView,
  INTEGRATION_ENABLED_SETTINGS_KEY,
  WORKSPACE_INTEGRATIONS,
  getWorkspaceIntegrationMeta,
  isIntegrationEnabled,
  isWorkspaceIntegrationId,
  parseIntegrationEnabledMap,
  type IntegrationEnabledMap,
  type IntegrationsOverviewItem,
  type WorkspaceIntegrationId,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { fetchWhoopSettingsStatus } from "../lib/whoop";
import { SettingsCloudflareTab } from "./settings-cloudflare-tab";
import { SettingsCursorTab } from "./settings-cursor-tab";
import { SettingsEmailTab } from "./settings-email-tab";
import { SettingsGithubTab } from "./settings-github-tab";
import { SettingsMapboxTab } from "./settings-mapbox-tab";
import { SettingsMoneybirdTab } from "./settings-moneybird-tab";
import { SettingsTransipTab } from "./settings-transip-tab";
import { SettingsWhoopTab } from "./settings-whoop-tab";

type IntegrationStatus = {
  configured: boolean;
  connected: boolean;
};

const EMPTY_STATUS: IntegrationStatus = {
  configured: false,
  connected: false,
};

export function SettingsIntegrationsTab({
  workspaceSettings,
  onSettingsSaved,
}: {
  workspaceSettings: Record<string, unknown> | undefined;
  onSettingsSaved?: () => void;
}) {
  const { client } = useDesktopApi();
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const [statuses, setStatuses] = useState<
    Partial<Record<WorkspaceIntegrationId, IntegrationStatus>>
  >({});
  const [statusesLoading, setStatusesLoading] = useState(true);
  const [enabledMap, setEnabledMap] = useState<IntegrationEnabledMap>({});
  const [togglingId, setTogglingId] =
    useState<WorkspaceIntegrationId | null>(null);
  const [activeId, setActiveId] = useState<WorkspaceIntegrationId | null>(
    () => {
      if (typeof window === "undefined") return null;
      const open = new URLSearchParams(window.location.search).get("open");
      return open && isWorkspaceIntegrationId(open) ? open : null;
    },
  );

  useEffect(() => {
    setEnabledMap(parseIntegrationEnabledMap(workspaceSettings));
  }, [workspaceSettings]);

  const refreshStatuses = useCallback(async () => {
    setStatusesLoading(true);
    const next: Partial<Record<WorkspaceIntegrationId, IntegrationStatus>> = {};

    const settle = async <T,>(
      id: WorkspaceIntegrationId,
      loader: () => Promise<T>,
      pick: (body: T) => IntegrationStatus,
    ) => {
      try {
        next[id] = pick(await loader());
      } catch {
        next[id] = EMPTY_STATUS;
      }
    };

    await Promise.all([
      settle(
        "cursor",
        () => client.requestJson<CursorSettings>("/api/v1/settings/cursor"),
        (body) => ({
          configured: body.apiKeyConfigured,
          connected: body.apiKeyConfigured,
        }),
      ),
      settle(
        "github",
        () => client.requestJson<GithubSettings>("/api/v1/settings/github"),
        (body) => ({
          configured: body.apiTokenConfigured,
          connected: body.connected,
        }),
      ),
      settle(
        "transip",
        () => client.requestJson<TransipSettings>("/api/v1/settings/transip"),
        (body) => ({
          configured: body.apiTokenConfigured,
          connected: body.connected,
        }),
      ),
      settle(
        "cloudflare",
        () =>
          client.requestJson<CloudflareSettings>("/api/v1/settings/cloudflare"),
        (body) => ({
          configured: body.apiTokenConfigured,
          connected: body.connected,
        }),
      ),
      settle(
        "moneybird",
        () =>
          client.requestJson<MoneybirdSettings>("/api/v1/settings/moneybird"),
        (body) => ({
          configured: body.apiTokenConfigured,
          connected: body.connected,
        }),
      ),
      settle(
        "mapbox",
        () => client.requestJson<MapboxSettings>("/api/v1/settings/mapbox"),
        (body) => ({
          configured: body.accessTokenConfigured,
          connected: body.connected,
        }),
      ),
      settle(
        "email",
        () =>
          client.requestJson<AgentMailSettings>("/api/v1/settings/agentmail"),
        (body) => ({
          configured: body.apiKeyConfigured,
          connected: body.connected,
        }),
      ),
      settle("whoop", () => fetchWhoopSettingsStatus(), (body) => ({
        configured: body.configured,
        connected: body.connected,
      })),
    ]);

    setStatuses(next);
    setStatusesLoading(false);
  }, [client]);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  useEffect(() => {
    const params = new URLSearchParams(
      searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
    );
    const open = params.get("open");
    if (!open || !isWorkspaceIntegrationId(open)) return;
    setActiveId(open);
  }, [searchStr]);

  const clearOpenSearch = useCallback(() => {
    const params = new URLSearchParams(
      searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
    );
    if (!params.has("open")) return;
    void navigate({
      to: "/settings/$tab",
      params: { tab: "integrations" },
      replace: true,
    });
  }, [navigate, searchStr]);

  const items: IntegrationsOverviewItem[] = useMemo(
    () =>
      WORKSPACE_INTEGRATIONS.map((meta) => {
        const status = statuses[meta.id];
        return {
          id: meta.id,
          title: meta.title,
          description: meta.description,
          faviconHost: meta.faviconHost,
          configured: status?.configured ?? false,
          connected: status?.connected ?? false,
          enabled: isIntegrationEnabled(enabledMap, meta.id),
          statusLoading: statusesLoading && !status,
        };
      }),
    [enabledMap, statuses, statusesLoading],
  );

  const onToggleEnabled = useCallback(
    async (id: WorkspaceIntegrationId, enabled: boolean) => {
      const previous = enabledMap;
      const next = { ...previous, [id]: enabled };
      setEnabledMap(next);
      setTogglingId(id);
      try {
        await client.requestJson("/api/v1/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            [INTEGRATION_ENABLED_SETTINGS_KEY]: next,
          }),
        });
        onSettingsSaved?.();
      } catch {
        setEnabledMap(previous);
      } finally {
        setTogglingId(null);
      }
    },
    [client, enabledMap, onSettingsSaved],
  );

  const activeMeta = activeId ? getWorkspaceIntegrationMeta(activeId) : null;

  const closeModal = useCallback(() => {
    setActiveId(null);
    clearOpenSearch();
    void refreshStatuses();
  }, [clearOpenSearch, refreshStatuses]);

  return (
    <>
      <IntegrationsOverviewView
        items={items}
        togglingId={togglingId}
        onToggleEnabled={(id, enabled) => {
          void onToggleEnabled(id, enabled);
        }}
        onOpenSettings={setActiveId}
      />

      <IntegrationSettingsModal
        open={activeId !== null && activeMeta !== null}
        title={activeMeta?.title ?? "Integration"}
        description={activeMeta?.description}
        onClose={closeModal}
      >
        {activeId === "cursor" ? <SettingsCursorTab /> : null}
        {activeId === "github" && activeMeta ? (
          <SettingsGithubTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "transip" && activeMeta ? (
          <SettingsTransipTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "cloudflare" && activeMeta ? (
          <SettingsCloudflareTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "moneybird" && activeMeta ? (
          <SettingsMoneybirdTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "mapbox" && activeMeta ? (
          <SettingsMapboxTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "email" && activeMeta ? (
          <SettingsEmailTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "whoop" && activeMeta ? (
          <SettingsWhoopTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
      </IntegrationSettingsModal>
    </>
  );
}
