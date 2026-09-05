import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { BacksterosProjectStatusIcon } from "~/backsteros/ProjectStatusIcon";
import {
  groupBacksterosProjectsByStatus,
  type BacksterosProjectStatus,
} from "~/backsteros/projectStatus";
import type { BacksterosCodebaseProject } from "~/backsteros/types";
import type { BacksterosCodebaseProjectsState } from "~/backsteros/useBacksterosCodebaseProjects";
import { matchesBacksterosSearchQuery } from "~/backsteros/searchQuery";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";

function projectSubtitle(project: BacksterosCodebaseProject): string | null {
  return project.githubRepository ?? project.localWorkingDirectory ?? project.summary;
}

function BacksterosProjectRow(props: {
  readonly project: BacksterosCodebaseProject;
  readonly selected: boolean;
  readonly onSelect: (project: BacksterosCodebaseProject) => void;
}) {
  const { project, selected, onSelect } = props;
  const subtitle = projectSubtitle(project);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(project)}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          selected
            ? "bg-sidebar-row-active text-sidebar-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-row-hover",
        )}
      >
        <BacksterosProjectStatusIcon
          status={project.status}
          size={14}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{project.name}</span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function BacksterosStatusGroup(props: {
  readonly label: string;
  readonly projects: readonly BacksterosCodebaseProject[];
  readonly collapsed: boolean;
  readonly selectedProjectId: string | null;
  readonly onToggle: () => void;
  readonly onSelectProject: (project: BacksterosCodebaseProject) => void;
}) {
  const { label, projects, collapsed, selectedProjectId, onToggle, onSelectProject } = props;
  return (
    <li className="flex flex-col gap-px">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
      >
        <span className="min-w-0 flex-1 truncate normal-case tracking-normal">{label}</span>
        <span className="tabular-nums text-muted-foreground/70">{projects.length}</span>
        <ChevronDownIcon
          className={cn("size-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")}
          aria-hidden
        />
      </button>
      {collapsed ? null : (
        <ul role="list" className="flex flex-col gap-px">
          {projects.map((project) => (
            <BacksterosProjectRow
              key={project.id}
              project={project}
              selected={project.id === selectedProjectId}
              onSelect={onSelectProject}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BacksterosProjectList(props: {
  readonly state: BacksterosCodebaseProjectsState;
  readonly selectedProjectId?: string | null;
  readonly searchQuery?: string;
  readonly onRetry: () => void;
  readonly onSelectProject: (project: BacksterosCodebaseProject) => void;
}) {
  const { state, selectedProjectId = null, searchQuery = "", onRetry, onSelectProject } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<BacksterosProjectStatus>>(
    () => new Set(),
  );
  const isSearching = searchQuery.trim().length > 0;

  const filteredProjects = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!isSearching) return state.projects;
    return state.projects.filter((project) =>
      matchesBacksterosSearchQuery(
        [
          project.name,
          project.key,
          project.summary,
          project.githubRepository,
          project.localWorkingDirectory,
        ],
        searchQuery,
      ),
    );
  }, [isSearching, searchQuery, state]);

  const groups = useMemo(
    () => groupBacksterosProjectsByStatus(filteredProjects),
    [filteredProjects],
  );

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-muted-foreground/60">
        <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
        <span>Loading BacksterOS codebases…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 px-3 py-8 text-center text-xs text-muted-foreground">
        <p className="max-w-[18rem] text-balance">{state.message}</p>
        <Button type="button" size="xs" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.projects.length === 0) {
    return (
      <div className="px-2 py-8 text-center text-xs text-muted-foreground/60">
        No BacksterOS projects with type <span className="font-medium">codebase</span>
      </div>
    );
  }

  if (isSearching && filteredProjects.length === 0) {
    return (
      <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
        No projects found
      </p>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-2 px-1 pb-2">
      {groups.map((group) => (
        <BacksterosStatusGroup
          key={group.status}
          label={group.label}
          projects={group.projects}
          collapsed={!isSearching && collapsed.has(group.status)}
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
          onToggle={() =>
            setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(group.status)) next.delete(group.status);
              else next.add(group.status);
              return next;
            })
          }
        />
      ))}
    </ul>
  );
}
