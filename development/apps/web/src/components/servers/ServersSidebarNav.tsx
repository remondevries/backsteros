import { LayoutDashboardIcon } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { listStaticServerProfiles, type StaticServerProfile } from "./staticServerProfiles";

function ServerGlyph({ server }: { readonly server: StaticServerProfile }) {
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center rounded text-[8px] font-semibold text-white"
      style={{ backgroundColor: server.accent }}
      aria-hidden
    >
      {server.initial}
    </span>
  );
}

/**
 * Vertical servers section nav — Dashboard, then a Servers label + server list.
 */
export function ServersSidebarNav({
  activeId,
  selectedServerId,
}: {
  readonly activeId: string;
  readonly selectedServerId?: string | null;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const servers = listStaticServerProfiles();

  const closeMobile = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup className="gap-2 p-[var(--sidebar-content-inset)]">
        <SidebarMenu className="ps-px">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeId === "dashboard"}
              onClick={() => {
                closeMobile();
                void navigate({ to: "/servers" });
              }}
            >
              <LayoutDashboardIcon />
              <span className="truncate">Dashboard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarGroupLabel className="mt-2">Servers</SidebarGroupLabel>
        <SidebarMenu className="ps-px">
          {servers.length === 0 ? (
            <SidebarMenuItem>
              <span className="px-2 py-1.5 text-xs text-sidebar-muted-foreground/65">
                No servers yet
              </span>
            </SidebarMenuItem>
          ) : (
            servers.map((server) => {
              const isSelected = selectedServerId === server.id;
              return (
                <SidebarMenuItem key={server.id}>
                  <SidebarMenuButton
                    isActive={isSelected}
                    onClick={() => {
                      closeMobile();
                      void navigate({
                        to: "/servers/$serverId",
                        params: { serverId: server.id },
                        search: { tab: "overview" },
                      });
                    }}
                    className={cn(!isSelected && "text-sidebar-muted-foreground")}
                  >
                    <ServerGlyph server={server} />
                    <span className="truncate">{server.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })
          )}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
