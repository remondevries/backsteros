"use client";

import { MailIcon, ProjectIcon } from "@primer/octicons-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  projectAreaShowsBilling,
  type ProjectArea,
} from "../../projects/project-areas.js";
import {
  PROJECT_SECTIONS,
  type ProjectSectionId,
} from "../../projects/project-sections.js";
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
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import { TransipIcon } from "../icons/transip-icon.js";
import { adoptRemoteField } from "../../shared/adopt-remote-field.js";
import { useCopyEntityIdShortcut } from "../../shortcuts/copy-entity-id-shortcut.js";
import { useTitleRenameShortcut } from "../../shortcuts/title-rename-shortcut.js";
import { ProjectOverviewIcon } from "./project-overview-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { ProjectKeyEditor } from "./project-key-editor.js";
import { ProjectProgressRing } from "./project-progress-ring.js";
import { formatProjectTaskProgressPercent } from "../../projects/project-progress-ring.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { PropertyDropdownNavigateRow } from "../dropdowns/property-dropdown-navigate-row.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { ProjectHealthCheckProperty } from "../codebase/project-health-check-property.js";
import { ProjectBudgetsEditor } from "./project-budgets-editor.js";
import { ProjectHourlyRateEditor } from "./project-hourly-rate-editor.js";
import { EntityOverviewField } from "../shared/entity-overview-field.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";

import {
  type ProjectDetailNestedArea,
  type ProjectDetailViewProject,
} from "./project-detail-view.js";

export type { ProjectDetailNestedArea, ProjectDetailViewProject };

