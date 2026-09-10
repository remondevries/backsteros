import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronsUpDownIcon, ServerIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { fetchHetznerSites, type DiscoveredSite } from "./hetznerApi";
import { listStaticServerProfiles, type StaticServerProfile } from "./staticServerProfiles";

/** Keep tab/section when switching apps; drop app-specific deep links. */
function preservedAppSearch(search: unknown): {
  readonly tab?: string;
  readonly section?: string;
} {
  if (!search || typeof search !== "object") return { tab: "overview" };
  const raw = search as Record<string, unknown>;
  return {
    ...(typeof raw.tab === "string" && raw.tab.trim()
      ? { tab: raw.tab.trim() }
      : { tab: "overview" }),
    ...(typeof raw.section === "string" && raw.section.trim()
      ? { section: raw.section.trim() }
      : {}),
  };
}

function ContextGlyph({
  accent,
  initial,
  className,
}: {
  readonly accent: string;
  readonly initial: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: accent }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function appDisplayName(site: DiscoveredSite): string {
  return site.service.replace(/-web$/u, "") || site.domain;
}

/**
 * Server / app context trail in the top-left chrome (only when a server is selected).
 */
export function ServersContextBreadcrumb({
  server,
  serverId,
  appService,
  appLabel,
  className,
}: {
  readonly server?: StaticServerProfile | null;
  readonly serverId?: string | null;
  readonly appService?: string | null;
  readonly appLabel?: string | null;
  readonly className?: string;
}) {
  const navigate = useNavigate();
  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });
  const servers = listStaticServerProfiles();
  const [apps, setApps] = useState<readonly DiscoveredSite[]>([]);

  useEffect(() => {
    if (!serverId || !appService) {
      setApps([]);
      return;
    }
    let cancelled = false;
    void fetchHetznerSites().then((data) => {
      if (cancelled || !data.ok) return;
      const numericId = Number(serverId);
      const matched = (data.sites ?? []).filter(
        (site) => site.serverId === numericId || String(site.serverId) === serverId,
      );
      setApps(matched);
    });
    return () => {
      cancelled = true;
    };
  }, [appService, serverId]);

  const currentApp = useMemo(() => {
    if (!appService) return null;
    return (
      apps.find((site) => site.service === appService) ??
      apps.find(
        (site) => site.service.replace(/-web$/u, "") === appService.replace(/-web$/u, ""),
      ) ??
      null
    );
  }, [appService, apps]);

  const appTitle =
    appLabel ??
    (currentApp ? appDisplayName(currentApp) : null) ??
    (appService ? appService.replace(/-web$/u, "") : null);

  if (!serverId) return null;

  return (
    <nav
      aria-label="Servers context"
      className={cn("flex min-w-0 items-center gap-1.5 text-sm", className)}
    >
      <div className="inline-flex max-w-[16rem] min-w-0 items-center rounded-md">
        <Link
          to="/servers/$serverId"
          params={{ serverId }}
          search={{ tab: "overview" }}
          className="inline-flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-foreground transition-colors hover:bg-muted"
          aria-label={`Open ${server?.name ?? serverId} overview`}
        >
          {server ? (
            <ContextGlyph accent={server.accent} initial={server.initial} />
          ) : (
            <ServerIcon className="size-4 shrink-0 opacity-70" aria-hidden />
          )}
          <span className="truncate">{server?.name ?? serverId}</span>
        </Link>
        <Menu>
          <MenuTrigger
            className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground"
            aria-label="Switch server"
          >
            <ChevronsUpDownIcon className="size-3.5 opacity-70" aria-hidden />
          </MenuTrigger>
          <MenuPopup align="start" className="min-w-52">
            {servers.map((entry) => (
              <MenuItem
                key={entry.id}
                onClick={() =>
                  void navigate({
                    to: "/servers/$serverId",
                    params: { serverId: entry.id },
                    search: { tab: "overview" },
                  })
                }
              >
                <ContextGlyph accent={entry.accent} initial={entry.initial} />
                {entry.name}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </div>

      {appTitle && appService ? (
        <>
          <span className="shrink-0 text-muted-foreground/70" aria-hidden>
            /
          </span>
          <div className="inline-flex max-w-[16rem] min-w-0 items-center rounded-md">
            <Link
              to="/servers/$serverId/apps/$service"
              params={{ serverId, service: appService }}
              search={{ tab: "overview" }}
              className="inline-flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-foreground transition-colors hover:bg-muted"
              aria-label={`Open ${appTitle} overview`}
            >
              {currentApp ? (
                <ContextGlyph accent={currentApp.accent} initial={currentApp.initial} />
              ) : (
                <ContextGlyph accent="#7c5cbf" initial={(appTitle[0] ?? "?").toUpperCase()} />
              )}
              <span className="truncate" title={currentApp?.domain ?? appTitle}>
                {appTitle}
              </span>
            </Link>
            <Menu>
              <MenuTrigger
                className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground"
                aria-label="Switch app"
              >
                <ChevronsUpDownIcon className="size-3.5 opacity-70" aria-hidden />
              </MenuTrigger>
              <MenuPopup align="start" className="min-w-52">
                {apps.length === 0 ? (
                  <MenuItem disabled>No apps found</MenuItem>
                ) : (
                  apps.map((entry) => (
                    <MenuItem
                      key={entry.id}
                      onClick={() =>
                        void navigate({
                          to: "/servers/$serverId/apps/$service",
                          params: { serverId, service: entry.service },
                          search: preservedAppSearch(locationSearch),
                        })
                      }
                    >
                      <ContextGlyph accent={entry.accent} initial={entry.initial} />
                      <span className="truncate">{appDisplayName(entry)}</span>
                    </MenuItem>
                  ))
                )}
              </MenuPopup>
            </Menu>
          </div>
        </>
      ) : null}
    </nav>
  );
}
