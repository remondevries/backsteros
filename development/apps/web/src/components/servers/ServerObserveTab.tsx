import { Link } from "@tanstack/react-router";
import { BellIcon, CheckCircle2Icon, EllipsisIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import {
  deleteServerMonitor,
  fetchServerMonitors,
  testServerMonitor,
  type DiscoveredDeployment,
  type ServerMonitor,
  type ServerMonitorMetric,
  type ServerMonitorOperator,
} from "./hetznerApi";
import { NewMonitorDialog } from "./NewMonitorDialog";
import { ServerActivityPanel } from "./ServerActivityPanel";
import { ServerLogsPanel } from "./ServerLogsPanel";
import { ServerMetricsPanel } from "./ServerMetricsPanel";
import type { StaticServerProfile } from "./staticServerProfiles";

export type ObserveSectionId = "monitoring" | "metrics" | "logs" | "activity";

export function isObserveSectionId(value: unknown): value is ObserveSectionId {
  return value === "monitoring" || value === "metrics" || value === "logs" || value === "activity";
}

const OBSERVE_NAV = [
  { id: "monitoring", label: "Monitoring" },
  { id: "metrics", label: "Metrics" },
  { id: "logs", label: "Logs" },
  { id: "activity", label: "Activity" },
] as const;

const METRIC_LABELS: Record<ServerMonitorMetric, string> = {
  cpu_load: "CPU Load Average",
  used_memory: "Used Memory",
  used_disk: "Used Disk Space",
};

const OPERATOR_LABELS: Record<ServerMonitorOperator, string> = {
  gte: "Greater than or equal to",
  gt: "Greater than",
  lte: "Less than or equal to",
  lt: "Less than",
};

function ObserveCard({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly children?: ReactNode | undefined;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          {description ? (
            <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function monitorSummary(monitor: ServerMonitor): string {
  const condition = `${OPERATOR_LABELS[monitor.operator]} ${monitor.threshold}%`;
  const duration =
    monitor.durationMinutes === 1
      ? "for at least 1 min"
      : `for at least ${monitor.durationMinutes} min`;
  const notify = monitor.notifyContactName
    ? `Support ticket → ${monitor.notifyContactName}`
    : monitor.notifyContactId
      ? "Support ticket → contact"
      : "Support ticket (no contact)";
  return `${condition}, ${duration} · ${notify}`;
}

function MonitoringPanel({
  profile,
  service = null,
}: {
  readonly profile: StaticServerProfile;
  readonly service?: string | null;
}) {
  const [monitors, setMonitors] = useState<readonly ServerMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServerMonitors(profile.id, { service });
      if (!data.ok && data.error) {
        setError(data.error);
        setMonitors([]);
        return;
      }
      setMonitors(data.monitors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load monitors");
      setMonitors([]);
    } finally {
      setLoading(false);
    }
  }, [profile.id, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function removeMonitor(monitorId: string) {
    try {
      const data = await deleteServerMonitor(profile.id, monitorId);
      if (!data.ok) {
        setError(data.error ?? "Failed to delete monitor");
        return;
      }
      setMonitors((current) => current.filter((monitor) => monitor.id !== monitorId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete monitor");
    }
  }

  async function runTestTicket(monitorId: string) {
    try {
      const data = await testServerMonitor({ serverId: profile.id, monitorId });
      if (!data.ok) {
        setError(data.error ?? "Failed to create test support ticket");
        return;
      }
      if (data.monitor) {
        setMonitors((current) =>
          current.map((monitor) => (monitor.id === monitorId ? data.monitor! : monitor)),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create test support ticket");
    }
  }

  const scopeLabel = service ?? profile.name;

  return (
    <>
      <ObserveCard
        title="Monitors"
        description={
          <>
            Configure monitors for {scopeLabel}. When a threshold is sustained, BacksterOS opens a
            support ticket for the selected contact.
          </>
        }
        action={
          monitors.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <PlusIcon className="size-4" />
              Add monitor
            </Button>
          ) : null
        }
      >
        {loading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading monitors…</div>
        ) : error ? (
          <div className="px-6 py-8 text-sm text-destructive">{error}</div>
        ) : monitors.length === 0 ? (
          <div className="px-6 py-6">
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-background/40 px-6 py-16 text-center">
              <p className="text-base font-medium text-foreground">
                {service ? "No app monitors yet" : "No server monitors yet"}
              </p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Get started and add your first {service ? "app" : "server"} monitor.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-6 gap-1.5"
                onClick={() => setDialogOpen(true)}
              >
                <PlusIcon className="size-4" />
                Add monitor
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {monitors.map((monitor) => (
              <div key={monitor.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {METRIC_LABELS[monitor.metric]}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{monitorSummary(monitor)}</span>
                    <BellIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="hidden shrink-0 bg-[#3d9a6a]/15 text-[#3d9a6a] sm:inline-flex"
                >
                  <CheckCircle2Icon className="size-3.5" />
                  {monitor.status === "active" ? "Active" : "Paused"}
                </Badge>
                <Menu>
                  <MenuTrigger
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Actions for ${METRIC_LABELS[monitor.metric]}`}
                  >
                    <EllipsisIcon className="size-4" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem onClick={() => void runTestTicket(monitor.id)}>
                      Create test support ticket
                    </MenuItem>
                    <MenuItem variant="destructive" onClick={() => void removeMonitor(monitor.id)}>
                      Delete monitor
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            ))}
          </div>
        )}
      </ObserveCard>

      <NewMonitorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        serverId={profile.id}
        serverName={profile.name}
        service={service}
        onCreated={(monitor) => {
          setMonitors((current) => [monitor, ...current]);
        }}
      />
    </>
  );
}

export function ServerObserveTab({
  profile,
  section,
  service = null,
  activityItems,
  layout = "page",
}: {
  readonly profile: StaticServerProfile;
  readonly section: ObserveSectionId;
  /** When set, scopes Observe to a Kamal app (Forge site-style). */
  readonly service?: string | null;
  /** App-scoped activity (deployments). Server activity uses the Hetzner API. */
  readonly activityItems?: readonly DiscoveredDeployment[];
  readonly layout?: "page" | "embedded";
}) {
  const body = (
    <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
      <aside className="min-w-0">
        <h2 className="px-2 text-3xl font-semibold tracking-tight text-foreground">Observe</h2>
        <nav aria-label="Observe" className="mt-6 flex flex-col gap-1.5">
          {OBSERVE_NAV.map((item) => {
            const active = item.id === section;
            return service ? (
              <Link
                key={item.id}
                to="/servers/$serverId/apps/$service"
                params={{ serverId: profile.id, service }}
                search={{ tab: "observe", section: item.id }}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.id}
                to="/servers/$serverId"
                params={{ serverId: profile.id }}
                search={{ tab: "observe", section: item.id }}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        {section === "monitoring" ? <MonitoringPanel profile={profile} service={service} /> : null}
        {section === "metrics" ? (
          <ServerMetricsPanel serverId={profile.id} service={service} />
        ) : null}
        {section === "logs" ? <ServerLogsPanel serverId={profile.id} service={service} /> : null}
        {section === "activity" ? (
          service ? (
            <AppActivityPanel deployments={activityItems ?? []} />
          ) : (
            <ServerActivityPanel serverId={profile.id} />
          )
        ) : null}
      </div>
    </div>
  );

  if (layout === "embedded") return body;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <WorkspacePageContainer width="expanded" className="gap-10 py-8">
        {body}
      </WorkspacePageContainer>
    </ScrollArea>
  );
}

function formatRelativeDeployed(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const deltaSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(deltaSec);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return formatter.format(deltaSec, "second");
  const minutes = Math.round(deltaSec / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return formatter.format(months, "month");
  return formatter.format(Math.round(days / 365), "year");
}

function AppActivityPanel({
  deployments,
}: {
  readonly deployments: readonly DiscoveredDeployment[];
}) {
  if (deployments.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          No app activity yet.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <ul className="px-5 py-4 sm:px-6">
        {deployments.map((entry, index) => {
          const isLast = index === deployments.length - 1;
          return (
            <li key={entry.id} className="relative flex gap-4 py-3.5">
              {!isLast ? (
                <span
                  className="absolute top-10 bottom-0 left-[1.15rem] w-px bg-border/70"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide",
                  entry.status === "failed"
                    ? "bg-destructive/90 text-white"
                    : entry.status === "running"
                      ? "bg-amber-500/90 text-white"
                      : "bg-[#3b5bdb] text-white",
                )}
                aria-hidden
              >
                {(entry.actor ?? "DP").slice(0, 2).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {entry.summary}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{entry.meta}</div>
                </div>
                <div className="shrink-0 text-sm text-muted-foreground">
                  {formatRelativeDeployed(entry.at)}
                  {entry.actor ? (
                    <>
                      {" "}
                      by <span className="text-foreground/90">{entry.actor}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
