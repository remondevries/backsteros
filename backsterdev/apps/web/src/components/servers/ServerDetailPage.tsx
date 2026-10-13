import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CopyIcon,
  EllipsisIcon,
  PlusIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import {
  deleteHetznerSite,
  fetchHetznerServerConnection,
  fetchHetznerSites,
  type DiscoveredDatabase,
  type DiscoveredDeployment,
  type DiscoveredSite,
} from "./hetznerApi";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer, WorkspacePageFrame } from "../WorkspacePageContainer";
import {
  resolveStaticServerProfile,
  SERVER_DETAIL_NAV_ITEMS,
  type ServerDetailTabId,
  type StaticServerProfile,
} from "./staticServerProfiles";
import { ServerStorageTab, type StorageSectionId } from "./ServerStorageTab";
import { ServerRuntimeTab, type RuntimeSectionId } from "./ServerRuntimeTab";
import { ServerObserveTab, type ObserveSectionId } from "./ServerObserveTab";
import { ServerProcessesTab, type ProcessesSectionId } from "./ServerProcessesTab";

function ServerGlyph({
  profile,
  size = "md",
}: {
  readonly profile: StaticServerProfile;
  readonly size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl text-white",
        size === "lg" ? "size-12 text-lg font-semibold" : "size-9 text-sm font-semibold",
      )}
      style={{ backgroundColor: profile.accent }}
      aria-hidden
    >
      {profile.initial}
    </span>
  );
}

