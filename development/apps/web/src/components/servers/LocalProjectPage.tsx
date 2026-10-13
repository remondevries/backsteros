import { Link } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { WorkspacePageFrame } from "../WorkspacePageContainer";
import { LocalProjectRuntimePanel } from "./LocalProjectRuntimePanel";
import { ProjectSecretsSettings } from "./ProjectSecretsSettings";
import type { LocalProjectRecord } from "./hetznerApi";

export type LocalProjectSectionId = "overview" | "deployments" | "secrets" | "development";

export function isLocalProjectSectionId(value: unknown): value is LocalProjectSectionId {
  return (
    value === "overview" ||
    value === "deployments" ||
    value === "secrets" ||
    value === "development"
  );
}

const LOCAL_PROJECT_NAV = [
  { id: "overview", label: "Overview" },
  { id: "deployments", label: "Deployments" },
  { id: "secrets", label: "Secrets" },
  { id: "development", label: "Development" },
] as const satisfies readonly { readonly id: LocalProjectSectionId; readonly label: string }[];

function displayTitle(project: LocalProjectRecord | null, projectId: string): string {
  if (!project) return projectId;
  if (project.name && project.name !== projectId && project.name !== projectId.slice(0, 8)) {
    return project.key ? `${project.name} · ${project.key}` : project.name;
  }
  if (project.key) return project.key;
  return project.name || projectId;
}

function PlaceholderPanel({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="border-b border-border/60 px-6 py-5">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="px-6 py-10 text-center text-sm text-muted-foreground">
        Coming soon for local projects.
      </div>
    </section>
  );
}

function OverviewPanel({ project }: { readonly project: LocalProjectRecord | null }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="border-b border-border/60 px-6 py-5">
        <h3 className="text-base font-medium text-foreground">Overview</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Local development project identity and paths.
        </p>
      </div>
      <dl className="divide-y divide-border/60 text-sm">
        <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium text-foreground">{project?.name ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Key</dt>
          <dd className="font-mono text-xs text-foreground">{project?.key ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Project id</dt>
          <dd className="truncate font-mono text-xs text-foreground">
            {project?.projectId ?? "—"}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Working directory</dt>
          <dd className="truncate font-mono text-xs text-foreground">
            {project?.localWorkingDirectory ?? "—"}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-muted-foreground">Secrets folder</dt>
          <dd className="text-foreground">
            {project?.hasSecretsFolder ? "Present" : "Not created yet"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Local sidebar → project workspace with section nav (overview / deploy / secrets / dev).
 */
export function LocalProjectPage({
  projectId,
  project,
  loading = false,
  section = "overview",
}: {
  readonly projectId: string;
  readonly project: LocalProjectRecord | null;
  readonly loading?: boolean;
  readonly section?: LocalProjectSectionId;
}) {
  const title = displayTitle(project, projectId);
  const initial =
    project?.initial ??
    project?.key?.[0]?.toUpperCase() ??
    project?.name?.[0]?.toUpperCase() ??
    "?";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <WorkspacePageFrame width="expanded" className="flex flex-col gap-6 py-6">
        <div className="flex items-center gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: project?.accent ?? "#5b8def" }}
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {loading && !project ? "Loading…" : title}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Local development project
              {project?.localWorkingDirectory ? (
                <>
                  {" "}
                  ·{" "}
                  <code className="font-mono text-xs text-foreground/80">
                    {project.localWorkingDirectory}
                  </code>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:gap-14">
          <aside className="min-w-0">
            <nav aria-label="Local project" className="flex flex-col gap-1.5">
              {LOCAL_PROJECT_NAV.map((item) => {
                const active = item.id === section;
                return (
                  <Link
                    key={item.id}
                    to="/servers/local/$projectId"
                    params={{ projectId }}
                    search={{ section: item.id }}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-4">
            {section === "overview" ? <OverviewPanel project={project} /> : null}
            {section === "deployments" ? (
              <PlaceholderPanel
                title="Deployments"
                description="Deploy history and release actions for this local codebase."
              />
            ) : null}
            {section === "secrets" ? (
              <ProjectSecretsSettings fixedProjectId={projectId} hideProjectPicker />
            ) : null}
            {section === "development" ? <LocalProjectRuntimePanel projectId={projectId} /> : null}
          </div>
        </div>
      </WorkspacePageFrame>
    </div>
  );
}
