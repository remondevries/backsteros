import { Outlet, useRouterState } from "@tanstack/react-router";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageFrame } from "../WorkspacePageContainer";
import { ServersContextBreadcrumb } from "./ServersContextBreadcrumb";
import { resolveStaticServerProfile } from "./staticServerProfiles";

/** Match app / server detail content width so chrome lines up with the body. */
const SERVERS_CHROME_WIDTH = "expanded" as const;

function parseServerIdFromPath(pathname: string): string | null {
  const match = /^\/servers\/([^/]+)/u.exec(pathname);
  if (!match) return null;
  const segment = match[1]!;
  if (
    segment === "servers" ||
    segment === "resources" ||
    segment === "recipes" ||
    segment === "settings"
  ) {
    return null;
  }
  return segment;
}

function parseAppServiceFromPath(pathname: string): string | null {
  const match = /^\/servers\/[^/]+\/apps\/([^/]+)/u.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

/**
 * Shared chrome for /servers/* — context breadcrumb; section nav lives in the left rail.
 */
export function ServersLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const serverId = parseServerIdFromPath(pathname);
  const appService = parseAppServiceFromPath(pathname);
  const serverProfile = serverId ? resolveStaticServerProfile(serverId) : null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center",
          isElectron && "drag-region",
        )}
      >
        <WorkspacePageFrame
          width={SERVERS_CHROME_WIDTH}
          className="flex h-full min-w-0 items-center"
        >
          <ServersContextBreadcrumb
            server={serverProfile}
            serverId={serverId}
            appService={appService}
            className="min-w-0 flex-1"
          />
        </WorkspacePageFrame>
      </header>
      <Outlet />
    </SidebarInset>
  );
}
