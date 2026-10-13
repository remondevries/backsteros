import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowUpRightIcon, CopyIcon, EllipsisIcon, GlobeIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer, WorkspacePageFrame } from "../WorkspacePageContainer";
import { AppCommandsTab } from "./AppCommandsTab";
import { AppDomainsTab } from "./AppDomainsTab";
import { AppNetworkTab, type NetworkSectionId } from "./AppNetworkTab";
import { AppProjectLinkDetailsRow } from "./AppProjectLinkDetailsRow";
import { AppSettingsTab, type SettingsSectionId } from "./AppSettingsTab";
import { DeploymentDetailsView } from "./DeploymentDetailsView";
import { DeploymentsList } from "./DeploymentListRow";
import {
  deleteHetznerSite,
  fetchAppSettings,
  fetchHetznerSites,
  fetchServerProcessUsers,
  fetchWordpressComponents,
  peekHetznerSitesCache,
  type DiscoveredDeployment,
  type DiscoveredSite,
} from "./hetznerApi";
import { wordpressJobsToDeployments } from "./wordpressDeployments";
import { ServerObserveTab, type ObserveSectionId } from "./ServerObserveTab";
import {
  BackgroundProcessesPanel,
  SchedulerPanel,
  ServerProcessesTab,
  type ProcessesSectionId,
} from "./ServerProcessesTab";
import { resolveStaticServerProfile, type StaticServerProfile } from "./staticServerProfiles";

export type AppDeploymentNavState = {
  readonly deployment?: DiscoveredDeployment | undefined;
  readonly site?: DiscoveredSite | undefined;
};

declare module "@tanstack/react-router" {
  interface HistoryState {
    readonly deployment?: DiscoveredDeployment | undefined;
    readonly site?: DiscoveredSite | undefined;
  }
}

type SiteAppearance = {
  readonly accent: string;
  readonly initial: string;
  readonly avatarDataUrl: string | null;
};

export type AppDetailTabId =
  | "overview"
  | "processes"
  | "commands"
  | "network"
  | "observe"
  | "domains"
  | "settings";

export function isAppDetailTabId(value: unknown): value is AppDetailTabId {
  return (
    value === "overview" ||
    value === "processes" ||
    value === "commands" ||
    value === "network" ||
    value === "observe" ||
    value === "domains" ||
    value === "settings"
  );
}

const APP_NAV = [
  { id: "overview", label: "Overview" },
  { id: "processes", label: "Processes" },
  { id: "commands", label: "Commands" },
  { id: "network", label: "Network" },
  { id: "observe", label: "Observe" },
  { id: "domains", label: "Domains" },
  { id: "settings", label: "Settings" },
] as const;

function appKeyFromService(serviceName: string): string {
  return serviceName.replace(/-web$/u, "");
}

function matchSiteFromPayload(
  data: {
    readonly sites?: readonly DiscoveredSite[];
  },
  serverId: string,
  service: string,
): DiscoveredSite | null {
  const numericId = Number(serverId);
  const decodedService = decodeURIComponent(service);
  return (
    (data.sites ?? []).find(
      (entry) =>
        (entry.service === service || entry.service === decodedService) &&
        (entry.serverId === numericId || String(entry.serverId) === serverId),
    ) ?? null
  );
}

function kamalDeploymentsForSite(
  data: { readonly deployments?: readonly DiscoveredDeployment[] },
  matched: DiscoveredSite,
  serverId: string,
): DiscoveredDeployment[] {
  const key = appKeyFromService(matched.service);
  return (data.deployments ?? []).filter(
    (entry) =>
      (entry.serverId === matched.serverId || String(entry.serverId) === serverId) &&
      (entry.appName === key ||
        entry.appName === matched.service ||
        entry.siteDomain === matched.domain),
  );
}

