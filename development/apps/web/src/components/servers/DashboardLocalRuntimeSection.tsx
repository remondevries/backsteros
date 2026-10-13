import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ProjectOcticon } from "../../backsteros/ProjectOcticon";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  fetchLocalRuntimeDashboard,
  mutateLocalRuntime,
  type DashboardRuntimeProject,
  type LocalRuntimeContainer,
  type LocalRuntimeDashboardResponse,
} from "./hetznerApi";
import { SoftStartIcon, SoftStartingIcon, SoftStopIcon } from "./SoftStopIcon";

function ProjectGroupAvatar({
  accent,
  initial,
  icon,
}: {
  readonly accent: string | null;
  readonly initial: string | null;
  readonly icon: string | null;
}) {
  if (icon) {
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/70 text-foreground"
        aria-hidden
      >
        <ProjectOcticon icon={icon} type="codebase" size={14} />
      </span>
    );
  }
  if (accent && initial) {
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white"
        style={{ backgroundColor: accent }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }
  return null;
}

function projectLabel(project: DashboardRuntimeProject): string {
  if (project.key) return `${project.name} · ${project.key}`;
  return project.name;
}

function statusLine(project: DashboardRuntimeProject): string {
  if (project.runningCount > 0 && project.stoppedCount > 0) {
    return `${project.runningCount} running · ${project.stoppedCount} stopped`;
  }
  if (project.runningCount > 0) {
    return `${project.runningCount} running`;
  }
  if (project.composeFile) {
    return project.composeSource === "auto"
      ? "Compose ready · not running"
      : "Attached · not running";
  }
  if (project.canStart) return "Ready to start";
  return "No local stack configured";
}

/**
 * Servers → Dashboard: every local codebase project with Start/Stop for its
 * compose stack (auto-discovered or attached).
 */
