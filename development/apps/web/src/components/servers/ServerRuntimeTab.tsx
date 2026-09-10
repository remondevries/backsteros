import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, EllipsisIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { fetchHetznerServerRuntime, type ServerRuntimeResponse } from "./hetznerApi";
import type { StaticServerProfile } from "./staticServerProfiles";

export type RuntimeSectionId = "docker" | "proxy" | "node" | "nginx";

export function isRuntimeSectionId(value: unknown): value is RuntimeSectionId {
  return value === "docker" || value === "proxy" || value === "node" || value === "nginx";
}

const RUNTIME_NAV = [
  { id: "docker", label: "Docker" },
  { id: "proxy", label: "Kamal Proxy" },
  { id: "node", label: "Node.js" },
  { id: "nginx", label: "Nginx" },
] as const;

function RuntimeCard({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  title,
  description,
  value,
}: {
  readonly title: string;
  readonly description: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
      <div className="min-w-0 max-w-xl">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-sm text-foreground">
        {value}
      </div>
    </div>
  );
}

function DockerPanel({
  runtime,
  loading,
  error,
  onRefresh,
}: {
  readonly runtime: ServerRuntimeResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
}) {
  const docker = runtime?.docker;
  const running = useMemo(
    () =>
      (docker?.containers ?? []).filter((container) =>
        container.status.toLowerCase().startsWith("up"),
      ),
    [docker?.containers],
  );

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <RuntimeCard
        title="Settings"
        description="Host Docker engine discovered over SSH."
        action={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            aria-label="Refresh runtime"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
        }
      >
        {loading && !docker ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Discovering Docker…</div>
        ) : error && !docker ? (
          <div className="px-6 py-8 text-sm text-destructive">{error}</div>
        ) : (
          <div className="divide-y divide-border/60">
            <SettingRow
              title="Docker version"
              description="Installed Docker Engine version on this host."
              value={docker?.version ? `v${docker.version}` : "—"}
            />
            <SettingRow
              title="Running containers"
              description="Containers currently in the Up state."
              value={String(docker?.containersRunning ?? 0)}
            />
            <SettingRow
              title="Images"
              description="Local Docker images available on this host."
              value={String(docker?.images ?? 0)}
            />
          </div>
        )}
      </RuntimeCard>

      <RuntimeCard title="Containers" description="Containers currently running on this host.">
        {loading && !docker ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading containers…</div>
        ) : running.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No running containers.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {running.map((container) => (
              <div key={container.name} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {container.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{container.image}</div>
                </div>
                <Badge
                  variant="secondary"
                  className="hidden shrink-0 bg-[#3d9a6a]/15 text-[#3d9a6a] sm:inline-flex"
                >
                  <CheckCircle2Icon className="size-3.5" />
                  Running
                </Badge>
              </div>
            ))}
          </div>
        )}
      </RuntimeCard>
    </div>
  );
}

function ProxyPanel({
  runtime,
  loading,
  error,
}: {
  readonly runtime: ServerRuntimeResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
}) {
  const proxy = runtime?.proxy;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <RuntimeCard
        title="Settings"
        description="Kamal Proxy is the edge reverse proxy for deployed apps (instead of host Nginx)."
      >
        {loading && !proxy ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Discovering Kamal Proxy…</div>
        ) : error && !proxy ? (
          <div className="px-6 py-8 text-sm text-destructive">{error}</div>
        ) : !proxy?.present ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            Kamal Proxy was not found on this host.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            <SettingRow
              title="Proxy version"
              description="Installed kamal-proxy image tag."
              value={proxy.version ? `v${proxy.version}` : (proxy.image ?? "—")}
            />
            <SettingRow
              title="Status"
              description="Docker container state for kamal-proxy."
              value={proxy.status ?? "—"}
            />
            <SettingRow
              title="Published ports"
              description="Host ports published by the proxy container."
              value={proxy.ports.length > 0 ? proxy.ports.join(", ") : "—"}
            />
          </div>
        )}
      </RuntimeCard>

      <RuntimeCard title="Services" description="Apps registered in kamal-proxy.state.">
        {loading && !proxy ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading services…</div>
        ) : (proxy?.services.length ?? 0) === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No proxy services found.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {proxy!.services.map((service) => (
              <div key={service.name} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {service.hosts[0] ?? service.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      service.name,
                      service.tls ? "TLS" : "No TLS",
                      service.paused ? "Paused" : "Active",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  disabled
                  aria-label={`Actions for ${service.name}`}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </RuntimeCard>
    </div>
  );
}

function NodePanel({
  runtime,
  loading,
  error,
}: {
  readonly runtime: ServerRuntimeResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}) {
  const node = runtime?.node ?? [];
  const versions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of node) {
      counts.set(entry.nodeVersion, (counts.get(entry.nodeVersion) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => b.version.localeCompare(a.version));
  }, [node]);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <RuntimeCard
        title="Versions"
        description="Node.js versions discovered inside running app containers. This host does not install Node globally."
      >
        {loading && node.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Discovering Node.js…</div>
        ) : error && node.length === 0 ? (
          <div className="px-6 py-8 text-sm text-destructive">{error}</div>
        ) : versions.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No Node.js runtimes found in running containers.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {versions.map((entry) => (
              <div key={entry.version} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  Node.js {entry.version}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {entry.count} container{entry.count === 1 ? "" : "s"}
                </Badge>
                <Badge
                  variant="secondary"
                  className="hidden shrink-0 bg-[#3d9a6a]/15 text-[#3d9a6a] sm:inline-flex"
                >
                  <CheckCircle2Icon className="size-3.5" />
                  In use
                </Badge>
              </div>
            ))}
          </div>
        )}
      </RuntimeCard>

      <RuntimeCard title="Containers" description="Where each Node.js runtime was found.">
        {loading && node.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading containers…</div>
        ) : node.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No Node.js containers found.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {node.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {entry.siteDomain ?? entry.appName ?? entry.containerName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      `Node ${entry.nodeVersion}`,
                      entry.npmVersion ? `npm ${entry.npmVersion}` : null,
                      entry.appName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  disabled
                  aria-label={`Actions for ${entry.containerName}`}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </RuntimeCard>
    </div>
  );
}

