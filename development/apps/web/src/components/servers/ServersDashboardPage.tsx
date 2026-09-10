import { Link, useNavigate } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon, ServerIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { DeploymentsList } from "./DeploymentListRow";
import { fetchHetznerSites, type DiscoveredDeployment, type DiscoveredSite } from "./hetznerApi";
import { NewServerDialog } from "./NewServerDialog";
import { listStaticServerProfiles, type StaticServerProfile } from "./staticServerProfiles";

function SectionCard({ children }: { readonly children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40 divide-y divide-border/60">
      {children}
    </div>
  );
}

function SiteGlyph({ accent, initial }: { readonly accent: string; readonly initial: string }) {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
      style={{ backgroundColor: accent }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function appKeyFromService(serviceName: string): string {
  return serviceName.replace(/-web$/u, "");
}

function resolveSiteForDeployment(
  deployment: DiscoveredDeployment,
  sites: readonly DiscoveredSite[],
): DiscoveredSite | null {
  return (
    sites.find(
      (site) =>
        site.serverId === deployment.serverId &&
        (site.domain === deployment.siteDomain ||
          site.service === deployment.appName ||
          appKeyFromService(site.service) === deployment.appName),
    ) ??
    sites.find((site) => site.domain === deployment.siteDomain) ??
    null
  );
}

function SiteRow({ site }: { readonly site: DiscoveredSite }) {
  const navigate = useNavigate();
  const meta = [site.repository, site.runtime, site.serverName].filter(Boolean).join(" · ");
  const hostsExtra =
    site.hosts.length > 1
      ? ` +${site.hosts.length - 1} host${site.hosts.length === 2 ? "" : "s"}`
      : "";
  return (
    <div
      role="link"
      tabIndex={0}
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
      onClick={() => {
        void navigate({
          to: "/servers/$serverId/apps/$service",
          params: { serverId: String(site.serverId), service: site.service },
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void navigate({
            to: "/servers/$serverId/apps/$service",
            params: { serverId: String(site.serverId), service: site.service },
          });
        }
      }}
    >
      <SiteGlyph accent={site.accent} initial={site.initial} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {site.domain}
          {hostsExtra ? (
            <span className="font-normal text-muted-foreground">{hostsExtra}</span>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {site.deployedLabel}
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="shrink-0 text-muted-foreground"
        aria-label={`Actions for ${site.domain}`}
        disabled
        onClick={(event) => event.stopPropagation()}
      >
        <EllipsisIcon className="size-4" />
      </Button>
    </div>
  );
}

function DashboardServerRow({ server }: { readonly server: StaticServerProfile }) {
  const meta = [server.networking.publicIp, server.role, server.details.os].join(" · ");
  const stats = `${server.apps.length} app${server.apps.length === 1 ? "" : "s"}`;

  return (
    <Link
      to="/servers/$serverId"
      params={{ serverId: server.id }}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-white"
        style={{ backgroundColor: server.accent }}
        aria-hidden
      >
        <ServerIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{server.name}</div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">{stats}</div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="shrink-0 text-muted-foreground"
        aria-label={`Actions for ${server.name}`}
        disabled
        onClick={(event) => event.preventDefault()}
      >
        <EllipsisIcon className="size-4" />
      </Button>
    </Link>
  );
}

/**
 * Servers dashboard overview — apps + deploy history.
 * Full server list lives under Servers nav (/servers/servers).
 */
export function ServersDashboardPage() {
  const navigate = useNavigate();
  const servers = listStaticServerProfiles();
  const [sites, setSites] = useState<readonly DiscoveredSite[]>([]);
  const [deployments, setDeployments] = useState<readonly DiscoveredDeployment[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [newServerOpen, setNewServerOpen] = useState(false);
  const [createdNotice, setCreatedNotice] = useState<{
    readonly name: string;
    readonly rootPassword: string | null;
  } | null>(null);

  const refreshSites = useCallback(async () => {
    setLoadingSites(true);
    setSitesError(null);
    try {
      const data = await fetchHetznerSites();
      if (!data.ok && data.error) {
        setSitesError(data.error);
        setSites([]);
        setDeployments([]);
        return;
      }
      setSites(data.sites ?? []);
      setDeployments(data.deployments ?? []);
      if ((data.sites?.length ?? 0) === 0 && (data.errors?.length ?? 0) > 0) {
        setSitesError(
          data
            .errors!.map((entry) => {
              const message = entry.message.includes("\n")
                ? (entry.message.split("\n").find((line) => line.trim()) ?? entry.message)
                : entry.message;
              return `${entry.serverName}: ${message}`;
            })
            .join(" · "),
        );
      }
    } catch (error) {
      setSitesError(error instanceof Error ? error.message : "Failed to load Kamal apps");
      setSites([]);
      setDeployments([]);
    } finally {
      setLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    void refreshSites();
  }, [refreshSites]);

  const recentSites = useMemo(() => {
    const latestDeployMs = new Map<string, number>();
    for (const deployment of deployments) {
      const at = Date.parse(deployment.at);
      if (!Number.isFinite(at)) continue;
      for (const key of [
        deployment.siteDomain,
        deployment.appName,
        `${deployment.serverId}:${deployment.appName}`,
      ]) {
        if (!key) continue;
        const prev = latestDeployMs.get(key) ?? 0;
        if (at > prev) latestDeployMs.set(key, at);
      }
    }

    const rank = (site: DiscoveredSite): number => {
      const appKey = site.service.endsWith("-web") ? site.service.slice(0, -4) : site.service;
      return Math.max(
        latestDeployMs.get(site.domain) ?? 0,
        latestDeployMs.get(site.service) ?? 0,
        latestDeployMs.get(appKey) ?? 0,
        latestDeployMs.get(`${site.serverId}:${appKey}`) ?? 0,
        latestDeployMs.get(`${site.serverId}:${site.service}`) ?? 0,
      );
    };

    return [...sites]
      .sort((a, b) => {
        const delta = rank(b) - rank(a);
        if (delta !== 0) return delta;
        return a.domain.localeCompare(b.domain);
      })
      .slice(0, 5);
  }, [deployments, sites]);

  const recentDeployments = useMemo(() => deployments.slice(0, 5), [deployments]);

  function openDeployment(entry: DiscoveredDeployment) {
    const site = resolveSiteForDeployment(entry, sites);
    if (!site) {
      void navigate({
        to: "/servers/$serverId",
        params: { serverId: String(entry.serverId) },
        search: { tab: "apps" },
      });
      return;
    }
    void navigate({
      to: "/servers/$serverId/apps/$service",
      params: { serverId: String(site.serverId), service: site.service },
      search: { tab: "overview", deploymentId: entry.id },
      state: { deployment: entry, site },
    });
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <WorkspacePageContainer width="expanded" className="gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Overview of apps and recent deploy activity.
              </p>
            </div>
            <Button
              type="button"
              className="shrink-0 gap-1.5"
              onClick={() => setNewServerOpen(true)}
            >
              <PlusIcon className="size-4" />
              New server
            </Button>
          </div>

          {createdNotice ? (
            <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Created {createdNotice.name}</p>
              {createdNotice.rootPassword ? (
                <p className="mt-1 text-muted-foreground">
                  Root password (shown once):{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {createdNotice.rootPassword}
                  </code>
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  No root password returned — use your selected SSH key.
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setCreatedNotice(null)}
              >
                Dismiss
              </Button>
            </div>
          ) : null}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Recent servers</h3>
            <SectionCard>
              {servers.map((server) => (
                <DashboardServerRow key={server.id} server={server} />
              ))}
            </SectionCard>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Recent Apps</h3>
            <SectionCard>
              {loadingSites ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Discovering Kamal apps over SSH…
                </div>
              ) : sitesError && sites.length === 0 ? (
                <div className="px-4 py-6 text-sm text-destructive">{sitesError}</div>
              ) : recentSites.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No Kamal apps found on your Hetzner servers.
                </div>
              ) : (
                recentSites.map((site) => <SiteRow key={site.id} site={site} />)
              )}
            </SectionCard>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Deployments</h3>
            <SectionCard>
              {loadingSites ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Loading Kamal deploy history…
                </div>
              ) : recentDeployments.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No Kamal deployments found in audit logs yet.
                </div>
              ) : (
                <DeploymentsList
                  deployments={recentDeployments}
                  showSite
                  onSelect={openDeployment}
                />
              )}
            </SectionCard>
          </section>
        </WorkspacePageContainer>
      </ScrollArea>

      <NewServerDialog
        open={newServerOpen}
        onOpenChange={setNewServerOpen}
        onCreated={(server, rootPassword) => {
          setCreatedNotice({ name: server.name, rootPassword });
          void refreshSites();
        }}
      />
    </>
  );
}
