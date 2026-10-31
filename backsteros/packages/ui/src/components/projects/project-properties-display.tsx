"use client";

import { MailIcon, ProjectIcon } from "@primer/octicons-react";
import { useMemo, type ReactNode } from "react";

import {
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  projectAreaShowsBilling,
  type ProjectArea,
} from "../../projects/project-areas.js";
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
  getProjectProviderLabel,
  parseProjectProvider,
  PROJECT_PROVIDER_ORDER,
  type ProjectProvider,
} from "../../projects/project-provider.js";
import {
  getProjectEmailCategoryLabel,
  parseProjectEmailCategory,
  PROJECT_EMAIL_CATEGORY_ORDER,
  type ProjectEmailCategory,
} from "../../projects/project-email-category.js";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
} from "../../tasks/task-priority.js";
import {
  formatProjectTaskProgressLabel,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../../projects/project-progress-ring.js";
import { TransipIcon } from "../icons/transip-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { PropertyDropdownNavigateRow } from "../dropdowns/property-dropdown-navigate-row.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { ProjectKeyEditor } from "./project-key-editor.js";
import { ProjectProgressRing } from "./project-progress-ring.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { ProjectBudgetsEditor } from "./project-budgets-editor.js";
import { ProjectHourlyRateEditor } from "./project-hourly-rate-editor.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import type {
  ProjectDetailNestedArea,
  ProjectDetailViewProject,
} from "./project-detail-view.js";

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export type ProjectPropertiesDisplayProps = {
  project: ProjectDetailViewProject;
  nestedAreas?: ProjectDetailNestedArea[];
  onSaveKey?: (
    key: string,
  ) =>
    | Promise<{ ok: true; key?: string } | { ok: false; error: string }>
    | { ok: true; key?: string }
    | { ok: false; error: string };
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onProviderChange?: (provider: ProjectProvider | null) => void;
  onCategoryChange?: (category: ProjectEmailCategory | null) => void;
  onHourlyRateChange?: (hourlyRateCents: number | null) => void;
  onBudgetsChange?: (
    budgets: Array<{
      period: "monthly" | "weekly" | "quarterly";
      amountCents: number;
    }>,
  ) => void;
  onAreaChange?: (area: ProjectArea | null) => void;
  onAreaIdChange?: (areaId: string | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onStartDateChange?: (startDate: Date | null) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  organizationNavigateHref?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  /**
   * Type-specific property rows (e.g. codebase Codebase section) rendered after
   * the shared Properties / Areas / Financials stack.
   */
  propertiesExtra?: ReactNode;
  /**
   * Lead agent + Channel. Rendered as an Agents subgroup after Financials
   * inside the Properties card.
   */
  agentsExtra?: ReactNode;
  /** Recent activity / registrar extras below Progress. */
  belowProperties?: ReactNode;
  /** When false, hide the Progress card (host shows progress elsewhere). */
  showProgress?: boolean;
};

/**
 * Right-rail project properties — same chrome as the task properties panel.
 */
export function ProjectPropertiesDisplay({
  project,
  nestedAreas = [],
  onSaveKey,
  onStatusChange,
  onPriorityChange,
  onProviderChange,
  onCategoryChange,
  onHourlyRateChange,
  onBudgetsChange,
  onAreaChange,
  onAreaIdChange,
  onOrganizationChange,
  onStartDateChange,
  onDueDateChange,
  organizationOptions = [],
  organizationNavigateHref = null,
  onCreateOrganizationFromQuery,
  propertiesExtra = null,
  agentsExtra = null,
  belowProperties = null,
  showProgress = true,
}: ProjectPropertiesDisplayProps) {
  const status = migrateLegacyProjectStatus(project.status);
  const projectType = migrateLegacyProjectType(project.type);
  const registrarOwnedDates = projectTypeHasRegistrarOwnedDates(project.type);
  const projectProvider = parseProjectProvider(project.provider);
  const projectCategory = parseProjectEmailCategory(project.category);
  const progress: ProjectTaskProgress = project.taskProgress ?? {
    total: 0,
    completed: 0,
  };
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

  const showBilling = projectAreaShowsBilling(project.area);

  const remaining = Math.max(0, progress.total - progress.completed);

  return (
    <div className="task-detail-properties-scroll">
      <div className="entity-properties-stack">
        <EntityPropertiesSection title="Properties">
          {onSaveKey ? (
            <ProjectKeyEditor
              value={project.key}
              onSave={onSaveKey}
              variant="split"
            />
          ) : (
            <div
              className={[
                "contact-detail-split-chip",
                "project-billing-chip",
                "project-key-split-chip",
                !project.key.trim() ? "is-muted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className="contact-detail-split-chip__label contact-detail-split-chip__label--muted project-hourly-rate-chip__label"
                aria-hidden
              >
                ID
              </span>
              <span className="contact-detail-split-chip__value">
                {project.key}
              </span>
            </div>
          )}
          <div className="project-properties-field-row">
            <PropertyFieldGroup label="Status">
              <PropertyDropdown
                value={status}
                options={statusOptions}
                onChange={onStatusChange}
                searchPlaceholder="Change status…"
                searchShortcutLabel="S"
                ariaLabel="Status"
                taskPropertyDropdownId="status"
                fallbackIcon={<ProjectStatusIcon status={status} size={14} />}
                fallbackLabel={getProjectStatusLabel(status)}
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Priority">
              <PropertyDropdown
                value={String(project.priority)}
                options={priorityOptions}
                onChange={(next) => onPriorityChange?.(Number(next))}
                searchPlaceholder="Change priority…"
                searchShortcutLabel="P"
                ariaLabel="Priority"
                taskPropertyDropdownId="priority"
                fallbackIcon={
                  <TaskPriorityIcon priority={project.priority} size={14} />
                }
                fallbackLabel={getTaskPriorityLabel(project.priority)}
              />
            </PropertyFieldGroup>
          </div>
          {projectType === "domeinname" ? (
            <PropertyFieldGroup label="Provider">
              <PropertyDropdown
                value={projectProvider ?? "__none__"}
                options={providerOptions}
                onChange={(next) =>
                  onProviderChange?.(
                    next === "__none__" ? null : (next as ProjectProvider),
                  )
                }
                searchPlaceholder="Change provider…"
                ariaLabel="Provider"
                fallbackIcon={
                  projectProvider === "transip" ? (
                    <TransipIcon size={14} />
                  ) : null
                }
                fallbackLabel={
                  projectProvider
                    ? getProjectProviderLabel(projectProvider)
                    : "No provider"
                }
                mutedFallback={!projectProvider}
              />
            </PropertyFieldGroup>
          ) : null}
          {projectType === "email" ? (
            <PropertyFieldGroup label="Category">
              <PropertyDropdown
                value={projectCategory ?? "__none__"}
                options={categoryOptions}
                onChange={(next) =>
                  onCategoryChange?.(
                    next === "__none__" ? null : (next as ProjectEmailCategory),
                  )
                }
                searchPlaceholder="Change category…"
                ariaLabel="Category"
                fallbackIcon={<MailIcon size={14} />}
                fallbackLabel={
                  projectCategory
                    ? getProjectEmailCategoryLabel(projectCategory)
                    : "No category"
                }
                mutedFallback={!projectCategory}
              />
            </PropertyFieldGroup>
          ) : null}
          <PropertyFieldGroup label="Dates">
            <span
              className={[
                "project-detail__meta-dates",
                registrarOwnedDates
                  ? "project-detail__meta-dates--registrar"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <TaskDueDateDropdown
                dueDate={start}
                variant="property"
                noDueDateLabel="No start date"
                searchPlaceholder="tomorrow, yesterday…"
                searchShortcutLabel="⇧S"
                taskPropertyDropdownId="startDate"
                showIcon={false}
                labelFormat={registrarOwnedDates ? "calendar" : "relative"}
                disabled={registrarOwnedDates}
                onDueDateChange={onStartDateChange}
              />
              <span className="project-overview-row__dates-sep">›</span>
              <TaskDueDateDropdown
                dueDate={due}
                status={status}
                variant="property"
                showIcon={false}
                labelFormat={registrarOwnedDates ? "calendar" : "relative"}
                disabled={registrarOwnedDates}
                onDueDateChange={onDueDateChange}
              />
            </span>
          </PropertyFieldGroup>
          <div className="project-properties-field-row">
            {organizationOptions.length > 0 || onOrganizationChange ? (
              <PropertyFieldGroup label="Organization">
                <PropertyDropdownNavigateRow
                  navigateHref={
                    project.organizationId ? organizationNavigateHref : null
                  }
                  navigateLabel={
                    project.organizationId
                      ? `Open organization ${organizationLabel}`
                      : undefined
                  }
                >
                  <PropertyDropdown
                    value={project.organizationId ?? "__none__"}
                    options={orgOptions}
                    onChange={(next) =>
                      onOrganizationChange?.(next === "__none__" ? null : next)
                    }
                    searchPlaceholder="Change organization…"
                    searchShortcutLabel="O"
                    ariaLabel="Organization"
                    taskPropertyDropdownId="organization"
                    fallbackIcon={<OrganizationIcon size={14} />}
                    fallbackLabel={organizationLabel}
                    mutedFallback={!project.organizationId}
                    createFromQueryLabel={
                      onCreateOrganizationFromQuery
                        ? (query) =>
                            getCreateEntityFromQueryLabel("organization", query)
                        : undefined
                    }
                    onCreateFromQuery={onCreateOrganizationFromQuery}
                  />
                </PropertyDropdownNavigateRow>
              </PropertyFieldGroup>
            ) : null}
            <PropertyFieldGroup label="Area">
              <span className="project-detail__area-fields">
                <PropertyDropdown
                  value={project.area ?? "__none__"}
                  options={areaOptions}
                  onChange={(next) => {
                    onAreaChange?.(
                      next === "__none__" ? null : (next as ProjectArea),
                    );
                    onAreaIdChange?.(null);
                  }}
                  searchPlaceholder="Change area…"
                  searchShortcutLabel="⇧A"
                  ariaLabel="Area"
                  taskPropertyDropdownId="area"
                  fallbackIcon={null}
                  fallbackLabel={
                    project.area ? PROJECT_AREA_LABELS[project.area] : "No area"
                  }
                  mutedFallback={!project.area}
                />
                {subAreasForParent.length > 0 ? (
                  <>
                    <span
                      className="project-detail__area-sep"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <PropertyDropdown
                      value={project.areaId ?? "__none__"}
                      options={subAreaOptions}
                      onChange={(next) =>
                        onAreaIdChange?.(next === "__none__" ? null : next)
                      }
                      searchPlaceholder="Change sub-area…"
                      ariaLabel="Sub-area"
                      taskPropertyDropdownId="areaId"
                      fallbackIcon={null}
                      fallbackLabel={selectedSubArea?.name ?? "No sub-area"}
                      mutedFallback={!selectedSubArea}
                    />
                  </>
                ) : null}
              </span>
            </PropertyFieldGroup>
          </div>
          {showBilling ? (
            <EntityOverviewSubgroup title="Financials" collapsible={false}>
              <div className="project-properties-field-row">
                <PropertyFieldGroup label="Hourly">
                  <ProjectHourlyRateEditor
                    value={project.hourlyRateCents ?? null}
                    disabled={!onHourlyRateChange}
                    variant="chip"
                    onSave={(next) => onHourlyRateChange?.(next)}
                  />
                </PropertyFieldGroup>
                <PropertyFieldGroup label="Weekly">
                  <ProjectBudgetsEditor
                    budgets={project.budgets ?? []}
                    disabled={!onBudgetsChange}
                    variant="chip"
                    chipPeriod="weekly"
                    onSave={(next) => onBudgetsChange?.(next)}
                  />
                </PropertyFieldGroup>
              </div>
            </EntityOverviewSubgroup>
          ) : null}
          {agentsExtra ? (
            <EntityOverviewSubgroup title="Agents" collapsible={false}>
              {agentsExtra}
            </EntityOverviewSubgroup>
          ) : null}
        </EntityPropertiesSection>

        {propertiesExtra}

        {showProgress ? (
          <EntityPropertiesSection title="Progress">
            <div className="project-properties-progress">
              <div className="project-properties-progress__summary">
                <span className="project-detail__progress" aria-hidden="true">
                  <span>{formatProjectTaskProgressPercent(progress)}</span>
                  <ProjectProgressRing progress={progress} size={20} />
                </span>
                <span className="project-properties-progress__label">
                  {formatProjectTaskProgressLabel(progress)}
                </span>
              </div>
              <dl className="project-properties-progress__stats">
                <div>
                  <dt>Scope</dt>
                  <dd>{progress.total}</dd>
                </div>
                <div>
                  <dt>Open</dt>
                  <dd>{remaining}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{progress.completed}</dd>
                </div>
              </dl>
            </div>
          </EntityPropertiesSection>
        ) : null}

        {belowProperties}
      </div>
    </div>
  );
}