function AppGlyph({ accent, initial }: { readonly accent: string; readonly initial: string }) {
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

function SectionShell({
  title,
  children,
  empty,
}: {
  readonly title: string;
  readonly children?: ReactNode | undefined;
  readonly empty?: string | undefined;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled
          aria-label={`Add ${title}`}
        >
          <PlusIcon className="size-4" />
        </Button>
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
      <span className="min-w-0 text-right text-foreground">{value}</span>
    </div>
  );
}

function ServerDetailNav({
  serverId,
  activeId,
}: {
  readonly serverId: string;
  readonly activeId: ServerDetailTabId;
}) {
  return (
    <nav aria-label="Server" className="border-b border-border/60">
      <WorkspacePageFrame
        width="expanded"
        className="flex min-w-0 items-center gap-5 overflow-x-auto"
      >
        {SERVER_DETAIL_NAV_ITEMS.map((item) => {
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to="/servers/$serverId"
              params={{ serverId }}
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

type ConnectionState =
  | { readonly phase: "loading" }
  | { readonly phase: "connected" }
  | { readonly phase: "disconnected"; readonly error?: string | null };

type LiveSitesState =
  | { readonly phase: "loading" }
  | { readonly phase: "error"; readonly message: string }
  | {
      readonly phase: "ready";
      readonly sites: readonly DiscoveredSite[];
      readonly deployments: readonly DiscoveredDeployment[];
      readonly databases: readonly DiscoveredDatabase[];
    };

function ConnectionBadge({ state }: { readonly state?: ConnectionState }) {
  if (!state || state.phase === "loading") {
    return (
      <Badge
        variant="secondary"
        className="rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        Checking…
      </Badge>
    );
  }

  const connected = state.phase === "connected";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        connected ? "bg-[#3d9a6a]/15 text-[#3d9a6a]" : "bg-destructive/15 text-destructive",
      )}
      title={connected ? undefined : (state.error ?? "Could not connect via SSH")}
    >
      {connected ? "Connected" : "Disconnected"}
    </Badge>
  );
}

function AppsListBody({
  live,
  onSiteDeleted,
  limit,
}: {
  readonly live: LiveSitesState;
  readonly onSiteDeleted?: ((siteId: string) => void) | undefined;
  readonly limit?: number | undefined;
}) {
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<DiscoveredSite | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (live.phase === "loading") {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        Discovering Kamal apps over SSH…
      </div>
    );
  }

  if (live.phase === "error") {
    return <div className="px-4 py-8 text-center text-sm text-destructive">{live.message}</div>;
  }

  if (live.sites.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No Kamal apps found on this server
      </div>
    );
  }

  const sites = typeof limit === "number" ? live.sites.slice(0, limit) : live.sites;

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const data = await deleteHetznerSite({
        serverId: String(pendingDelete.serverId),
        service: pendingDelete.service,
      });
      if (!data.ok) {
        setDeleteError(data.error ?? "Failed to delete app");
        return;
      }
      onSiteDeleted?.(pendingDelete.id);
      setPendingDelete(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Failed to delete app");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="divide-y divide-border/60">
        {sites.map((app) => {
          const hostsExtra =
            app.hosts.length > 1
              ? ` +${app.hosts.length - 1} host${app.hosts.length === 2 ? "" : "s"}`
              : "";
          return (
            <div
              key={app.id}
              role="link"
              tabIndex={0}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              onClick={() => {
                void navigate({
                  to: "/servers/$serverId/apps/$service",
                  params: {
                    serverId: String(app.serverId),
                    service: app.service,
                  },
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void navigate({
                    to: "/servers/$serverId/apps/$service",
                    params: {
                      serverId: String(app.serverId),
                      service: app.service,
                    },
                  });
                }
              }}
            >
              <AppGlyph accent={app.accent} initial={app.initial} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {app.domain}
                  {hostsExtra ? (
                    <span className="font-normal text-muted-foreground">{hostsExtra}</span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[app.repository, app.runtime, app.status].filter(Boolean).join(" · ") ||
                    app.service}
                </div>
              </div>
              <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                {app.deployedLabel}
              </div>
              <Menu>
                <MenuTrigger
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Actions for ${app.domain}`}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <EllipsisIcon className="size-4" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem
                    onClick={() => {
                      void writeTextToClipboard(app.id, "app ID");
                    }}
                  >
                    <CopyIcon className="size-4" />
                    Copy ID
                  </MenuItem>
                  <MenuItem
                    variant="destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(app);
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete site
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.domain}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the app from Kamal Proxy and stops its containers on the server. Docker
              volumes are kept. This cannot be undone from here.
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

function RecentAppsSection({
  live,
  onSiteDeleted,
}: {
  readonly live: LiveSitesState;
  readonly onSiteDeleted?: ((siteId: string) => void) | undefined;
}) {
  return (
    <SectionShell title="Recent Apps">
      <AppsListBody live={live} onSiteDeleted={onSiteDeleted} limit={5} />
    </SectionShell>
  );
}

function AppsTab({
  profile,
  live,
  onSiteDeleted,
}: {
  readonly profile: StaticServerProfile;
  readonly live: LiveSitesState;
  readonly onSiteDeleted?: ((siteId: string) => void) | undefined;
}) {
  const count = live.phase === "ready" ? live.sites.length : null;
  return (
    <ScrollArea className="min-h-0 flex-1">
      <WorkspacePageContainer width="expanded" className="gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Apps</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kamal apps on {profile.name}
              {count !== null ? ` · ${count} app${count === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <Button type="button" className="gap-1.5" disabled>
            New app
            <ChevronDownIcon className="size-4 opacity-70" />
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
          <AppsListBody live={live} onSiteDeleted={onSiteDeleted} />
        </div>
      </WorkspacePageContainer>
    </ScrollArea>
  );
}

function PlaceholderTab({ label }: { readonly label: string }) {
  return <div className="px-6 py-12 text-sm text-muted-foreground">{label} is not wired yet.</div>;
}

function DatabasesSection({ live }: { readonly live: LiveSitesState }) {
  if (live.phase === "loading") {
    return (
      <SectionShell title="Databases">
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Scanning volumes and database containers…
        </div>
      </SectionShell>
    );
  }

  if (live.phase === "error") {
    return (
      <SectionShell title="Databases">
        <div className="px-4 py-8 text-center text-sm text-destructive">{live.message}</div>
      </SectionShell>
    );
  }

  if (live.databases.length === 0) {
    return <SectionShell title="Databases" empty="No databases found on this server" />;
  }

  return (
    <SectionShell title="Databases">
      <div className="divide-y divide-border/60">
        {live.databases.slice(0, 5).map((database) => {
          const meta = [
            database.engine,
            database.siteDomain ?? database.appName,
            database.volume,
            database.sizeLabel,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={database.id} className="flex items-center gap-3 px-4 py-3">
              <AppGlyph accent={database.accent} initial={database.initial} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{database.name}</div>
                <div className="truncate text-xs text-muted-foreground">{meta}</div>
              </div>
              <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                {database.status}
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground"
                disabled
                aria-label={`Actions for ${database.name}`}
              >
                <EllipsisIcon className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function ActivitySection({ live }: { readonly live: LiveSitesState }) {
  if (live.phase === "loading") {
    return (
      <SectionShell title="Activity">
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Loading Kamal deploy history…
        </div>
      </SectionShell>
    );
  }

  if (live.phase === "error") {
    return (
      <SectionShell title="Activity">
        <div className="px-4 py-8 text-center text-sm text-destructive">{live.message}</div>
      </SectionShell>
    );
  }

  if (live.deployments.length === 0) {
    return <SectionShell title="Activity" empty="No Kamal deployments found in audit logs yet" />;
  }

  return (
    <SectionShell title="Activity">
      <div className="divide-y divide-border/60">
        {live.deployments.slice(0, 5).map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                entry.status === "success"
                  ? "bg-[#3d9a6a]/15 text-[#3d9a6a]"
                  : "bg-destructive/15 text-destructive",
              )}
              aria-hidden
            >
              {entry.status === "success" ? (
                <CheckCircle2Icon className="size-3.5" />
              ) : (
                <XCircleIcon className="size-3.5" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <AppGlyph accent={entry.siteAccent} initial={entry.siteInitial} />
              <div className="min-w-0">
                <div className="truncate text-sm text-foreground">
                  {entry.summary} · <span className="font-medium">{entry.siteDomain}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{entry.meta}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function ServerOverview({
  profile,
  connection,
  live,
  onSiteDeleted,
}: {
  readonly profile: StaticServerProfile;
  readonly connection: ConnectionState;
  readonly live: LiveSitesState;
  readonly onSiteDeleted?: ((siteId: string) => void) | undefined;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <WorkspacePageContainer width="expanded" className="gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <ServerGlyph profile={profile} size="lg" />
            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {profile.name}
                </h2>
                <ConnectionBadge state={connection} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{profile.role}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" className="gap-1.5" disabled>
              New site
              <ChevronDownIcon className="size-4 opacity-70" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled
              aria-label="Server actions"
            >
              <EllipsisIcon className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-8">
            <RecentAppsSection live={live} onSiteDeleted={onSiteDeleted} />

            <DatabasesSection live={live} />

            <SectionShell title="Background processes" empty="No background processes yet" />

            <SectionShell
              title="Scheduled jobs"
              empty={profile.scheduledJobs.length === 0 ? "No scheduled jobs yet" : undefined}
            >
              {profile.scheduledJobs.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {profile.scheduledJobs.map((job) => (
                    <div key={job.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{job.command}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {job.user} · {job.frequency}
                        </div>
                      </div>
                      {job.installed ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-[#3d9a6a]/15 text-[#3d9a6a]"
                        >
                          Installed
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </SectionShell>

            <SectionShell title="Backups" empty="No backup configurations yet" />

            <ActivitySection live={live} />
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
              <h3 className="border-b border-border/60 px-4 py-3 text-sm font-medium text-muted-foreground">
                Details
              </h3>
              <div className="divide-y divide-border/60">
                <DetailRow label="ID" value={profile.details.hetznerId} />
                <DetailRow label="Type" value={profile.details.type} />
                <DetailRow label="Database Type" value={profile.details.databaseType} />
                <DetailRow label="Region" value={profile.details.region} />
                <DetailRow label="Runtime" value={profile.details.runtime} />
                <DetailRow label="OS" value={profile.details.os} />
                <DetailRow label="Created" value={profile.details.created} />
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
              <h3 className="border-b border-border/60 px-4 py-3 text-sm font-medium text-muted-foreground">
                Networking
              </h3>
              <div className="divide-y divide-border/60">
                <DetailRow label="Public IP" value={profile.networking.publicIp} />
                <DetailRow label="Private IP" value={profile.networking.privateIp ?? "—"} />
              </div>
            </section>
          </aside>
        </div>
      </WorkspacePageContainer>
    </ScrollArea>
  );
}

export function ServerDetailPage({
  serverId,
  tab,
  storageSection = "database",
  runtimeSection = "docker",
  observeSection = "monitoring",
  processesSection = "background",
}: {
  readonly serverId: string;
  readonly tab: ServerDetailTabId;
  readonly storageSection?: StorageSectionId;
  readonly runtimeSection?: RuntimeSectionId;
  readonly observeSection?: ObserveSectionId;
  readonly processesSection?: ProcessesSectionId;
}) {
  const profile = resolveStaticServerProfile(serverId);
  const [connection, setConnection] = useState<ConnectionState>({ phase: "loading" });
  const [live, setLive] = useState<LiveSitesState>({ phase: "loading" });

  const refreshConnection = useCallback(async () => {
    setConnection({ phase: "loading" });
    try {
      const data = await fetchHetznerServerConnection(serverId);
      if (data.connected) {
        setConnection({ phase: "connected" });
        return;
      }
      setConnection({
        phase: "disconnected",
        error: data.error ?? "SSH connection failed",
      });
    } catch (error) {
      setConnection({
        phase: "disconnected",
        error: error instanceof Error ? error.message : "Connection check failed",
      });
    }
  }, [serverId]);

  const refreshLive = useCallback(async () => {
    setLive({ phase: "loading" });
    const numericId = Number(serverId);
    try {
      const data = await fetchHetznerSites();
      if (!data.ok && data.error) {
        setLive({ phase: "error", message: data.error });
        return;
      }
      const sites = (data.sites ?? []).filter((site) => site.serverId === numericId);
      const deployments = (data.deployments ?? []).filter(
        (deployment) => deployment.serverId === numericId,
      );
      const databases = (data.databases ?? []).filter(
        (database) => database.serverId === numericId,
      );
      if (
        sites.length === 0 &&
        deployments.length === 0 &&
        databases.length === 0 &&
        (data.errors?.length ?? 0) > 0
      ) {
        const hostError = data.errors!.find((entry) => entry.serverName === profile?.name);
        if (hostError) {
          setLive({ phase: "error", message: hostError.message });
          return;
        }
      }
      setLive({ phase: "ready", sites, deployments, databases });
    } catch (error) {
      setLive({
        phase: "error",
        message: error instanceof Error ? error.message : "Failed to load Kamal data",
      });
    }
  }, [profile?.name, serverId]);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  useEffect(() => {
    void refreshLive();
  }, [refreshLive]);

  const handleSiteDeleted = useCallback((siteId: string) => {
    setLive((current) => {
      if (current.phase !== "ready") return current;
      return {
        ...current,
        sites: current.sites.filter((site) => site.id !== siteId),
      };
    });
  }, []);

  if (!profile) {
    return (
      <>
        <ServerDetailNav serverId={serverId} activeId={tab} />
        <div className="px-6 py-12 text-sm text-muted-foreground">
          Server not found.{" "}
          <Link
            to="/servers/servers"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Back to servers
          </Link>
        </div>
      </>
    );
  }

  let body: ReactNode;
  switch (tab) {
    case "overview":
      body = (
        <ServerOverview
          profile={profile}
          connection={connection}
          live={live}
          onSiteDeleted={handleSiteDeleted}
        />
      );
      break;
    case "apps":
      body = <AppsTab profile={profile} live={live} onSiteDeleted={handleSiteDeleted} />;
      break;
    case "storage":
      body = (
        <ServerStorageTab
          profile={profile}
          section={storageSection}
          databases={live.phase === "ready" ? live.databases : []}
          loadingDatabases={live.phase === "loading"}
          databasesError={live.phase === "error" ? live.message : null}
          onRefreshDatabases={() => void refreshLive()}
        />
      );
      break;
    case "runtime":
      body = <ServerRuntimeTab profile={profile} section={runtimeSection} />;
      break;
    case "observe":
      body = <ServerObserveTab profile={profile} section={observeSection} />;
      break;
    case "processes":
      body = <ServerProcessesTab profile={profile} section={processesSection} />;
      break;
    default:
      body = (
        <PlaceholderTab
          label={SERVER_DETAIL_NAV_ITEMS.find((item) => item.id === tab)?.label ?? tab}
        />
      );
      break;
  }

  return (
    <>
      <ServerDetailNav serverId={profile.id} activeId={tab} />
      {body}
    </>
  );
}
