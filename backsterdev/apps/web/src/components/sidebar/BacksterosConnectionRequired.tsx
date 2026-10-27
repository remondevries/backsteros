import { useNavigate } from "@tanstack/react-router";

import { useBacksterosSettingsStore } from "~/backsteros/settingsStore";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

function connectionRequiredCopy(hasStoredKey: boolean, enabled: boolean): string {
  return hasStoredKey && !enabled
    ? "Turn on the BacksterOS connection in Settings → Integrations to use projects and tasks."
    : "Add a BacksterOS API key in Settings → Integrations to use projects and tasks.";
}

function OpenIntegrationsButton({ size = "xs" }: { readonly size?: "xs" | "sm" }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      onClick={() => {
        void navigate({
          to: "/settings/integrations",
          hash: "backsteros-connection",
          state: { settingsTargetHighlight: true },
        });
      }}
    >
      Open Integrations
    </Button>
  );
}

/**
 * Main-column prompt when BacksterOS connection is off or has no API key.
 * The left rail stays empty in that state (no inbox/search/create chrome).
 */
export function BacksterosConnectionRequired({
  layout = "main",
}: {
  readonly layout?: "rail" | "main";
}) {
  const hasStoredKey = useBacksterosSettingsStore((state) => state.apiKey.trim().length > 0);
  const enabled = useBacksterosSettingsStore((state) => state.enabled);
  const message = connectionRequiredCopy(hasStoredKey, enabled);

  if (layout === "rail") {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader
          electron={isElectron}
          className={cn("border-b border-border/50", isElectron && "drag-region")}
        >
          <h2 className="min-w-0 truncate text-sm font-medium text-foreground">BacksterOS</h2>
        </WorkspacePageHeader>
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <p className="max-w-md text-sm text-muted-foreground text-balance">{message}</p>
          <OpenIntegrationsButton size="sm" />
        </div>
      </div>
    </SidebarInset>
  );
}
