"use client";

import { useMemo, useState, useTransition } from "react";

import { updateProjectAreaAction } from "@/lib/mutations/projects";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { updateLocalProjectArea } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import type { ProjectArea } from "@/lib/project-areas";
import { getProjectAreaLabel } from "@/lib/project-areas";

import {
  buildProjectAreaDropdownOptions,
  fromProjectAreaDropdownValue,
  toProjectAreaDropdownValue,
  type ProjectAreaDropdownValue } from "./project-area-dropdown-options";

type ProjectAreaDropdownProps = {
  projectId: string;
  area: ProjectArea | null;
  onAreaChange?: (area: ProjectArea | null) => void;
};

function ProjectAreaBadge({ area }: { area: ProjectArea | null }) {
  const label = area ? getProjectAreaLabel(area).charAt(0) : "—";

  return (
    <span
      className={`inline-flex size-[14px] shrink-0 items-center justify-center rounded-sm text-[10px] font-medium leading-none ${
        area
          ? "bg-white/10 text-foreground/70"
          : "border border-dashed border-white/15 text-foreground/40"
      }`}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

export function ProjectAreaDropdown({
  projectId,
  area: initialArea,
  onAreaChange }: ProjectAreaDropdownProps) {
  const [area, setArea] = useState(() => toProjectAreaDropdownValue(initialArea));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [prevInitialArea, setPrevInitialArea] = useState(initialArea);
  if (initialArea !== prevInitialArea) {
    setPrevInitialArea(initialArea);
    setArea(toProjectAreaDropdownValue(initialArea));
  }

  const options = useMemo(() => buildProjectAreaDropdownOptions(), []);
  const areaLabel = area === "none" ? "No area" : getProjectAreaLabel(area);

  function handleChange(nextArea: ProjectAreaDropdownValue) {
    if (nextArea === area) return;

    const previousArea = area;
    const nextValue = fromProjectAreaDropdownValue(nextArea);
    setArea(nextArea);
    setError(null);
    onAreaChange?.(nextValue);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalProjectArea({
            projectId,
            area: nextValue,
          }),
        () =>
          updateProjectAreaAction({
            projectId,
            area: nextValue,
          }),
      );

      if (!result.ok) {
        setArea(previousArea);
        onAreaChange?.(fromProjectAreaDropdownValue(previousArea));
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <PropertyDropdown
        value={area}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="Change area…"
        searchShortcutLabel="A"
        ariaLabel="Change project area"
        taskPropertyDropdownId="area"
        fallbackIcon={
          <ProjectAreaBadge area={fromProjectAreaDropdownValue(area)} />
        }
        fallbackLabel={areaLabel}
        panelAlign="start"
        mutedFallback={area === "none"}
      />
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