export type ProjectPanelDetailViewProps = {
  project: ProjectDetailViewProject;
  nestedAreas?: ProjectDetailNestedArea[];
  onSaveName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveKey?: (
    key: string,
  ) =>
    | Promise<{ ok: true; key?: string } | { ok: false; error: string }>
    | { ok: true; key?: string }
    | { ok: false; error: string };
  onSaveSummary?: (summary: string) => void | Promise<void>;
  /**
   * Kept for callers that previously edited description in the panel.
   * Description now lives on the codebase Overview tab.
   */
  onSaveDescription?: (description: string) => void | Promise<void>;
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onProviderChange?: (provider: ProjectProvider | null) => void;
  onCategoryChange?: (category: ProjectEmailCategory | null) => void;
  onHealthCheckChange?: (next: {
    healthCheckMode: "simple" | "advanced";
    healthCheckDomain: string | null;
  }) => void;
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
  onIconChange?: (icon: string | null) => void | Promise<void>;
  organizationOptions?: SearchableDropdownOption<string>[];
  /** “Open organization” chevron next to the org property (Next parity). */
  organizationNavigateHref?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  /** Controlled section (URL sync). When omitted, uses internal state. */
  section?: ProjectSectionId;
  onSectionChange?: (section: ProjectSectionId) => void;
  initialSection?: ProjectSectionId;
  /** Host-provided pane for non-overview sections (tasks, letters, …). */
  renderSection?: (sectionId: ProjectSectionId) => ReactNode;
  /**
   * Codebase path controls (working directory, GitHub, Dev, Prod).
   * Rendered inside the Codebase subgroup (with Health).
   */
  propertiesExtra?: ReactNode;
  /**
   * Lead agent + Channel controls. Rendered in an Agents subgroup
   * after Financials (or after Codebase when billing is hidden).
   */
  agentsExtra?: ReactNode;
  /** Rendered inside the Activities subgroup. */
  belowDescription?: ReactNode;
  /**
   * When set, replaces description + properties as the sole overview body
   * (e.g. Files / Commits / PRs tab content).
   */
  repositoriesSection?: ReactNode;
  /**
   * When false, ⌘. does not copy this project's key (hidden keep-alive).
   * Defaults to true.
   */
  copyIdShortcutEnabled?: boolean;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Narrow-panel project overview (identity + properties, or a custom body).
 * Description is edited on the codebase Overview tab.
 */
export function ProjectPanelDetailView({
  project,
  nestedAreas = [],
  onSaveName,
  onSaveKey,
  onStatusChange,
  onPriorityChange,
  onProviderChange,
  onCategoryChange,
  onHealthCheckChange,
  onHourlyRateChange,
  onBudgetsChange,
  onAreaChange,
  onAreaIdChange,
  onOrganizationChange,
  onStartDateChange,
  onDueDateChange,
  onIconChange,
  organizationOptions = [],
  organizationNavigateHref = null,
  onCreateOrganizationFromQuery,
  section: controlledSection,
  initialSection = "overview",
  renderSection,
  propertiesExtra,
  agentsExtra,
  belowDescription,
  repositoriesSection,
  copyIdShortcutEnabled = true,
}: ProjectPanelDetailViewProps) {
  const [uncontrolledSection] = useState<ProjectSectionId>(initialSection);
  const section = controlledSection ?? uncontrolledSection;

  const [name, setName] = useState(project.name);
  const [nameSource, setNameSource] = useState(project.name);
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const [prevId, setPrevId] = useState(project.id);
  if (project.id !== prevId) {
    setPrevId(project.id);
    setName(project.name);
    setNameSource(project.name);
  } else {
    adoptRemoteField(project.name, name, nameSource, setName, setNameSource);
  }

  useCopyEntityIdShortcut(
    () => project.key?.trim() || null,
    { enabled: copyIdShortcutEnabled },
  );

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
    { enabled: section === "overview" },
  );

  const status = migrateLegacyProjectStatus(project.status);
  const projectType = migrateLegacyProjectType(project.type);
  const registrarOwnedDates = projectTypeHasRegistrarOwnedDates(project.type);
  const projectProvider = parseProjectProvider(project.provider);
  const projectCategory = parseProjectEmailCategory(project.category);
  const progress = project.taskProgress ?? { total: 0, completed: 0 };
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
        ? subAreasForParent.find((area) => area.id === project.areaId) ?? null
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

  // Panel layout hosts its own chrome (no product section pills).
  const propertyTriggerVariant = "inlineChip" as const;
  const propertyPanelAlign = "start" as const;

  const statusControl = (
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
      triggerVariant={propertyTriggerVariant}
      panelAlign={propertyPanelAlign}
    />
  );

  const organizationControl =
    organizationOptions.length > 0 || onOrganizationChange ? (
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
          triggerVariant={propertyTriggerVariant}
          panelAlign={propertyPanelAlign}
          createFromQueryLabel={
            onCreateOrganizationFromQuery
              ? (query) =>
                  getCreateEntityFromQueryLabel("organization", query)
              : undefined
          }
          onCreateFromQuery={onCreateOrganizationFromQuery}
        />
      </PropertyDropdownNavigateRow>
    ) : null;

  const progressControl = (
    <span className="project-detail__progress">
      <span>{formatProjectTaskProgressPercent(progress)}</span>
      <ProjectProgressRing progress={progress} size={16} />
    </span>
  );

  const priorityControl = (
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
      triggerVariant={propertyTriggerVariant}
      panelAlign={propertyPanelAlign}
    />
  );

  const healthControl =
    projectType === "codebase" ? (
      <ProjectHealthCheckProperty
        mode={project.healthCheckMode}
        domain={project.healthCheckDomain}
        onChange={onHealthCheckChange}
        triggerVariant={propertyTriggerVariant}
        panelAlign={propertyPanelAlign}
      />
    ) : null;

  const providerControl = (
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
        projectProvider === "transip" ? <TransipIcon size={14} /> : null
      }
      fallbackLabel={
        projectProvider
          ? getProjectProviderLabel(projectProvider)
          : "No provider"
      }
      mutedFallback={!projectProvider}
      triggerVariant={propertyTriggerVariant}
      panelAlign={propertyPanelAlign}
    />
  );

  const categoryControl =
    projectType === "email" ? (
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
        triggerVariant={propertyTriggerVariant}
        panelAlign={propertyPanelAlign}
      />
    ) : null;

  const datesControl = (
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
        status="completed"
        noDueDateLabel="No start date"
        searchPlaceholder="tomorrow, yesterday…"
        searchShortcutLabel="⇧S"
        taskPropertyDropdownId="startDate"
        showIcon
        triggerVariant={propertyTriggerVariant}
        labelFormat={registrarOwnedDates ? "calendar" : "relative"}
        disabled={registrarOwnedDates}
        onDueDateChange={onStartDateChange}
      />
      <span className="project-overview-row__dates-sep">›</span>
      <TaskDueDateDropdown
        dueDate={due}
        status={status}
        variant="property"
        showIcon
        triggerVariant={propertyTriggerVariant}
        labelFormat={registrarOwnedDates ? "calendar" : "relative"}
        disabled={registrarOwnedDates}
        onDueDateChange={onDueDateChange}
      />
    </span>
  );

  const areaPropertyControls = (
    <span className="project-detail__area-fields">
      <PropertyDropdown
        value={project.area ?? "__none__"}
        options={areaOptions}
        onChange={(next) => {
          onAreaChange?.(next === "__none__" ? null : (next as ProjectArea));
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
        triggerVariant={propertyTriggerVariant}
        panelAlign={propertyPanelAlign}
      />
      {subAreasForParent.length > 0 ? (
        <>
          <span className="project-detail__area-sep" aria-hidden="true">
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
            triggerVariant={propertyTriggerVariant}
            panelAlign={propertyPanelAlign}
          />
        </>
      ) : null}
    </span>
  );

  const showBilling = projectAreaShowsBilling(project.area);
  const showCodebase = Boolean(propertiesExtra) || Boolean(healthControl);
  const showAgents = Boolean(agentsExtra);

  return (
    <div
      className="project-detail project-detail--panel"
      data-content-detail
    >

      {section !== "overview" ? (
        <div className="project-detail__section" data-section={section}>
          {renderSection?.(section) ?? (
            <div className="project-detail__placeholder">
              <p className="overview-empty">
                {PROJECT_SECTIONS.find((entry) => entry.id === section)?.label}{" "}
                will sync here next.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="project-detail__overview">
          <div className="project-panel-identity">
            <div className="project-panel-identity__code">
              {onSaveKey ? (
                <ProjectKeyEditor
                  value={project.key}
                  onSave={onSaveKey}
                  variant="displayId"
                />
              ) : (
                <p className="content-detail-display-id">{project.key}</p>
              )}
              {progressControl}
            </div>
            {projectType === "codebase" ? null : (
              <div className="project-panel-identity__icon">
                <ProjectOverviewIcon
                  icon={project.icon}
                  type={project.type}
                  name={project.name}
                  size={18}
                  onIconChange={onIconChange}
                />
              </div>
            )}
            <div className="project-panel-identity__name">
              <OverviewNameEditor
                value={name}
                entityLabel="Project"
                resetKey={project.id}
                renameFocusRequest={renameFocusRequest}
                onSave={async (next) => {
                  if (!onSaveName) {
                    setName(next);
                    setNameSource(next);
                    return { ok: true };
                  }
                  const result = await onSaveName(next);
                  if (result.ok) {
                    setName(next);
                  }
                  return result;
                }}
              />
            </div>

            <EntityOverviewSubgroup title="General">
              <EntityOverviewField label="Status">{statusControl}</EntityOverviewField>
              <EntityOverviewField label="Priority">{priorityControl}</EntityOverviewField>
              {organizationControl ? (
                <EntityOverviewField label="Organization">
                  {organizationControl}
                </EntityOverviewField>
              ) : null}
              <EntityOverviewField label="Provider">{providerControl}</EntityOverviewField>
              {categoryControl ? (
                <EntityOverviewField label="Category">
                  {categoryControl}
                </EntityOverviewField>
              ) : null}
              <EntityOverviewField label="Dates">{datesControl}</EntityOverviewField>
              <EntityOverviewField label="Area">{areaPropertyControls}</EntityOverviewField>
            </EntityOverviewSubgroup>

            {showCodebase ? (
              <EntityOverviewSubgroup title="Codebase">
                {healthControl ? (
                  <EntityOverviewField label="Health">
                    {healthControl}
                  </EntityOverviewField>
                ) : null}
                {propertiesExtra}
              </EntityOverviewSubgroup>
            ) : null}

            {showBilling ? (
              <EntityOverviewSubgroup title="Financials">
                <EntityOverviewField label="Hourly">
                  <ProjectHourlyRateEditor
                    value={project.hourlyRateCents ?? null}
                    disabled={!onHourlyRateChange}
                    variant="chip"
                    onSave={(next) => onHourlyRateChange?.(next)}
                  />
                </EntityOverviewField>
                <EntityOverviewField label="Weekly">
                  <ProjectBudgetsEditor
                    budgets={project.budgets ?? []}
                    disabled={!onBudgetsChange}
                    variant="chip"
                    chipPeriod="weekly"
                    onSave={(next) => onBudgetsChange?.(next)}
                  />
                </EntityOverviewField>
              </EntityOverviewSubgroup>
            ) : null}

            {showAgents ? (
              <EntityOverviewSubgroup title="Agents" collapsible={false}>
                {agentsExtra}
              </EntityOverviewSubgroup>
            ) : null}

            {belowDescription ? (
              <EntityOverviewSubgroup title="Activities">
                {belowDescription}
              </EntityOverviewSubgroup>
            ) : null}

            {repositoriesSection ? (
              <div className="project-panel-tab-body__custom">
                {repositoriesSection}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
