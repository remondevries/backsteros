"use client";

import { ProjectIcon } from "@primer/octicons-react";
import { TerminalConsoleIcon } from "@backsteros/ui";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { updateProjectTypeAction } from "@/lib/mutations/projects";
import {
  getProjectTypeLabel,
  migrateLegacyProjectType,
  type ProjectType,
} from "@/lib/project-type";
import { updateLocalProjectType } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

import { buildProjectTypeDropdownOptions } from "./project-type-dropdown-options";

type ProjectTypeDropdownProps = {
  projectId: string;
  type: string;
  onTypeChange?: (type: ProjectType) => void;
};

function ProjectTypeIcon({ type }: { type: ProjectType }) {
  const Icon = type === "codebase" ? TerminalConsoleIcon : ProjectIcon;
  return <Icon size={14} aria-hidden="true" />;
}

function withTypeIcons(
  options: ReturnType<typeof buildProjectTypeDropdownOptions>,
): Array<(typeof options)[number] & { icon: ReactNode }> {
  return options.map((option) => ({
    ...option,
    icon: <ProjectTypeIcon type={option.value} />,
  }));
}

export function ProjectTypeDropdown({
  projectId,
  type: initialType,
  onTypeChange,
}: ProjectTypeDropdownProps) {
  const [type, setType] = useState(() => migrateLegacyProjectType(initialType));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [prevInitialType, setPrevInitialType] = useState(initialType);
  if (initialType !== prevInitialType) {
    setPrevInitialType(initialType);
    setType(migrateLegacyProjectType(initialType));
  }

  const options = useMemo(
    () => withTypeIcons(buildProjectTypeDropdownOptions()),
    [],
  );
  const typeLabel = getProjectTypeLabel(type);

  function handleChange(nextType: ProjectType) {
    if (nextType === type) return;

    const previousType = type;
    setType(nextType);
    setError(null);
    onTypeChange?.(nextType);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalProjectType({
            projectId,
            type: nextType,
          }),
        () =>
          updateProjectTypeAction({
            projectId,
            type: nextType,
          }),
      );

      if (!result.ok) {
        setType(previousType);
        onTypeChange?.(previousType);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <PropertyDropdown
        value={type}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="Change type…"
        searchShortcutLabel="Y"
        ariaLabel="Change project type"
        fallbackIcon={<ProjectTypeIcon type={type} />}
        fallbackLabel={typeLabel}
        panelAlign="start"
      />
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