function AppGlyph({
  accent,
  initial,
  avatarDataUrl,
  size = "md",
}: {
  readonly accent: string;
  readonly initial: string;
  readonly avatarDataUrl?: string | null;
  readonly size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-semibold text-white",
        size === "lg" ? "size-12 text-lg" : "size-9 text-sm",
      )}
      style={{ backgroundColor: accent }}
      aria-hidden
    >
      {avatarDataUrl ? (
        <img src={avatarDataUrl} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

function SectionShell({
  title,
  empty,
  action,
  children,
}: {
  readonly title: string;
  readonly empty?: string | undefined;
  readonly action?: ReactNode;
  readonly children?: ReactNode | undefined;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        {children ??
          (empty ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</div>
          ) : null)}
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right text-foreground">{value}</span>
    </div>
  );
}

function AppDetailNav({
  serverId,
  service,
  activeId,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly activeId: AppDetailTabId;
}) {
  return (
    <nav aria-label="App" className="border-b border-border/60">
      <WorkspacePageFrame
        width="expanded"
        className="flex min-w-0 items-center gap-5 overflow-x-auto"
      >
        {APP_NAV.map((item) => {
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to="/servers/$serverId/apps/$service"
              params={{ serverId, service }}
              search={{ tab: item.id }}
              className={cn(
                "relative shrink-0 py-2.5 text-sm transition-colors",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground"
                />
              ) : null}
            </Link>
          );
        })}
      </WorkspacePageFrame>
    </nav>
  );
}

function DeploymentsSection({
  deployments,
  emptyLabel = "No deployments found yet",
  onSelect,
}: {
  readonly deployments: readonly DiscoveredDeployment[];
  readonly emptyLabel?: string;
  readonly onSelect?: ((entry: DiscoveredDeployment) => void) | undefined;
}) {
  if (deployments.length === 0) {
    return <SectionShell title="Deployments" empty={emptyLabel} />;
  }

  return (
    <SectionShell title="Deployments">
      <DeploymentsList deployments={deployments} onSelect={onSelect} />
    </SectionShell>
  );
}

