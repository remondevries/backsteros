import { useCallback } from "react";
import { useLocation } from "@tanstack/react-router";

import { BacksterosComposeIcon } from "~/backsteros/BacksterosComposeIcon";
import { useSidebarModeStore } from "~/backsteros/sidebarModeStore";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { isElectron } from "../../env";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ServersSidebarNav } from "./ServersSidebarNav";

function parseServerIdFromPath(pathname: string): string | null {
  const match = /^\/servers\/([^/]+)/u.exec(pathname);
  if (!match) return null;
  const segment = match[1]!;
  if (segment === "servers") return null;
  return segment;
}

function activeServersNavId(pathname: string): string {
  if (parseServerIdFromPath(pathname)) return "servers";
  if (pathname === "/servers/servers" || pathname.startsWith("/servers/servers/")) {
    return "servers";
  }
  return "dashboard";
}

/**
 * Left rail for /servers/* — coder chrome (logo, mode toggle, compose) +
 * Settings-style vertical nav + Cursor usage footer.
 */
export function ServersPageSidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const selectedServerId = parseServerIdFromPath(pathname);
  const { isMobile, setOpenMobile } = useSidebar();
  const logModeEnabled = useSidebarModeStore((state) => state.logModeEnabled);
  const setLogModeEnabled = useSidebarModeStore((state) => state.setLogModeEnabled);
  const openCreateTaskDetail = useBacksterosTaskDetailUiStore(
    (state) => state.openCreateTaskDetail,
  );
  const { state: projectsState } = useBacksterosCodebaseProjects(true);
  const createTaskProject =
    projectsState.status === "ready" ? (projectsState.projects[0] ?? null) : null;

  const handleNewTaskClick = useCallback(() => {
    if (!createTaskProject) {
      toastManager.add({
        type: "warning",
        title: projectsState.status === "ready" ? "No projects yet" : "Projects still loading",
        description:
          projectsState.status === "ready"
            ? "Create a BacksterOS project before adding a task."
            : "Wait a moment and try again.",
      });
      return;
    }
    if (isMobile) setOpenMobile(false);
    openCreateTaskDetail(createTaskProject, { reveal: true });
  }, [createTaskProject, isMobile, openCreateTaskDetail, projectsState.status, setOpenMobile]);

  return (
    <>
      <SidebarChromeHeader
        isElectron={isElectron}
        logModeEnabled={logModeEnabled}
        onLogModeChange={setLogModeEnabled}
        brandAction={
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="icon"
                  type="button"
                  className="relative focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                  onClick={handleNewTaskClick}
                  aria-label="New task"
                />
              }
            >
              <BacksterosComposeIcon />
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                aria-hidden="true"
              />
            </TooltipTrigger>
            <TooltipPopup side="right">New task</TooltipPopup>
          </Tooltip>
        }
      />
      <ServersSidebarNav
        activeId={activeServersNavId(pathname)}
        selectedServerId={selectedServerId}
      />
      <SidebarChromeFooter />
    </>
  );
}
