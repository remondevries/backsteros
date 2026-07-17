"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { moveLetterToProjectAction } from "@/lib/mutations/letters";
import { moveLocalLetterToProject } from "@/lib/sync/local-letter-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  getDisplayProjectIcon,
  ProjectOcticon } from "@/components/project-icon";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { PropertyDropdownNavigateRow } from "@/components/ui/property-dropdown-navigate-row";
import { getProjectHref } from "@/lib/entity-route-hrefs";

export type AssignableProject = {
  id: string;
  name: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type LetterProjectFieldProps = {
  letterId: string;
  projectId: string | null;
  projects: AssignableProject[];
};

export function LetterProjectField({
  letterId,
  projectId: initialProjectId,
  projects }: LetterProjectFieldProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [prevInitialProjectId, setPrevInitialProjectId] = useState(initialProjectId);
  if (initialProjectId !== prevInitialProjectId) {
    setPrevInitialProjectId(initialProjectId);
    setProjectId(initialProjectId);
  }

  const options = useMemo(
    () =>
      projects.map((project) => ({
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
    [projects],
  );

  function handleChange(nextProjectId: string) {
    if (nextProjectId === projectId) {
      return;
    }

    const previousProjectId = projectId;
    setProjectId(nextProjectId);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          moveLocalLetterToProject({
            letterId,
            projectId: nextProjectId,
          }),
        () =>
          moveLetterToProjectAction({
            letterId,
            projectId: nextProjectId,
          }),
      );

      if (!result.ok) {
        setProjectId(previousProjectId);
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  if (projects.length === 0) {
    return (
      <p className="px-1 text-[13px] leading-snug text-foreground/50">
        Create a{" "}
        <Link href="/projects/new" className="text-foreground/70 underline">
          project
        </Link>{" "}
        to assign this letter.
      </p>
    );
  }

  const selectedProject = projectId
    ? projects.find((project) => project.id === projectId)
    : undefined;

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
          value={projectId}
          options={options}
          onChange={handleChange}
          disabled={isPending}
          searchPlaceholder="Change project…"
          searchShortcutLabel="P"
          ariaLabel="Change project"
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
          taskPropertyDropdownId="project"
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
