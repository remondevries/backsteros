"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { moveTaskToProjectAction } from "@/lib/mutations/tasks";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { moveLocalTaskToProject } from "@/lib/sync/local-task-mutations";
import { getDisplayProjectIcon, ProjectOcticon } from "@/components/project-icon";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { PropertyDropdownNavigateRow } from "@/components/ui/property-dropdown-navigate-row";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { COMPOSE_NO_PROJECT_VALUE } from "@/lib/compose-task";
import type { AssignableProject } from "@/lib/projects/assignable-project";
import { getProjectHref } from "@/lib/entity-route-hrefs";
import { getTaskNavigationHrefAfterProjectChange } from "@/lib/navigation/preserve-section-href";

export type { AssignableProject } from "@/lib/projects/assignable-project";

type TaskProjectFieldProps = {
  taskId: string;
  projectId: string | null;
  status: string;
  projects: AssignableProject[];
  variant?: "property" | "list";
  shortcutAnchor?: boolean;
  disabled?: boolean;
};

export function TaskProjectField({
  taskId,
  projectId: initialProjectId,
  projects,
  variant = "property",
  shortcutAnchor = false,
  disabled = false }: TaskProjectFieldProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [prevInitialProjectId, setPrevInitialProjectId] = useState(initialProjectId);
  if (initialProjectId !== prevInitialProjectId) {
    setPrevInitialProjectId(initialProjectId);
    setProjectId(initialProjectId);
  }

  const options = useMemo(
    () => [
      {
        value: COMPOSE_NO_PROJECT_VALUE,
        label: "No project",
        searchTerms: "no project unassigned",
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(null)}
            size={14}
            className="text-foreground/70"
          />
        ) },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(project.icon)}
            size={14}
            className="text-foreground/70"
          />
        ) })),
    ],
    [projects],
  );

  const selectedValue = projectId ?? COMPOSE_NO_PROJECT_VALUE;

  function handleChange(nextValue: string) {
    if (disabled) return;

    const nextProjectId =
      nextValue === COMPOSE_NO_PROJECT_VALUE ? null : nextValue;

    if (nextProjectId === projectId) {
      return;
    }

    const previousProjectId = projectId;
    setProjectId(nextProjectId);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          moveLocalTaskToProject({
            taskId,
            projectId: nextProjectId,
          }),
        () =>
          moveTaskToProjectAction({
            taskId,
            projectId: nextProjectId,
          }),
      );

      if (!result.ok) {
        setProjectId(previousProjectId);
        setError(result.error);
        return;
      }

      if (variant === "list") {
        router.refresh();
        return;
      }

      if (result.taskNumber != null) {
        const nextHref = getTaskNavigationHrefAfterProjectChange(pathname, {
          projectKey: result.projectKey,
          contactKey: result.contactKey,
          taskNumber: result.taskNumber,
        });
        if (nextHref && nextHref !== pathname) {
          router.push(nextHref);
        }
      }

      router.refresh();
    });
  }

  if (projects.length === 0 && !disabled) {
    return (
      <p className="px-1 text-[13px] leading-snug text-foreground/50">
        Create a{" "}
        <Link href="/projects/new" className="text-foreground/70 underline">
          project
        </Link>{" "}
        to assign this task.
      </p>
    );
  }

  const selectedProject = projectId
    ? projects.find((project) => project.id === projectId)
    : undefined;
  const displayLabel = selectedProject?.name ?? "No project";
  const displayIcon = getDisplayProjectIcon(selectedProject?.icon ?? null);

  if (variant === "list") {
    return (
      <div className="flex max-w-[8rem] flex-col">
        <SearchableDropdown
          value={selectedValue}
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="Change project…"
          searchShortcutLabel="⇧P"
          ariaLabel={`Change project: ${displayLabel}`}
          taskPropertyDropdownId="project"
          className="inline-flex max-w-full min-w-0"
          panelWidth={280}
          panelAlign="end"
          renderTrigger={({ open, disabled, triggerId, onToggle }) => (
            <button
              type="button"
              id={triggerId}
              title={displayLabel}
              className={`inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-full border-0 bg-transparent p-0 text-xs leading-none transition-colors hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-55 ${
                isHovered || open ? "text-foreground/70" : "text-foreground/50"
              }`}
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Change project: ${displayLabel}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggle();
              }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onFocus={() => setIsHovered(true)}
              onBlur={() => setIsHovered(false)}
            >
              <ProjectOcticon
                icon={displayIcon}
                size={12}
                className="shrink-0 text-foreground/70"
              />
              <span className="truncate">{displayLabel}</span>
            </button>
          )}
        />
        {error ? (
          <p className="text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <PropertyDropdownNavigateRow
        navigateHref={
          selectedProject ? getProjectHref({ key: selectedProject.key }) : null
        }
        navigateLabel={
          selectedProject ? `Open project ${selectedProject.name}` : undefined
        }
      >
        <PropertyDropdown
          value={selectedValue}
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="Change project…"
          searchShortcutLabel="⇧P"
          ariaLabel="Change project"
          taskPropertyDropdownId="project"
          shortcutAnchor={shortcutAnchor}
          fallbackIcon={
            <ProjectOcticon
              icon={getDisplayProjectIcon(null)}
              size={14}
              className="text-foreground/70"
            />
          }
          fallbackLabel="No project"
          mutedFallback
          panelAlign="start"
        />
      </PropertyDropdownNavigateRow>
      {error ? (
        <p className="px-1 text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
