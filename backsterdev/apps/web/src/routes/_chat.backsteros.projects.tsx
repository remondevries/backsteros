import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";

/**
 * Log-mode projects rail root: sidepanel owns the project list; main is empty
 * until a project is opened. Escape from a project lands here.
 */
function BacksterosProjectsLandingView() {
  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader
          electron={isElectron}
          className={cn("border-b border-border/50", isElectron && "drag-region")}
        >
          <h2 className="min-w-0 truncate text-sm font-medium text-foreground">Projects</h2>
        </WorkspacePageHeader>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="max-w-sm text-sm text-muted-foreground text-balance">
            Select a project in the sidebar, or press{" "}
            <kbd className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[0.7rem]">
              j
            </kbd>
            /
            <kbd className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[0.7rem]">
              k
            </kbd>{" "}
            then Enter.
          </p>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/backsteros/projects")({
  component: BacksterosProjectsLandingView,
});
