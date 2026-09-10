import { usePullRequestListBridge } from "./pullRequestListBridge";
import { SidebarContent, SidebarGroup } from "../ui/sidebar";

/**
 * Full pull-request list in the Git left rail (search / refresh, then sort / filter).
 * Content is published by the /pull-requests page via {@link publishPullRequestListBridge}.
 */
export function PullRequestsSidebarList() {
  const bridge = usePullRequestListBridge();

  return (
    <SidebarContent className="min-h-0 gap-0 overflow-hidden">
      <SidebarGroup className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-[var(--sidebar-content-inset)]">
        {bridge == null ? (
          <p className="px-2 py-3 text-xs text-sidebar-muted-foreground">Loading pull requests…</p>
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-2">
              <div className="min-w-0 w-full">{bridge.searchInput}</div>
              <div className="flex w-full items-center gap-1.5">
                <div className="min-w-0 basis-0 flex-1 [&>button]:w-full">{bridge.sortMenu}</div>
                <div className="min-w-0 basis-0 flex-1 [&>button]:w-full">{bridge.filtersMenu}</div>
              </div>
            </div>

            <div
              ref={bridge.scrollRef}
              className="scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto"
            >
              <div className="pb-3">{bridge.listBody}</div>
            </div>
          </>
        )}
      </SidebarGroup>
    </SidebarContent>
  );
}
