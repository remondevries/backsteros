"use client";

import { useMemo, useState, useTransition } from "react";

import { updateProjectStatusAction } from "@/lib/mutations/projects";
import { ProjectStatusIcon } from "@/components/project-status";
import { updateLocalProjectStatus } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  type ProjectStatus } from "@/lib/project-status";

import { buildProjectStatusDropdownOptions } from "../project-status-dropdown-options";

type ProjectStatusDropdownProps = {
  projectId: string;
  status: string;
  variant?: "property" | "icon";
  onStatusChange?: (status: ProjectStatus) => void;
};

export function ProjectStatusDropdown({
  projectId,
  status: initialStatus,
  variant = "property",
  onStatusChange }: ProjectStatusDropdownProps) {
  const [status, setStatus] = useState(() =>
    migrateLegacyProjectStatus(initialStatus),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isHovered, setIsHovered] = useState(false);

  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus);
  if (initialStatus !== prevInitialStatus) {
    setPrevInitialStatus(initialStatus);
    setStatus(migrateLegacyProjectStatus(initialStatus));
  }

  const options = useMemo(() => buildProjectStatusDropdownOptions(), []);
  const statusLabel = getProjectStatusLabel(status);

  function handleChange(nextStatus: ProjectStatus) {
    if (nextStatus === status) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setError(null);
    onStatusChange?.(nextStatus);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalProjectStatus({
            projectId,
            status: nextStatus,
          }),
        () =>
          updateProjectStatusAction({
            projectId,
            status: nextStatus,
          }),
      );

      if (!result.ok) {
        setStatus(previousStatus);
        onStatusChange?.(previousStatus);
        setError(result.error);
      }
    });
  }

  if (variant === "property") {
    return (
    <div className="flex flex-col gap-1">
      <PropertyDropdown
        value={status}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="Change status…"
        searchShortcutLabel="S"
        ariaLabel="Change project status"
        fallbackIcon={
          <ProjectStatusIcon status={status} title={statusLabel} size={14} />
        }
        fallbackLabel={statusLabel}
        panelAlign="start"
        taskPropertyDropdownId="status"
      />
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
    );
  }

  return (
    <div className="flex flex-col">
      <SearchableDropdown
        value={status}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="Change status…"
        searchShortcutLabel="S"
        ariaLabel={`Change project status: ${statusLabel}`}
        taskPropertyDropdownId="status"
        className="inline-flex"
        panelWidth={280}
        panelAlign="start"
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            title={statusLabel}
            tabIndex={-1}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change project status: ${statusLabel}`}
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
            <ProjectStatusIcon
              status={status}
              title={statusLabel}
              size={14}
              highlighted={isHovered || open}
            />
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
