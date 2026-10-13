import {
  CheckIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GlobeIcon,
  Link2Icon,
  TimerIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import type { DiscoveredDeployment, DiscoveredSite } from "./hetznerApi";

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) {
    return rem === 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${minutes}m ${rem}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

function formatDurationShort(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
}

function statusLabel(status: DiscoveredDeployment["status"]): string {
  if (status === "success") return "Deployed";
  if (status === "running") return "Deploying";
  return "Failed";
}

function LogLines({ text }: { readonly text: string }) {
  const lines = text.trim() ? text.replace(/\r\n/g, "\n").split("\n") : ["(no output)"];
  return (
    <pre className="max-h-[28rem] overflow-auto rounded-lg border border-border/60 bg-background/60 p-4 font-mono text-[12px] leading-5 text-muted-foreground">
      {lines.map((line, index) => {
        const success =
          /build ready|exit code 0|successfully|done\./iu.test(line) ||
          line.includes("Build ready to be deployed");
        const fail = /fatal:|error:|failed|exit code [1-9]/iu.test(line);
        return (
          <div
            key={`${index}-${line.slice(0, 24)}`}
            className={cn(
              "whitespace-pre-wrap break-all",
              success ? "text-[#3d9a6a]" : fail ? "text-[#c45c5c]" : null,
            )}
          >
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

function LogPanel({
  title,
  ok,
  durationLabel,
  open,
  onOpenChange,
  children,
}: {
  readonly title: string;
  readonly ok: boolean;
  readonly durationLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/20">
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-white",
              ok ? "bg-[#3d9a6a]" : "bg-[#c45c5c]",
            )}
            aria-hidden
          >
            {ok ? (
              <CheckIcon className="size-3 stroke-[2.5]" />
            ) : (
              <XIcon className="size-3 stroke-[2.5]" />
            )}
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</span>
          <span className="text-sm text-muted-foreground">{durationLabel}</span>
          <ChevronDownIcon
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/60 px-4 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function buildLogText(entry: DiscoveredDeployment, site: DiscoveredSite): string {
  if (entry.buildOutput?.trim()) return entry.buildOutput;
  const commit = entry.commit ?? entry.version ?? "unknown";
  const lines = [
    "==> Warming up deployment workers",
    `==> Preparing to deploy ${site.domain} for commit ${commit}`,
  ];
  if (entry.status === "success") {
    lines.push("==> Build ready to be deployed");
  } else if (entry.status === "failed") {
    lines.push("==> Build step finished with errors (see deployment logs)");
  } else if (entry.status === "running") {
    lines.push("==> Build in progress…");
  } else {
    lines.push("==> Build skipped");
  }
  return lines.join("\n");
}

/**
 * Forge-style deployment detail view for an overview commit row.
 */
export function DeploymentDetailsView({
  entry,
  site,
  visitUrl,
  onBack,
}: {
  readonly entry: DiscoveredDeployment;
  readonly site: DiscoveredSite;
  readonly visitUrl: string | null;
  readonly onBack: () => void;
}) {
  const [buildOpen, setBuildOpen] = useState(true);
  const [deployOpen, setDeployOpen] = useState(true);

  const via = entry.via ?? (entry.meta.includes("Kamal") ? "Kamal" : "Custom");
  const relative = formatRelativeTimeLabel(entry.at) || "just now";
  const durationMs =
    entry.durationMs ??
    (entry.startedAt && entry.finishedAt
      ? Math.max(0, Date.parse(entry.finishedAt) - Date.parse(entry.startedAt))
      : null);
  const deployOutput = entry.output?.trim() || "(no deployment output recorded)";
  const buildText = useMemo(() => buildLogText(entry, site), [entry, site]);
  const buildOk = entry.status !== "failed";
  const deployOk = entry.status === "success";
  const shortHash = entry.commit ?? entry.id.replace(/^wp-job:/u, "").slice(0, 7);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="text-left text-xl font-semibold tracking-tight text-foreground hover:opacity-90"
          >
            Deployment details
            <span className="font-normal text-muted-foreground"> · {shortHash}</span>
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full text-white",
                  entry.status === "success"
                    ? "bg-[#3d9a6a]"
                    : entry.status === "running"
                      ? "bg-[#3b5bdb]"
                      : "bg-[#c45c5c]",
                )}
                aria-hidden
              >
                {entry.status === "failed" ? (
                  <XIcon className="size-2.5 stroke-[2.5]" />
                ) : (
                  <CheckIcon className="size-2.5 stroke-[2.5]" />
                )}
              </span>
              <span className="text-foreground">{statusLabel(entry.status)}</span>
            </span>
            {entry.branch ? (
              <span className="inline-flex items-center gap-1.5">
                <GitBranchIcon className="size-3.5 opacity-70" aria-hidden />
                <span className="rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-foreground/90">
                  {entry.branch}
                </span>
              </span>
            ) : null}
            <span className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5">
              <GitCommitHorizontalIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{entry.summary}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Link2Icon className="size-3.5 opacity-70" aria-hidden />
              <span>{via}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-3.5 opacity-70" aria-hidden />
              <span>{relative}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TimerIcon className="size-3.5 opacity-70" aria-hidden />
              <span>{formatDuration(durationMs)}</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {visitUrl ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                window.open(visitUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <GlobeIcon className="size-4" />
              Visit
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Expand or collapse log panels"
            onClick={() => {
              const next = !(buildOpen && deployOpen);
              setBuildOpen(next);
              setDeployOpen(next);
            }}
          >
            <ChevronsUpDownIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <LogPanel
          title="Build logs"
          ok={buildOk}
          durationLabel={formatDurationShort(
            entry.buildDurationMs ?? Math.min(durationMs ?? 1000, 1000),
          )}
          open={buildOpen}
          onOpenChange={setBuildOpen}
        >
          <LogLines text={buildText} />
        </LogPanel>
        <LogPanel
          title="Deployment logs"
          ok={deployOk || entry.status === "running"}
          durationLabel={formatDurationShort(durationMs)}
          open={deployOpen}
          onOpenChange={setDeployOpen}
        >
          <LogLines text={deployOutput} />
        </LogPanel>
      </div>
    </div>
  );
}