function ActivitySection({
  deployments,
}: {
  readonly deployments: readonly DiscoveredDeployment[];
}) {
  if (deployments.length === 0) {
    return <SectionShell title="Activity" empty="No recent activity" />;
  }

  return (
    <SectionShell title="Activity">
      <div className="divide-y divide-border/60">
        {deployments.slice(0, 12).map((entry) => (
          <div key={`activity-${entry.id}`} className="flex items-start gap-3 px-4 py-3">
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#3d9a6a]/15 text-[#3d9a6a]"
              aria-hidden
            >
              <ArrowUpRightIcon className="size-3.5" />
            </span>
            <div className="min-w-0 text-sm text-foreground">
              {entry.summary}
              <span className="text-muted-foreground">
                {" "}
                · {entry.meta}
                {entry.actor ? ` by ${entry.actor}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function AppOverview({
  site,
  deployments,
  profile,
  users,
  isWordpress,
  onSelectDeployment,
}: {
  readonly site: DiscoveredSite;
  readonly deployments: readonly DiscoveredDeployment[];
  readonly profile: StaticServerProfile;
  readonly users: readonly string[];
  readonly isWordpress: boolean;
  readonly onSelectDeployment: (entry: DiscoveredDeployment) => void;
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <DeploymentsSection
          deployments={deployments}
          onSelect={onSelectDeployment}
          emptyLabel={
            isWordpress
              ? "No component deploys yet — use Settings → Deployments"
              : "No deployments found yet"
          }
        />
        <BackgroundProcessesPanel
          profile={profile}
          users={users}
          service={site.service}
          variant="section"
        />
        <SchedulerPanel profile={profile} users={users} service={site.service} variant="section" />
        <ActivitySection deployments={deployments} />
      </div>

      <aside className="min-w-0">
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
          <h3 className="border-b border-border/60 px-4 py-3 text-sm font-medium text-muted-foreground">
            Details
          </h3>
          <div className="divide-y divide-border/60">
            <AppProjectLinkDetailsRow serverId={String(site.serverId)} service={site.service} />
            <DetailRow label="Server ID" value={String(site.serverId)} />
            <DetailRow label="Service" value={site.service} />
            <DetailRow label="Site ID" value={site.id} />
            <DetailRow label="Runtime" value={site.runtime || "—"} />
            <DetailRow label="Image" value={site.image ?? "—"} />
            <DetailRow label="Repository" value={site.repository ?? "—"} />
            <DetailRow label="Version" value={site.version ?? "—"} />
            <DetailRow label="Status" value={site.status} />
            <DetailRow label="TLS" value={site.tls ? "Enabled" : "Disabled"} />
            <DetailRow label="Public IP" value={site.serverIp} />
            <DetailRow label="Hosts" value={site.hosts.join(", ")} />
          </div>
        </section>
      </aside>
    </div>
  );
}

function PlaceholderTab({ label }: { readonly label: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
      {label} for this app is not wired yet.
    </div>
  );
}

export function AppDetailPage({
  serverId,
  service,
  tab = "overview",
  observeSection = "monitoring",
  processesSection = "background",
  networkSection = "security",
  settingsSection = "general",
  commandId = null,
  deploymentId = null,
}: {
  readonly serverId: string;
  readonly service: string;
  readonly tab?: AppDetailTabId;
  readonly observeSection?: ObserveSectionId;
  readonly processesSection?: ProcessesSectionId;
  readonly networkSection?: NetworkSectionId;
  readonly settingsSection?: SettingsSectionId;
  readonly commandId?: string | null;
  readonly deploymentId?: string | null;
}) {
  const navigate = useNavigate();
  const server = resolveStaticServerProfile(serverId);
  const navState = useRouterState({
    select: (state) => state.location.state as AppDeploymentNavState | undefined,
  });
  const seededSite =
    navState?.site &&
    (String(navState.site.serverId) === serverId || navState.site.serverId === Number(serverId)) &&
    (navState.site.service === service || navState.site.service === decodeURIComponent(service))
      ? navState.site
      : null;
  const cachedPayload = peekHetznerSitesCache();
  const cachedSite = cachedPayload ? matchSiteFromPayload(cachedPayload, serverId, service) : null;
  const initialSite = seededSite ?? cachedSite;
  const initialDeployments =
    initialSite && cachedPayload
      ? kamalDeploymentsForSite(cachedPayload, initialSite, serverId)
      : navState?.deployment
        ? [navState.deployment]
        : [];

  const [site, setSite] = useState<DiscoveredSite | null>(initialSite);
  const [deployments, setDeployments] =
    useState<readonly DiscoveredDeployment[]>(initialDeployments);
  const [deploymentSeed, setDeploymentSeed] = useState<DiscoveredDeployment | null>(
    navState?.deployment &&
      (!deploymentId ||
        navState.deployment.id === deploymentId ||
        navState.deployment.id === decodeURIComponent(deploymentId ?? ""))
      ? navState.deployment
      : null,
  );
  const [isWordpress, setIsWordpress] = useState(false);
  const [loading, setLoading] = useState(!initialSite);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [users, setUsers] = useState<readonly string[]>(["root", "deploy", "www-data"]);
  const [appearance, setAppearance] = useState<SiteAppearance | null>(null);

  useEffect(() => {
    void fetchServerProcessUsers(serverId).then((data) => {
      if (data.users?.length) setUsers(data.users);
    });
  }, [serverId]);

  useEffect(() => {
    if (!site) {
      setAppearance(null);
      return;
    }
    let cancelled = false;
    void fetchAppSettings(serverId, site.service).then((data) => {
      if (cancelled || !data.ok || !data.settings) return;
      setAppearance({
        accent: data.settings.accent ?? site.accent,
        initial: data.settings.initial || site.initial,
        avatarDataUrl: data.settings.avatarDataUrl,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [serverId, site]);

  const refresh = useCallback(async () => {
    const soft =
      Boolean(seededSite) ||
      Boolean(cachedSite) ||
      Boolean(deploymentSeed) ||
      Boolean(matchSiteFromPayload(peekHetznerSitesCache() ?? {}, serverId, service));
    if (!soft) setLoading(true);
    setError(null);
    try {
      const data = await fetchHetznerSites();
      if (!data.ok && data.error) {
        setError(data.error);
        setSite((prev) =>
          prev &&
          prev.service === service &&
          (String(prev.serverId) === serverId || prev.serverId === Number(serverId))
            ? prev
            : null,
        );
        if (!data.sites?.length && !soft) {
          setDeployments([]);
          setIsWordpress(false);
        }
        return;
      }
      const matched = matchSiteFromPayload(data, serverId, service);
      if (!matched) {
        setSite((prev) =>
          prev &&
          (prev.service === service || prev.service === decodeURIComponent(service)) &&
          (String(prev.serverId) === serverId || prev.serverId === Number(serverId))
            ? prev
            : null,
        );
        if (!soft) {
          setDeployments([]);
          setIsWordpress(false);
          setError("App not found on this server");
        }
        return;
      }

      setSite(matched);
      setError(null);

      const settingsData = await fetchAppSettings(serverId, matched.service);
      const wordpress =
        settingsData.ok &&
        (settingsData.settings?.framework === "wordpress" ||
          settingsData.runtime === "wordpress" ||
          settingsData.detectedRuntime === "wordpress");
      setIsWordpress(Boolean(wordpress));

      if (wordpress) {
        const wp = await fetchWordpressComponents(serverId, matched.service);
        if (!wp.ok) {
          setError(wp.error ?? "Failed to load WordPress component deploys");
          return;
        }
        setDeployments(wordpressJobsToDeployments(wp.jobs ?? [], matched));
        return;
      }

      setDeployments(kamalDeploymentsForSite(data, matched, serverId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load app");
      setSite((prev) =>
        prev &&
        prev.service === service &&
        (String(prev.serverId) === serverId || prev.serverId === Number(serverId))
          ? prev
          : null,
      );
      if (!soft) {
        setDeployments([]);
        setIsWordpress(false);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const detailsSite = site ?? seededSite;

  const selectedDeployment = useMemo(() => {
    if (!deploymentId) return null;
    const decoded = decodeURIComponent(deploymentId);
    return (
      deployments.find((entry) => entry.id === deploymentId || entry.id === decoded) ??
      (deploymentSeed && (deploymentSeed.id === deploymentId || deploymentSeed.id === decoded)
        ? deploymentSeed
        : null)
    );
  }, [deploymentId, deploymentSeed, deployments]);

  function openDeployment(entry: DiscoveredDeployment) {
    setDeploymentSeed(entry);
    void navigate({
      to: "/servers/$serverId/apps/$service",
      params: { serverId, service },
      search: {
        tab: "overview",
        deploymentId: entry.id,
      },
      state: {
        deployment: entry,
        site: detailsSite ?? undefined,
      } as AppDeploymentNavState,
    });
  }

  function closeDeployment() {
    setDeploymentSeed(null);
    void navigate({
      to: "/servers/$serverId/apps/$service",
      params: { serverId, service },
      search: { tab: "overview" },
    });
  }

  const displayAccent = appearance?.accent ?? detailsSite?.accent ?? "#7c5cbf";
  const displayInitial = appearance?.initial ?? detailsSite?.initial ?? "?";
  const displayAvatar = appearance?.avatarDataUrl ?? null;

  const repoLabel = useMemo(() => {
    if (!detailsSite) return null;
    const parts = [detailsSite.repository, detailsSite.version].filter(Boolean);
    return parts.length > 0 ? parts.join(":") : detailsSite.service;
  }, [detailsSite]);

  const visitUrl = useMemo(() => {
    if (!detailsSite?.domain) return null;
    const host = detailsSite.domain.replace(/^https?:\/\//u, "");
    return `https://${host}`;
  }, [detailsSite?.domain]);

  async function confirmDelete() {
    if (!detailsSite) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const data = await deleteHetznerSite({
        serverId: String(detailsSite.serverId),
        service: detailsSite.service,
      });
      if (!data.ok) {
        setDeleteError(data.error ?? "Failed to delete app");
        return;
      }
      setPendingDelete(false);
      void navigate({
        to: "/servers/$serverId",
        params: { serverId },
        search: { tab: "apps" },
      });
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Failed to delete app");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <AppDetailNav serverId={serverId} service={service} activeId={tab} />
      <ScrollArea className="min-h-0 flex-1">
        <WorkspacePageContainer width="expanded" className="gap-8 py-8">
          {loading && !detailsSite && !selectedDeployment ? (
            <div className="text-sm text-muted-foreground">Loading app…</div>
          ) : error && !detailsSite && !selectedDeployment ? (
            <div className="space-y-3">
              <div className="text-sm text-destructive">{error}</div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/servers/$serverId",
                    params: { serverId },
                    search: { tab: "apps" },
                  })
                }
              >
                Back to apps
              </Button>
            </div>
          ) : detailsSite || selectedDeployment ? (
            <>
              {tab === "overview" && !selectedDeployment ? (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <AppGlyph
                      accent={displayAccent}
                      initial={displayInitial}
                      avatarDataUrl={displayAvatar}
                      size="lg"
                    />
                    <div className="min-w-0 pt-0.5">
                      <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                        {detailsSite?.domain ?? service}
                      </h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {repoLabel}
                        {server ? ` · ${server.name}` : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {visitUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          window.open(visitUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <GlobeIcon className="size-4" />
                        Visit
                      </Button>
                    ) : null}
                    <Menu>
                      <MenuTrigger
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Actions for ${detailsSite?.domain ?? service}`}
                      >
                        <EllipsisIcon className="size-4" />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem
                          onClick={() => {
                            void writeTextToClipboard(detailsSite?.id ?? service, "app ID");
                          }}
                        >
                          <CopyIcon className="size-4" />
                          Copy ID
                        </MenuItem>
                        <MenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(true);
                          }}
                        >
                          <Trash2Icon className="size-4" />
                          Delete site
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                </div>
              ) : null}

              {tab === "overview" && deploymentId && !selectedDeployment && !loading ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 px-6 py-8">
                  <p className="text-sm text-muted-foreground">
                    That deployment was not found. It may have aged out of the recent job history.
                  </p>
                  <Button type="button" variant="outline" onClick={closeDeployment}>
                    Back to overview
                  </Button>
                </div>
              ) : tab === "overview" && selectedDeployment && detailsSite ? (
                <DeploymentDetailsView
                  entry={selectedDeployment}
                  site={detailsSite}
                  visitUrl={visitUrl}
                  onBack={closeDeployment}
                />
              ) : tab === "overview" && detailsSite && server ? (
                <AppOverview
                  site={detailsSite}
                  deployments={deployments}
                  profile={server}
                  users={users}
                  isWordpress={isWordpress}
                  onSelectDeployment={openDeployment}
                />
              ) : tab === "processes" && server && detailsSite ? (
                <ServerProcessesTab
                  profile={server}
                  section={processesSection}
                  service={detailsSite.service}
                  layout="embedded"
                />
              ) : tab === "observe" && server && detailsSite ? (
                <ServerObserveTab
                  profile={server}
                  section={observeSection}
                  service={detailsSite.service}
                  activityItems={deployments}
                  layout="embedded"
                />
              ) : tab === "domains" && detailsSite ? (
                <AppDomainsTab serverId={serverId} service={detailsSite.service} />
              ) : tab === "commands" && detailsSite ? (
                <AppCommandsTab
                  serverId={serverId}
                  service={detailsSite.service}
                  commandId={commandId}
                />
              ) : tab === "network" && detailsSite ? (
                <AppNetworkTab
                  serverId={serverId}
                  service={detailsSite.service}
                  section={networkSection}
                />
              ) : tab === "settings" && detailsSite ? (
                <AppSettingsTab
                  serverId={serverId}
                  service={detailsSite.service}
                  site={detailsSite}
                  section={settingsSection}
                  onAppearanceChange={(next) => {
                    setAppearance((current) => {
                      if (
                        current &&
                        current.accent === next.accent &&
                        current.initial === next.initial &&
                        current.avatarDataUrl === next.avatarDataUrl
                      ) {
                        return current;
                      }
                      return next;
                    });
                    setSite((current) => {
                      if (!current) return current;
                      if (current.accent === next.accent && current.initial === next.initial) {
                        return current;
                      }
                      return {
                        ...current,
                        accent: next.accent,
                        initial: next.initial,
                      };
                    });
                  }}
                  onDeleteSite={() => {
                    setDeleteError(null);
                    setPendingDelete(true);
                  }}
                />
              ) : (
                <PlaceholderTab label={APP_NAV.find((item) => item.id === tab)?.label ?? tab} />
              )}
            </>
          ) : null}
        </WorkspacePageContainer>
      </ScrollArea>

      <AlertDialog
        open={pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(false);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {detailsSite?.domain}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the app from Kamal Proxy and stops its containers on the server. Docker
              volumes are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="px-6 text-sm text-destructive">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={deleting} />}>
              Cancel
            </AlertDialogClose>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? "Deleting…" : "Delete site"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