function NginxPanel({
  runtime,
  loading,
  error,
}: {
  readonly runtime: ServerRuntimeResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}) {
  const nginx = runtime?.nginx ?? [];
  const versions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of nginx) {
      counts.set(entry.nginxVersion, (counts.get(entry.nginxVersion) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => b.version.localeCompare(a.version));
  }, [nginx]);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <RuntimeCard
        title="Versions"
        description="Nginx versions found inside app containers. Edge traffic is handled by Kamal Proxy, not a host Nginx install."
      >
        {loading && nginx.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Discovering Nginx…</div>
        ) : error && nginx.length === 0 ? (
          <div className="px-6 py-8 text-sm text-destructive">{error}</div>
        ) : versions.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No Nginx runtimes found in running containers.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {versions.map((entry) => (
              <div key={entry.version} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  Nginx {entry.version}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {entry.count} container{entry.count === 1 ? "" : "s"}
                </Badge>
                <Badge
                  variant="secondary"
                  className="hidden shrink-0 bg-[#3d9a6a]/15 text-[#3d9a6a] sm:inline-flex"
                >
                  <CheckCircle2Icon className="size-3.5" />
                  In use
                </Badge>
              </div>
            ))}
          </div>
        )}
      </RuntimeCard>

      <RuntimeCard title="Containers" description="Where each Nginx runtime was found.">
        {loading && nginx.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading containers…</div>
        ) : nginx.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No Nginx containers found.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {nginx.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {entry.siteDomain ?? entry.appName ?? entry.containerName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[`Nginx ${entry.nginxVersion}`, entry.appName].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  disabled
                  aria-label={`Actions for ${entry.containerName}`}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </RuntimeCard>
    </div>
  );
}

export function ServerRuntimeTab({
  profile,
  section,
}: {
  readonly profile: StaticServerProfile;
  readonly section: RuntimeSectionId;
}) {
  const [runtime, setRuntime] = useState<ServerRuntimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHetznerServerRuntime(profile.id);
      if (!data.ok && data.error) {
        setError(data.error);
        setRuntime(null);
        return;
      }
      setRuntime(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load runtime");
      setRuntime(null);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <WorkspacePageContainer width="expanded" className="gap-10 py-8">
        <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
          <aside className="min-w-0">
            <h2 className="px-2 text-3xl font-semibold tracking-tight text-foreground">Runtime</h2>
            <nav aria-label="Runtime" className="mt-6 flex flex-col gap-1.5">
              {RUNTIME_NAV.map((item) => {
                const active = item.id === section;
                return (
                  <Link
                    key={item.id}
                    to="/servers/$serverId"
                    params={{ serverId: profile.id }}
                    search={{ tab: "runtime", section: item.id }}
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
            {section === "docker" ? (
              <DockerPanel
                runtime={runtime}
                loading={loading}
                error={error}
                onRefresh={() => void refresh()}
              />
            ) : null}
            {section === "proxy" ? (
              <ProxyPanel
                runtime={runtime}
                loading={loading}
                error={error}
                onRefresh={() => void refresh()}
              />
            ) : null}
            {section === "node" ? (
              <NodePanel runtime={runtime} loading={loading} error={error} />
            ) : null}
            {section === "nginx" ? (
              <NginxPanel runtime={runtime} loading={loading} error={error} />
            ) : null}
          </div>
        </div>
      </WorkspacePageContainer>
    </ScrollArea>
  );
}
