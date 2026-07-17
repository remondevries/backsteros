"use client";

import type {
  Letter as ApiLetter,
  Project as ApiProject,
} from "@backsteros/contracts";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { LetterComposeView } from "@/components/letters/letter-compose-view";
import { LetterDetailSkeleton } from "@/components/letters/letter-detail-skeleton";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { useApiResource } from "@/lib/api-context";
import { normalizeLetter, normalizeProject } from "@/lib/entity-normalize";
import { getFirstLetterInListOrder } from "@/lib/letters/group-letters-by-status";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectLetterHref,
} from "@/lib/project-route-scope";
import { projectMatchesRouteParam } from "@/lib/project-sections";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { preferLocalOrApi } from "@/lib/sync/prefer-local-or-api";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

type ProjectLettersIndexScreenProps = {
  projectParam: string;
  organizationRouteParam?: string;
};

/** Circle project letters index: open first letter, or empty pane without ProjectNav. */
export function ProjectLettersIndexScreen({
  projectParam,
  organizationRouteParam,
}: ProjectLettersIndexScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const scope = getProjectRouteScopeFromPathname(pathname);

  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const localProjects = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM projects WHERE deleted_at IS NULL",
  );

  const project = useMemo(() => {
    const rows = preferLocalOrApi(
      localProjects.data?.map((row) => snakeRow(row) as ApiProject),
      projectsResource.data?.projects,
    );
    const match = rows.find((entry) =>
      projectMatchesRouteParam(entry, projectParam),
    );
    return match ? normalizeProject(match) : null;
  }, [localProjects.data, projectParam, projectsResource.data]);

  const projectId = project?.id ?? null;

  const resource = useApiResource<{ letters: ApiLetter[] }>(
    (client) =>
      projectId
        ? client.requestJson(
            `/api/v1/letters?projectId=${encodeURIComponent(projectId)}`,
          )
        : Promise.resolve({ letters: [] as ApiLetter[] }),
    [projectId],
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    projectId
      ? "SELECT * FROM letters WHERE deleted_at IS NULL AND project_id = ? ORDER BY sort_order, updated_at DESC"
      : null,
    projectId ? [projectId] : [],
  );

  const letters = useMemo(() => {
    const rows = preferLocalOrApi(
      local.data?.map((row) => snakeRow(row) as ApiLetter),
      resource.data?.letters,
    );
    return rows.map(normalizeLetter);
  }, [local.data, resource.data]);

  const first = getFirstLetterInListOrder(letters) ?? null;

  useEffect(() => {
    if (!first || first.number == null || !project) return;
    router.replace(getScopedProjectLetterHref(project.key, first.number, scope));
  }, [first, project, router, scope]);

  const loading =
    (projectsResource.loading && !localProjects.data) ||
    (Boolean(projectId) && resource.loading && !local.data);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ProjectRouteBreadcrumb
        projectRouteParam={projectParam}
        organizationRouteParam={organizationRouteParam}
      />
      {loading || first ? (
        <LetterDetailSkeleton />
      ) : project ? (
        <LetterComposeView
          initialProjectId={project.id}
          projectNavigate={{ projectKey: project.key, scope }}
          registerBreadcrumb={false}
        />
      ) : null}
    </div>
  );
}
