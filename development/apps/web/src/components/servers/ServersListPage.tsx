import { Link } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon, SearchIcon, ServerIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import {
  fetchHetznerServers,
  fetchHetznerSites,
  type DiscoveredSite,
  type HetznerServer,
} from "./hetznerApi";
import { NewServerDialog } from "./NewServerDialog";

const SERVER_ACCENTS = ["#5b8def", "#c45c5c", "#3d9a6a", "#c4922a", "#7c5cbf"] as const;

function serverLocation(server: HetznerServer): string {
  return (
    server.location?.city ??
    server.location?.name ??
    server.datacenter?.location.city ??
    server.datacenter?.location.name ??
    "Unknown location"
  );
}

function ServerListRow({
  server,
  accent,
  appCount,
}: {
  readonly server: HetznerServer;
  readonly accent: string;
  readonly appCount: number;
}) {
  const ip = server.public_net.ipv4?.ip ?? "No public IPv4";
  const os = server.image?.description ?? server.image?.name ?? "Unknown image";
  const meta = [ip, "App server", server.server_type.name, os].join(" · ");
  const stats =
    appCount > 0
      ? `${appCount} app${appCount === 1 ? "" : "s"}`
      : server.status === "running"
        ? "No apps yet"
        : server.status;

  return (
    <Link
      to="/servers/$serverId"
      params={{ serverId: String(server.id) }}
      className="group flex items-center gap-3 border-b border-border/50 px-1 py-3 transition-colors last:border-b-0 hover:bg-muted/30 sm:px-2"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: accent }}
        aria-hidden
      >
        <ServerIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
          {server.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
        <div>{stats}</div>
        <div className="capitalize text-muted-foreground/80">
          {server.status} · {serverLocation(server)}
        </div>
      </div>
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
 * Forge-style servers index — full list, shown only under Servers nav.
 */
export function ServersListPage() {
  const [servers, setServers] = useState<readonly HetznerServer[]>([]);
  const [sites, setSites] = useState<readonly DiscoveredSite[]>([]);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [newServerOpen, setNewServerOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [serversData, sitesData] = await Promise.all([
        fetchHetznerServers(),
        fetchHetznerSites(),
      ]);
      if (!serversData.ok && serversData.error) {
        setError(serversData.error);
        setServers([]);
        setConfigured(false);
        return;
      }
      setConfigured(serversData.configured !== false);
      setServers(serversData.servers ?? []);
      setSites(sitesData.sites ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load servers");
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const appCountByServerId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const site of sites) {
      counts.set(site.serverId, (counts.get(site.serverId) ?? 0) + 1);
    }
    return counts;
  }, [sites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((server) => {
      const ip = server.public_net.ipv4?.ip ?? "";
      const os = server.image?.description ?? server.image?.name ?? "";
      const haystack = [server.name, ip, server.server_type.name, os, server.status]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, servers]);

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <WorkspacePageContainer width="expanded" className="gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search servers"
                className="ps-9"
                aria-label="Search servers"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" disabled className="justify-between gap-2">
                Live servers
              </Button>
              <Button type="button" className="gap-1.5" onClick={() => setNewServerOpen(true)}>
                <PlusIcon className="size-4" />
                New server
              </Button>
            </div>
          </div>

          <div className="min-w-0">
            {loading ? (
              <div className="px-1 py-8 text-sm text-muted-foreground">Loading servers…</div>
            ) : error ? (
              <div className="px-1 py-8 text-sm text-destructive">{error}</div>
            ) : !configured ? (
              <div className="px-1 py-8 text-sm text-muted-foreground">
                Hetzner Cloud is not configured. Add{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">HCLOUD_TOKEN</code> to{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  ~/.config/secrets/hetzner.env
                </code>
                .
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-1 py-8 text-sm text-muted-foreground">
                {query.trim()
                  ? "No servers match your search."
                  : "No servers yet. Create one with New server."}
              </div>
            ) : (
              filtered.map((server, index) => (
                <ServerListRow
                  key={server.id}
                  server={server}
                  accent={SERVER_ACCENTS[index % SERVER_ACCENTS.length]!}
                  appCount={appCountByServerId.get(server.id) ?? 0}
                />
              ))
            )}
          </div>

          {!loading && configured && servers.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <span>
                {filtered.length === servers.length
                  ? `${servers.length} server${servers.length === 1 ? "" : "s"}`
                  : `${filtered.length} of ${servers.length} servers`}
              </span>
            </div>
          ) : null}
        </WorkspacePageContainer>
      </ScrollArea>

      <NewServerDialog
        open={newServerOpen}
        onOpenChange={setNewServerOpen}
        onCreated={() => {
          void refresh();
        }}
      />
    </>
  );
}
