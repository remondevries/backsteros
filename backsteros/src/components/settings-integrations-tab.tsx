import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type {
  AgentMailSettings,
  AgentMailTestConnectionResult,
  AutoReviewWebhookSettings,
  BrandfetchSettings,
  BrandfetchTestConnectionResult,
  ChatwootSettings,
  ChatwootTestConnectionResult,
  CloudflareSettings,
  CloudflareTestConnectionResult,
  CursorSettings,
  CursorTestConnectionResult,
  GithubSettings,
  GithubTestConnectionResult,
  GoogleCalendarSettings,
  GoogleCalendarTestConnectionResult,
  MapboxSettings,
  MapboxTestConnectionResult,
  MoneybirdSettings,
  MoneybirdTestConnectionResult,
  SocialSettings,
  SocialTestConnectionResult,
  TransipSettings,
  TransipTestConnectionResult,
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
import { SettingsGoogleCalendarTab } from "./settings-google-calendar-tab";
import { SettingsBrandfetchTab } from "./settings-brandfetch-tab";
import { SettingsChatwootTab } from "./settings-chatwoot-tab";
import { SettingsMapboxTab } from "./settings-mapbox-tab";
import { SettingsMoneybirdTab } from "./settings-moneybird-tab";
import { SettingsSocialTab } from "./settings-social-tab";
import { SettingsTransipTab } from "./settings-transip-tab";
import { SettingsWhoopTab } from "./settings-whoop-tab";
import { SettingsAutoReviewWebhookTab } from "./settings-auto-review-webhook-tab";

type IntegrationStatus = {
  configured: boolean;
  /** Live probe result (Test connection). False until a probe succeeds. */
  connected: boolean;
  checking?: boolean;
};

type ProbeResult = { ok: boolean };

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

    const publish = () => {
      setStatuses({ ...next });
    };

    const loadConfigured = async <T,>(
      id: WorkspaceIntegrationId,
      loader: () => Promise<T>,
      pickConfigured: (body: T) => boolean,
      /** When false, skip the live probe (e.g. missing credentials). */
      canProbe?: (body: T) => boolean,
    ): Promise<{ configured: boolean; probe: boolean }> => {
      try {
        const body = await loader();
        const configured = pickConfigured(body);
        const probe = configured && (canProbe?.(body) ?? true);
        next[id] = {
          configured,
          connected: false,
          checking: probe,
        };
        return { configured, probe };
      } catch {
        next[id] = EMPTY_STATUS;
        return { configured: false, probe: false };
      }
    };

    const probeLive = async (
      id: WorkspaceIntegrationId,
      test: () => Promise<ProbeResult>,
    ) => {
      const current = next[id] ?? EMPTY_STATUS;
      if (!current.checking) return;
      try {
        const result = await test();
        next[id] = {
          configured: current.configured,
          connected: Boolean(result.ok),
        };
      } catch {
        next[id] = {
          configured: current.configured,
          connected: false,
        };
      }
      publish();
    };

    // 1) Load settings (fast) — show Checking… only where a probe will run.
    const [
      cursor,
      github,
      transip,
      cloudflare,
      moneybird,
      mapbox,
      brandfetch,
      chatwoot,
      googleCalendar,
      email,
      social,
    ] = await Promise.all([
      loadConfigured(
        "cursor",
        () => client.requestJson<CursorSettings>("/api/v1/settings/cursor"),
        (body) => body.apiKeyConfigured,
      ),
      loadConfigured(
        "github",
        () => client.requestJson<GithubSettings>("/api/v1/settings/github"),
        (body) => body.apiTokenConfigured || body.envTokenConfigured,
      ),
      loadConfigured(
        "transip",
        () => client.requestJson<TransipSettings>("/api/v1/settings/transip"),
        (body) =>
          body.keyConfigured ||
          body.apiTokenConfigured ||
          body.envKeyConfigured ||
          body.envTokenConfigured,
      ),
      loadConfigured(
        "cloudflare",
        () =>
          client.requestJson<CloudflareSettings>("/api/v1/settings/cloudflare"),
        (body) => body.apiTokenConfigured || body.envTokenConfigured,
      ),
      loadConfigured(
        "moneybird",
        () =>
          client.requestJson<MoneybirdSettings>("/api/v1/settings/moneybird"),
        (body) => body.apiTokenConfigured,
      ),
      loadConfigured(
        "mapbox",
        () => client.requestJson<MapboxSettings>("/api/v1/settings/mapbox"),
        (body) => body.accessTokenConfigured,
      ),
      loadConfigured(
        "brandfetch",
        () =>
          client.requestJson<BrandfetchSettings>(
            "/api/v1/settings/brandfetch",
          ),
        (body) => body.apiKeyConfigured || body.envKeyConfigured,
      ),
      loadConfigured(
        "chatwoot",
        () =>
          client.requestJson<ChatwootSettings>("/api/v1/settings/chatwoot"),
        (body) =>
          Boolean(body.baseUrl && body.accountId && body.apiTokenConfigured),
      ),
      loadConfigured(
        "google-calendar",
        () =>
          client.requestJson<GoogleCalendarSettings>(
            "/api/v1/settings/google-calendar",
          ),
        (body) => body.clientIdConfigured && body.clientSecretConfigured,
        // OAuth refresh token required for a real Calendar probe.
        (body) => body.connected,
      ),
      loadConfigured(
        "email",
        () =>
          client.requestJson<AgentMailSettings>("/api/v1/settings/agentmail"),
        (body) => body.apiKeyConfigured,
      ),
      loadConfigured(
        "social",
        () => client.requestJson<SocialSettings>("/api/v1/settings/social"),
        (body) => body.apiKeyConfigured,
      ),
      // Whoop has no provider /test route — token presence in totem.env is the check.
      (async () => {
        try {
          const body = await fetchWhoopSettingsStatus();
          next.whoop = {
            configured: body.configured,
            connected: body.connected,
          };
        } catch {
          next.whoop = EMPTY_STATUS;
        }
      })(),
      // Auto-review /test POSTs a webhook (side effect) — don't fire from the grid.
      (async () => {
        try {
          const body =
            await client.requestJson<AutoReviewWebhookSettings>(
              "/api/v1/settings/auto-review-webhook",
            );
          const ready = Boolean(
            body.enabled && body.url && body.secretConfigured,
          );
          next["auto-review"] = {
            configured: Boolean(body.url && body.secretConfigured),
            connected: ready,
          };
        } catch {
          next["auto-review"] = EMPTY_STATUS;
        }
      })(),
    ]);

    publish();
    setStatusesLoading(false);

    // 2) Live probes in parallel — same endpoints as each Settings "Test" button.
    await Promise.all([
      cursor.probe
        ? probeLive("cursor", () =>
            client.requestJson<CursorTestConnectionResult>(
              "/api/v1/settings/cursor/test",
            ),
          )
        : null,
      github.probe
        ? probeLive("github", () =>
            client.requestJson<GithubTestConnectionResult>(
              "/api/v1/settings/github/test",
            ),
          )
        : null,
      transip.probe
        ? probeLive("transip", () =>
            client.requestJson<TransipTestConnectionResult>(
              "/api/v1/settings/transip/test",
            ),
          )
        : null,
      cloudflare.probe
        ? probeLive("cloudflare", () =>
            client.requestJson<CloudflareTestConnectionResult>(
              "/api/v1/settings/cloudflare/test",
            ),
          )
        : null,
      moneybird.probe
        ? probeLive("moneybird", () =>
            client.requestJson<MoneybirdTestConnectionResult>(
              "/api/v1/settings/moneybird/test",
            ),
          )
        : null,
      mapbox.probe
        ? probeLive("mapbox", () =>
            client.requestJson<MapboxTestConnectionResult>(
              "/api/v1/settings/mapbox/test",
            ),
          )
        : null,
      brandfetch.probe
        ? probeLive("brandfetch", () =>
            client.requestJson<BrandfetchTestConnectionResult>(
              "/api/v1/settings/brandfetch/test",
            ),
          )
        : null,
      chatwoot.probe
        ? probeLive("chatwoot", () =>
            client.requestJson<ChatwootTestConnectionResult>(
              "/api/v1/settings/chatwoot/test",
            ),
          )
        : null,
      googleCalendar.probe
        ? probeLive("google-calendar", () =>
            client.requestJson<GoogleCalendarTestConnectionResult>(
              "/api/v1/settings/google-calendar/test",
            ),
          )
        : null,
      email.probe
        ? probeLive("email", () =>
            client.requestJson<AgentMailTestConnectionResult>(
              "/api/v1/settings/agentmail/test",
            ),
          )
        : null,
      social.probe
        ? probeLive("social", () =>
            client.requestJson<SocialTestConnectionResult>(
              "/api/v1/settings/social/test",
            ),
          )
        : null,
    ]);
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
          statusChecking: Boolean(status?.checking),
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
  }, [clearOpenSearch]);

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
        integrationId={activeId}
        faviconHost={activeMeta?.faviconHost}
        onClose={closeModal}
        onSave={closeModal}
        saveLabel="Save"
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
        {activeId === "brandfetch" && activeMeta ? (
          <SettingsBrandfetchTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "chatwoot" && activeMeta ? (
          <SettingsChatwootTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
        {activeId === "google-calendar" && activeMeta ? (
          <SettingsGoogleCalendarTab
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
        {activeId === "social" && activeMeta ? (
          <SettingsSocialTab
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
        {activeId === "auto-review" && activeMeta ? (
          <SettingsAutoReviewWebhookTab
            title={activeMeta.title}
            description={activeMeta.description}
            hideHeader
          />
        ) : null}
      </IntegrationSettingsModal>
    </>
  );
}