export function DashboardLocalRuntimeSection() {
  const [data, setData] = useState<LocalRuntimeDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"running" | "all">("running");
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const apply = useCallback((next: LocalRuntimeDashboardResponse) => {
    setData(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchLocalRuntimeDashboard();
      if (!next.ok && next.error) {
        setError(next.error);
        setData(next);
        return;
      }
      apply(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load local runtime");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projects = data?.projects ?? [];
  const unmatchedRunning = data?.unmatchedRunning ?? [];

  const visibleProjects = useMemo(() => {
    if (filter === "all") return projects;
    return projects.filter((project) => project.runningCount > 0);
  }, [filter, projects]);

  const toggleExpanded = useCallback((projectId: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const toggleProject = useCallback(
    async (project: DashboardRuntimeProject) => {
      const shouldStop = project.runningCount > 0;
      if (shouldStop && !project.canStop) return;
      if (!shouldStop && !project.canStart) return;

      setBusyKey(project.projectId);
      setError(null);
      try {
        const next = await mutateLocalRuntime({
          projectId: project.projectId,
          action: shouldStop ? "stopProject" : "startProject",
        });
        if (!next.ok) {
          setError(next.error ?? next.message ?? "Action failed");
          if (next.projects) apply(next);
          return;
        }
        apply(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Action failed");
      } finally {
        setBusyKey(null);
      }
    },
    [apply],
  );

  const toggleContainer = useCallback(
    async (container: LocalRuntimeContainer) => {
      const running = container.state === "running";
      setBusyKey(`c:${container.name}`);
      setError(null);
      try {
        const next = await mutateLocalRuntime({
          action: running ? "stopContainer" : "startContainer",
          container: container.name,
        });
        if (!next.ok) {
          setError(next.error ?? next.message ?? "Action failed");
          if (next.projects) apply(next);
          return;
        }
        apply(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Action failed");
      } finally {
        setBusyKey(null);
      }
    },
    [apply],
  );

  const dockerAvailable = data?.dockerAvailable ?? false;
  const runningCount = data?.runningCount ?? 0;
  const projectCount = data?.projectCount ?? 0;
  const activeProjectCount = data?.activeProjectCount ?? 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">Local runtime</h3>
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            Every local codebase — start/stop its compose stack from here
            {dockerAvailable && filter === "running" && activeProjectCount > 0
              ? ` · ${activeProjectCount} active · ${runningCount} containers`
              : null}
            {dockerAvailable && filter === "all" && projectCount > 0
              ? ` · ${projectCount} projects`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/60 p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                filter === "running"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setFilter("running")}
            >
              Running
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                filter === "all"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setFilter("all")}
            >
              All
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || busyKey != null}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40 divide-y divide-border/60">
        {error ? <div className="px-4 py-3 text-sm text-destructive">{error}</div> : null}

        {!dockerAvailable ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Docker / OrbStack not available</p>
            <p className="mt-1.5 leading-relaxed">
              {data?.dockerError ??
                "Install OrbStack or Docker Desktop and ensure `docker` is on PATH."}
            </p>
            {filter === "all" && visibleProjects.length > 0 ? (
              <p className="mt-3 text-xs">Projects still listed below — Start needs Docker.</p>
            ) : null}
          </div>
        ) : null}

        {loading && visibleProjects.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading local projects…</div>
        ) : visibleProjects.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {filter === "running"
              ? "No project stacks running. Switch to All to start one."
              : "No local codebase projects yet."}
          </div>
        ) : (
          visibleProjects.map((project) => {
            const shouldStop = project.runningCount > 0;
            const busy = busyKey === project.projectId;
            const expanded = expandedKeys.has(project.projectId);
            const actionDisabled =
              busyKey != null || (shouldStop ? !project.canStop : !project.canStart);

            return (
              <div key={project.projectId}>
                <div className="flex flex-wrap items-center gap-2 bg-muted/20 px-4 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggleExpanded(project.projectId)}
                    aria-expanded={expanded}
                  >
                    <ChevronRightIcon
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-90",
                      )}
                      aria-hidden
                    />
                    <ProjectGroupAvatar
                      accent={project.accent}
                      initial={project.initial}
                      icon={project.icon}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/servers/local/$projectId"
                        params={{ projectId: project.projectId }}
                        search={{ section: "development" }}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {projectLabel(project)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{statusLine(project)}</div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionDisabled}
                    title={
                      !project.canStart && !shouldStop
                        ? "Add docker-compose.yml near the project cwd, or attach a service under Development"
                        : undefined
                    }
                    onClick={() => void toggleProject(project)}
                  >
                    {busy ? (
                      <SoftStartingIcon />
                    ) : shouldStop ? (
                      <SoftStopIcon />
                    ) : (
                      <SoftStartIcon />
                    )}
                    {busy
                      ? shouldStop
                        ? "Stopping…"
                        : "Starting…"
                      : shouldStop
                        ? "Stop"
                        : "Start"}
                  </Button>
                </div>
                {expanded ? (
                  <ul className="divide-y divide-border/50">
                    {project.containers.length === 0 ? (
                      <li className="px-4 py-3 ps-10 text-sm text-muted-foreground">
                        {project.composeFile ? (
                          <>
                            No containers yet. Start uses{" "}
                            <code className="font-mono text-xs text-foreground/80">
                              {project.composeFile}
                            </code>
                            .
                          </>
                        ) : (
                          <>
                            No compose file found near the working directory. Attach one under{" "}
                            <Link
                              to="/servers/local/$projectId"
                              params={{ projectId: project.projectId }}
                              search={{ section: "development" }}
                              className="underline underline-offset-2 hover:text-foreground"
                            >
                              Development
                            </Link>
                            .
                          </>
                        )}
                      </li>
                    ) : (
                      project.containers.map((container) => {
                        const running = container.state === "running";
                        const containerBusy = busyKey === `c:${container.name}`;
                        return (
                          <li
                            key={container.id}
                            className="flex flex-wrap items-center gap-3 px-4 py-3 ps-10"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-mono text-sm text-foreground">
                                  {container.name}
                                </span>
                                <Badge
                                  variant={running ? "default" : "secondary"}
                                  className="capitalize"
                                >
                                  {container.state}
                                </Badge>
                                {container.composeService ? (
                                  <span className="text-xs text-muted-foreground">
                                    {container.composeService}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {container.image}
                                {container.ports ? ` · ${container.ports}` : ""}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyKey != null}
                              onClick={() => void toggleContainer(container)}
                            >
                              {containerBusy ? (
                                <SoftStartingIcon />
                              ) : running ? (
                                <SoftStopIcon />
                              ) : (
                                <SoftStartIcon />
                              )}
                              {containerBusy
                                ? running
                                  ? "Stopping…"
                                  : "Starting…"
                                : running
                                  ? "Stop"
                                  : "Start"}
                            </Button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}

        {filter === "running" && unmatchedRunning.length > 0 ? (
          <div>
            <div className="bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
              Unmatched · {unmatchedRunning.length} running
            </div>
            <ul className="divide-y divide-border/50">
              {unmatchedRunning.map((container) => {
                const containerBusy = busyKey === `c:${container.name}`;
                return (
                  <li key={container.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm text-foreground">
                        {container.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {container.composeProject ?? container.image}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey != null}
                      onClick={() => void toggleContainer(container)}
                    >
                      {containerBusy ? <SoftStartingIcon /> : <SoftStopIcon />}
                      {containerBusy ? "Stopping…" : "Stop"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {dockerAvailable && data?.dockerEngine ? (
          <div className="px-4 py-2 text-xs text-muted-foreground">Engine: {data.dockerEngine}</div>
        ) : null}
      </div>
    </section>
  );
}
