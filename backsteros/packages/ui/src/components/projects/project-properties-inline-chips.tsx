"use client";

import { MailIcon, ProjectIcon } from "@primer/octicons-react";
import { useMemo } from "react";

import {
  PROJECT_AREA_LABELS,
  PROJECT_AREAS,
  type ProjectArea,
} from "../../projects/project-areas.js";
import {
  getProjectEmailCategoryLabel,
  parseProjectEmailCategory,
  PROJECT_EMAIL_CATEGORY_ORDER,
  type ProjectEmailCategory,
} from "../../projects/project-email-category.js";
import {
  getProjectProviderLabel,
  parseProjectProvider,
  PROJECT_PROVIDER_ORDER,
  type ProjectProvider,
} from "../../projects/project-provider.js";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../../projects/project-status.js";
import {
  migrateLegacyProjectType,
  projectTypeHasRegistrarOwnedDates,
} from "../../projects/project-type.js";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
} from "../../tasks/task-priority.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TransipIcon } from "../icons/transip-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import type {
  ProjectDetailNestedArea,
  ProjectDetailViewProject,
} from "./project-detail-view.js";

export type ProjectPropertiesInlineChipsProps = {
  project: ProjectDetailViewProject;
  nestedAreas?: ProjectDetailNestedArea[];
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onProviderChange?: (provider: ProjectProvider | null) => void;
  onCategoryChange?: (category: ProjectEmailCategory | null) => void;
  onAreaChange?: (area: ProjectArea | null) => void;
  onAreaIdChange?: (areaId: string | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onStartDateChange?: (startDate: Date | null) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  onCreateOrganizationFromQuery?: (query: string) => void;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Compact Linear-style property chips under the project summary.
 * Mirrors the right-rail fields without lead/members/labels (not on projects).
 */
export function ProjectPropertiesInlineChips({
  project,
  nestedAreas = [],
  onStatusChange,
  onPriorityChange,
  onProviderChange,
  onCategoryChange,
  onAreaChange,
  onAreaIdChange,
  onOrganizationChange,
  onStartDateChange,
  onDueDateChange,
  organizationOptions = [],
  onCreateOrganizationFromQuery,
}: ProjectPropertiesInlineChipsProps) {
  const status = migrateLegacyProjectStatus(project.status);
  const projectType = migrateLegacyProjectType(project.type);
  const registrarOwnedDates = projectTypeHasRegistrarOwnedDates(project.type);
  const projectProvider = parseProjectProvider(project.provider);
  const projectCategory = parseProjectEmailCategory(project.category);
  const start = toDate(project.startDate);
  const due = toDate(project.dueDate);

  const statusOptions = useMemo(
    () =>
      PROJECT_STATUS_ORDER.map((value) => ({
        value,
        label: getProjectStatusLabel(value),
        searchTerms: value.replaceAll("_", " "),
        icon: <ProjectStatusIcon status={value} size={14} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  const providerOptions = useMemo(
    () => [
      {
        value: "__none__",
        label: "No provider",
        searchTerms: "none unassigned",
      },
      ...PROJECT_PROVIDER_ORDER.map((value) => ({
        value,
        label: getProjectProviderLabel(value),
        searchTerms: `${value} ${getProjectProviderLabel(value)}`,
        icon:
          value === "transip" ? (
            <TransipIcon size={14} />
          ) : (
            <ProjectIcon size={14} />
          ),
      })),
    ],
    [],
  );

  const categoryOptions = useMemo(
    () => [
      {
        value: "__none__",
        label: "No category",
        searchTerms: "none unassigned",
      },
      ...PROJECT_EMAIL_CATEGORY_ORDER.map((value) => ({
        value,
        label: getProjectEmailCategoryLabel(value),
        searchTerms: `${value} ${getProjectEmailCategoryLabel(value)}`,
        icon: <MailIcon size={14} />,
      })),
    ],
    [],
  );

  const areaOptions = useMemo(
    () => [
      {
        value: "__none__",
        label: "No area",
        searchTerms: "none unassigned",
      },
      ...PROJECT_AREAS.map((area) => ({
        value: area,
        label: PROJECT_AREA_LABELS[area],
        searchTerms: area,
      })),
    ],
    [],
  );

  const subAreasForParent = useMemo(() => {
    if (!project.area) return [];
    return nestedAreas
      .filter((area) => area.parent === project.area)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [nestedAreas, project.area]);

  const subAreaOptions = useMemo(
    () => [
      {
        value: "__none__",
        label: "No sub-area",
        searchTerms: "none unassigned",
      },
      ...subAreasForParent.map((area) => ({
        value: area.id,
        label: area.name,
        searchTerms: area.name,
      })),
    ],
    [subAreasForParent],
  );

  const selectedSubArea = useMemo(
    () =>
      project.areaId
        ? (subAreasForParent.find((area) => area.id === project.areaId) ?? null)
        : null,
    [project.areaId, subAreasForParent],
  );

  const orgOptions = useMemo(
    () => [
      {
        value: "__none__",
        label: "No organization",
        searchTerms: "none unassigned",
        icon: <OrganizationIcon size={14} />,
      },
      ...organizationOptions,
    ],
    [organizationOptions],
  );

  const organizationLabel =
    organizationOptions.find(
      (entry) => entry.value === (project.organizationId ?? ""),
    )?.label ?? "No organization";

  return (
    <div className="project-properties-inline" aria-label="Project properties">
      <div className="project-properties-inline__fields">
        <PropertyDropdown
          value={status}
          options={statusOptions}
          onChange={onStatusChange}
          disabled={!onStatusChange}
          searchPlaceholder="Change status…"
          searchShortcutLabel="S"
          ariaLabel="Status"
          taskPropertyDropdownId="status"
          fallbackIcon={<ProjectStatusIcon status={status} size={14} />}
          fallbackLabel={getProjectStatusLabel(status)}
          triggerVariant="inlineChip"
          panelAlign="start"
        />
        <PropertyDropdown
          value={String(project.priority)}
          options={priorityOptions}
          onChange={(next) => onPriorityChange?.(Number(next))}
          disabled={!onPriorityChange}
          searchPlaceholder="Change priority…"
          searchShortcutLabel="P"
          ariaLabel="Priority"
          taskPropertyDropdownId="priority"
          fallbackIcon={
            <TaskPriorityIcon priority={project.priority} size={14} />
          }
          fallbackLabel={getTaskPriorityLabel(project.priority)}
          triggerVariant="inlineChip"
          panelAlign="start"
        />
        <span className="project-properties-inline__dates">
          <TaskDueDateDropdown
            dueDate={start}
            variant="property"
            noDueDateLabel="Start"
            searchPlaceholder="tomorrow, yesterday…"
            searchShortcutLabel="⇧S"
            taskPropertyDropdownId="startDate"
            showIcon={false}
            labelFormat={registrarOwnedDates ? "calendar" : "relative"}
            disabled={registrarOwnedDates || !onStartDateChange}
            onDueDateChange={onStartDateChange}
            triggerVariant="inlineChip"
          />
          <span className="project-overview-row__dates-sep" aria-hidden="true">
            →
          </span>
          <TaskDueDateDropdown
            dueDate={due}
            status={status}
            variant="property"
            noDueDateLabel="Target"
            showIcon={false}
            labelFormat={registrarOwnedDates ? "calendar" : "relative"}
            disabled={registrarOwnedDates || !onDueDateChange}
            onDueDateChange={onDueDateChange}
            triggerVariant="inlineChip"
          />
        </span>
        {organizationOptions.length > 0 || onOrganizationChange ? (
          <PropertyDropdown
            value={project.organizationId ?? "__none__"}
            options={orgOptions}
            onChange={(next) =>
              onOrganizationChange?.(next === "__none__" ? null : next)
            }
            disabled={!onOrganizationChange}
            searchPlaceholder="Change organization…"
            searchShortcutLabel="O"
            ariaLabel="Organization"
            taskPropertyDropdownId="organization"
            fallbackIcon={<OrganizationIcon size={14} />}
            fallbackLabel={organizationLabel}
            mutedFallback={!project.organizationId}
            triggerVariant="inlineChip"
            panelAlign="start"
            createFromQueryLabel={
              onCreateOrganizationFromQuery
                ? (query) =>
                    getCreateEntityFromQueryLabel("organization", query)
                : undefined
            }
            onCreateFromQuery={onCreateOrganizationFromQuery}
          />
        ) : null}
        <PropertyDropdown
          value={project.area ?? "__none__"}
          options={areaOptions}
          onChange={(next) => {
            onAreaChange?.(
              next === "__none__" ? null : (next as ProjectArea),
            );
            onAreaIdChange?.(null);
          }}
          disabled={!onAreaChange}
          searchPlaceholder="Change area…"
          searchShortcutLabel="⇧A"
          ariaLabel="Area"
          taskPropertyDropdownId="area"
          fallbackIcon={null}
          fallbackLabel={
            project.area ? PROJECT_AREA_LABELS[project.area] : "No area"
          }
          mutedFallback={!project.area}
          triggerVariant="inlineChip"
          panelAlign="start"
        />
        {subAreasForParent.length > 0 ? (
          <PropertyDropdown
            value={project.areaId ?? "__none__"}
            options={subAreaOptions}
            onChange={(next) =>
              onAreaIdChange?.(next === "__none__" ? null : next)
            }
            disabled={!onAreaIdChange}
            searchPlaceholder="Change sub-area…"
            ariaLabel="Sub-area"
            taskPropertyDropdownId="areaId"
            fallbackIcon={null}
            fallbackLabel={selectedSubArea?.name ?? "No sub-area"}
            mutedFallback={!selectedSubArea}
            triggerVariant="inlineChip"
            panelAlign="start"
          />
        ) : null}
        {onProviderChange || projectProvider ? (
          <PropertyDropdown
            value={projectProvider ?? "__none__"}
            options={providerOptions}
            onChange={(next) =>
              onProviderChange?.(
                next === "__none__" ? null : (next as ProjectProvider),
              )
            }
            disabled={!onProviderChange}
            searchPlaceholder="Change provider…"
            ariaLabel="Provider"
            fallbackIcon={
              projectProvider === "transip" ? <TransipIcon size={14} /> : null
            }
            fallbackLabel={
              projectProvider
                ? getProjectProviderLabel(projectProvider)
                : "No provider"
            }
            mutedFallback={!projectProvider}
            triggerVariant="inlineChip"
            panelAlign="start"
          />
        ) : null}
        {projectType === "email" ? (
          <PropertyDropdown
            value={projectCategory ?? "__none__"}
            options={categoryOptions}
            onChange={(next) =>
              onCategoryChange?.(
                next === "__none__" ? null : (next as ProjectEmailCategory),
              )
            }
            disabled={!onCategoryChange}
            searchPlaceholder="Change category…"
            ariaLabel="Category"
            fallbackIcon={<MailIcon size={14} />}
            fallbackLabel={
              projectCategory
                ? getProjectEmailCategoryLabel(projectCategory)
                : "No category"
            }
            mutedFallback={!projectCategory}
            triggerVariant="inlineChip"
            panelAlign="start"
          />
        ) : null}
      </div>
    </div>
  );
}
