"use client";

import type {
  Document as ApiDocument,
  Project as ApiProject,
} from "@backsteros/contracts";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { DocumentDetailSkeleton } from "@/components/documents/document-detail-skeleton";
import { DocumentsEmptyCreatePrompt } from "@/components/documents/documents-empty-create-prompt";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { useApiResource } from "@/lib/api-context";
import { getProjectDocumentHref } from "@/lib/document-navigation-path";
import { normalizeProject } from "@/lib/entity-normalize";
import { getProjectRouteScopeFromPathname } from "@/lib/project-route-scope";
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

type ProjectDocumentsIndexScreenProps = {
  projectParam: string;
  organizationRouteParam?: string;
};

/** Circle project documents index: open first doc, or empty pane without ProjectNav. */
export function ProjectDocumentsIndexScreen({
  projectParam,
  organizationRouteParam,
}: ProjectDocumentsIndexScreenProps) {
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

  const resource = useApiResource<{ documents: ApiDocument[] }>(
    (client) =>
      projectId
        ? client.requestJson(
            `/api/v1/documents?type=project&projectId=${encodeURIComponent(projectId)}`,
          )
        : Promise.resolve({ documents: [] as ApiDocument[] }),
    [projectId],
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    projectId
      ? "SELECT * FROM documents WHERE deleted_at IS NULL AND type = 'project' AND project_id = ? ORDER BY sort_order, path, updated_at DESC"
      : null,
    projectId ? [projectId] : [],
  );

  const documents = useMemo(() => {
    const rows = preferLocalOrApi(
      local.data?.map((row) => snakeRow(row) as ApiDocument),
      resource.data?.documents,
    );
    return [...rows].sort((a, b) =>
      (a.path || a.title || "").localeCompare(b.path || b.title || "", undefined, {
        sensitivity: "base",
      }),
    );
  }, [local.data, resource.data]);

  const first = documents[0] ?? null;

  useEffect(() => {
    if (!first || !project) return;
    router.replace(
      getProjectDocumentHref(project.key, first.path || first.id, scope),
    );
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
        <DocumentDetailSkeleton />
      ) : project ? (
        <DocumentsEmptyCreatePrompt
          variant="project"
          projectId={project.id}
          projectKey={project.key}
          scope={scope}
        />
      ) : null}
    </div>
  );
}
