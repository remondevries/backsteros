import { useCallback } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { useSidebar } from "../ui/sidebar";
import { WorkspaceCoderIcon, WorkspaceGitIcon, WorkspaceServersIcon } from "./WorkspaceModeIcons";

type WorkspaceMode = "code" | "servers" | "git";

function resolveWorkspaceMode(pathname: string): WorkspaceMode | null {
  if (pathname === "/servers" || pathname.startsWith("/servers/")) return "servers";
  if (pathname === "/pull-requests" || pathname.startsWith("/pull-requests/")) return "git";
  // Utility pages (Usage, Settings, project settings) are outside the three modes.
  if (
    pathname === "/usage" ||
    pathname.startsWith("/usage/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    /^\/projects\/[^/]+\/?$/.test(pathname)
  ) {
    return null;
  }
  return "code";
}

/**
 * Footer switch between Coding, Servers, and Git (pull requests).
 * Blue = code, orange = servers, violet = git.
 * No selection when on Usage / Settings (and similar utility routes).
 */
export function SidebarWorkspaceModeToggle() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const mode = resolveWorkspaceMode(pathname);

  const selectMode = useCallback(
    (next: WorkspaceMode) => {
      if (isMobile) setOpenMobile(false);
      if (next === "servers") {
        void navigate({ to: "/servers" });
        return;
      }
      if (next === "git") {
        void navigate({
          to: "/pull-requests",
          search: readPullRequestListPreferences(),
        });
        return;
      }
      void navigate({ to: "/" });
    },
    [isMobile, navigate, setOpenMobile],
  );

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-sidebar-foreground/5 p-0.5"
      role="group"
      aria-label="Workspace mode"
    >
      <button
        type="button"
        onClick={() => selectMode("code")}
        aria-pressed={mode === "code"}
        aria-label="Coding"
        title="Coding"
        className={cn(
          "inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors",
          mode === "code"
            ? "bg-[#5b8def]/20 text-[#5b8def]"
            : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
      >
        <WorkspaceCoderIcon size={14} />
        <span className="truncate">Code</span>
      </button>
      <button
        type="button"
        onClick={() => selectMode("servers")}
        aria-pressed={mode === "servers"}
        aria-label="Servers"
        title="Servers"
        className={cn(
          "inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors",
          mode === "servers"
            ? "bg-[#e8843c]/20 text-[#e8843c]"
            : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
      >
        <WorkspaceServersIcon size={14} />
        <span className="truncate">Servers</span>
      </button>
      <button
        type="button"
        onClick={() => selectMode("git")}
        aria-pressed={mode === "git"}
        aria-label="Git"
        title="Pull requests"
        className={cn(
          "inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors",
          mode === "git"
            ? "bg-[#8b7cf6]/20 text-[#8b7cf6]"
            : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
      >
        <WorkspaceGitIcon size={14} />
        <span className="truncate">Git</span>
      </button>
    </div>
  );
}
