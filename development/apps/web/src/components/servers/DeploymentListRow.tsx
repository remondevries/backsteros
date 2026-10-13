import { ArrowUpRightIcon, CheckIcon, GitCommitHorizontalIcon, XIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import type { DiscoveredDeployment } from "./hetznerApi";

function deploymentVia(entry: DiscoveredDeployment): string {
  return entry.via ?? (entry.meta.includes("Kamal") ? "Kamal" : "Custom");
}

/**
 * Forge-style deployment row shared by app overview and servers dashboard.
 */
export function DeploymentListRow({
  entry,
  onSelect,
  showSite = false,
}: {
  readonly entry: DiscoveredDeployment;
  readonly onSelect?: ((entry: DiscoveredDeployment) => void) | undefined;
  readonly showSite?: boolean | undefined;
}) {
  const via = deploymentVia(entry);
  const relative = formatRelativeTimeLabel(entry.at) || "just now";
  const summary = showSite ? `${entry.siteDomain} — ${entry.summary}` : entry.summary;
  const interactive = typeof onSelect === "function";

  const body = (
    <>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-white",
          entry.status === "success"
            ? "bg-[#3d9a6a]"
            : entry.status === "running"
              ? "bg-[#3b5bdb]"
              : "bg-[#c45c5c]",
        )}
        aria-label={entry.status}
      >
        {entry.status === "success" ? (
          <CheckIcon className="size-3 stroke-[2.5]" />
        ) : entry.status === "running" ? (
          <ArrowUpRightIcon className="size-3 animate-pulse" />
        ) : (
          <XIcon className="size-3 stroke-[2.5]" />
        )}
      </span>

      <span className="w-[4.5rem] shrink-0 truncate font-mono text-[13px] text-foreground">
        {entry.commit ?? "—"}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2 basis-[12rem] sm:basis-auto">
        <GitCommitHorizontalIcon
          className="size-3.5 shrink-0 text-muted-foreground/70"
          aria-hidden
        />
        <span className="truncate text-sm text-muted-foreground">{summary}</span>
      </div>

      <div className="ml-7 flex min-w-0 shrink-0 items-center gap-1.5 text-sm text-muted-foreground sm:ml-0">
        <span>Deployed from</span>
        {entry.branch ? (
          <span className="rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-foreground/90">
            {entry.branch}
          </span>
        ) : null}
        <span>{relative}</span>
        <span>via</span>
        <span className="text-foreground">{via}</span>
      </div>
    </>
  );

  const className =
    "flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-3.5 text-left sm:flex-nowrap sm:gap-x-4";

  if (!interactive) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cn(className, "transition-colors hover:bg-muted/30")}
    >
      {body}
    </button>
  );
}

export function DeploymentsList({
  deployments,
  onSelect,
  showSite = false,
  className,
}: {
  readonly deployments: readonly DiscoveredDeployment[];
  readonly onSelect?: ((entry: DiscoveredDeployment) => void) | undefined;
  readonly showSite?: boolean | undefined;
  readonly className?: string | undefined;
}) {
  return (
    <ul className={cn("px-2 py-1 sm:px-3", className)}>
      {deployments.map((entry) => (
        <li key={entry.id}>
          <DeploymentListRow entry={entry} onSelect={onSelect} showSite={showSite} />
        </li>
      ))}
    </ul>
  );
}
