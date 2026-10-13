import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBacksterosCodebaseProjects } from "../../backsteros/client";
import { ProjectOcticon } from "../../backsteros/ProjectOcticon";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "../../backsteros/SearchablePropertyMenu";
import type { BacksterosCodebaseProject } from "../../backsteros/types";
import { fetchAppProjectLink, updateAppProjectLink, type AppProjectLink } from "./hetznerApi";
import "../../backsteros/backsterosPropertyMenu.css";

const CLEAR_PROJECT_VALUE = "__none__";

/**
 * Overview → Details row: link this app to a BacksterOS codebase project
 * so deploy/monitor support tickets land on the right project board.
 */
export function AppProjectLinkDetailsRow({
  serverId,
  service,
}: {
  readonly serverId: string;
  readonly service: string;
}) {
  const [link, setLink] = useState<AppProjectLink | null>(null);
  const [projects, setProjects] = useState<readonly BacksterosCodebaseProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAppProjectLink(serverId, service);
      if (!data.ok || !data.link) {
        setError(data.error ?? "Failed to load project link");
        setLink(null);
        return;
      }
      setLink(data.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load project link");
      setLink(null);
    }
  }, [serverId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setProjectsLoading(true);
    setProjectsError(null);
    let cancelled = false;
    void fetchBacksterosCodebaseProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((cause) => {
        if (cancelled) return;
        setProjects([]);
        setProjectsError(
          cause instanceof Error ? cause.message : "Failed to load BacksterOS projects",
        );
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(() => {
    const id = link?.projectId;
    if (!id) return null;
    return projects.find((project) => project.id === id) ?? null;
  }, [link?.projectId, projects]);

  const projectOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    const none: BacksterosSearchablePropertyOption = {
      value: CLEAR_PROJECT_VALUE,
      label: "No project",
      searchText: "none clear unset",
      icon: <ProjectOcticon icon={null} type="codebase" size={14} className="opacity-70" />,
    };
    const rows = projects.map((project, index) => ({
      value: project.id,
      label: project.name,
      searchText: [project.name, project.key, project.githubRepository].filter(Boolean).join(" "),
      icon: <ProjectOcticon icon={project.icon} type={project.type} size={14} />,
      separatorBefore: index === 0,
    }));
    return [none, ...rows];
  }, [projects]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const data = await updateAppProjectLink({ serverId, service, ...body });
      if (!data.ok || !data.link) {
        throw new Error(data.error ?? "Failed to save project link");
      }
      setLink(data.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save project link");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  const label = projectsLoading
    ? "Loading projects…"
    : selectedProject
      ? selectedProject.name
      : link?.projectName
        ? link.projectName
        : "Select a project";

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="shrink-0 pt-1 text-muted-foreground">Project</span>
        <div className="flex min-w-0 flex-col items-end gap-1">
          <BacksterosSearchablePropertyMenu
            label={label}
            icon={
              selectedProject ? (
                <ProjectOcticon icon={selectedProject.icon} type={selectedProject.type} size={14} />
              ) : (
                <ProjectOcticon icon={null} type="codebase" size={14} className="opacity-70" />
              )
            }
            value={link?.projectId ?? CLEAR_PROJECT_VALUE}
            options={projectOptions}
            searchPlaceholder="Search projects…"
            ariaLabel="Linked BacksterOS project"
            disabled={busy || projectsLoading || !link}
            muted={!link?.projectId}
            onChange={(value) => {
              if (value === CLEAR_PROJECT_VALUE) {
                void patch({ projectId: null, projectName: null, projectKey: null });
                return;
              }
              const project = projects.find((entry) => entry.id === value);
              void patch({
                projectId: value,
                projectName: project?.name ?? null,
                projectKey: project?.key ?? null,
              });
            }}
          />
          {projectsError ? <p className="text-xs text-destructive">{projectsError}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
