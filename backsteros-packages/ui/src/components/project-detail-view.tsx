"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  type ProjectArea,
} from "../project-areas.js";
import {
  PROJECT_SECTIONS,
  type ProjectSectionId,
} from "../project-sections.js";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../project-status.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import { adoptRemoteField } from "../adopt-remote-field.js";
import { useTitleRenameShortcut } from "../title-rename-shortcut.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import { ProjectOverviewIcon } from "./project-overview-icon.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { OrganizationIcon } from "./organization-icon.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { PillNav } from "./pill-nav.js";
import { ProjectAreaBadge } from "./project-area-badge.js";
import { ProjectProgressRing } from "./project-progress-ring.js";
import {
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../project-progress-ring.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { PropertyDropdownNavigateRow } from "./property-dropdown-navigate-row.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../searchable-dropdown-create-from-query.js";

export type ProjectDetailViewProject = {
  id: string;
  key: string;
  name: string;
  status: string;
  priority: number;
  area: ProjectArea | null;
  icon?: string | null;
  organizationId?: string | null;
  summary?: string | null;
  description?: string | null;
  startDate?: number | Date | null;
  dueDate?: number | Date | null;
  taskProgress?: ProjectTaskProgress;
};

export type ProjectDetailViewProps = {
  project: ProjectDetailViewProject;
  onSaveName?: (
    name: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onSaveSummary?: (summary: string) => void | Promise<void>;
  onSaveDescription?: (description: string) => void | Promise<void>;
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onAreaChange?: (area: ProjectArea | null) => void;
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
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function ProjectDetailView({
  project,
  onSaveName,
  onSaveSummary,
  onSaveDescription,
  onStatusChange,
  onPriorityChange,
  onAreaChange,
  onOrganizationChange,
  onStartDateChange,
  onDueDateChange,
  onIconChange,
  organizationOptions = [],
  organizationNavigateHref = null,
  onCreateOrganizationFromQuery,
  section: controlledSection,
  onSectionChange,
  initialSection = "overview",
  renderSection,
}: ProjectDetailViewProps) {
  const [uncontrolledSection, setUncontrolledSection] =
    useState<ProjectSectionId>(initialSection);
  const section = controlledSection ?? uncontrolledSection;
  const setSection = (next: ProjectSectionId) => {
    onSectionChange?.(next);
    if (controlledSection === undefined) {
      setUncontrolledSection(next);
    }
  };

  const [name, setName] = useState(project.name);
  const [nameSource, setNameSource] = useState(project.name);
  const remoteSummary = project.summary ?? "";
  const [summary, setSummary] = useState(remoteSummary);
  const [summarySource, setSummarySource] = useState(remoteSummary);
  const [descriptionExpanded, setDescriptionExpanded] = useState(true);
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const [prevId, setPrevId] = useState(project.id);
  if (project.id !== prevId) {
    setPrevId(project.id);
    setName(project.name);
    setNameSource(project.name);
    setSummary(remoteSummary);
    setSummarySource(remoteSummary);
    setDescriptionExpanded(true);
  } else {
    adoptRemoteField(project.name, name, nameSource, setName, setNameSource);
    adoptRemoteField(
      remoteSummary,
      summary,
      summarySource,
      setSummary,
      setSummarySource,
    );
  }

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
    { enabled: section === "overview" },
  );

  const status = migrateLegacyProjectStatus(project.status);
  const progress = project.taskProgress ?? { total: 0, completed: 0 };
  const start = toDate(project.startDate);
  const due = toDate(project.dueDate);

  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    handleChange,
    handleBlurSave,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: project.description ?? "",
    // Description shortcuts must not steal ⌘E from documents/tasks/letters.
    shortcutsEnabled: section === "overview",
    save: (next) => {
      if (!onSaveDescription) {
        console.info("[project-detail] save description", next.slice(0, 80));
        return { ok: true };
      }
      return Promise.resolve(onSaveDescription(next)).then(() => ({
        ok: true as const,
      }));
    },
  });

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

  const sectionItems = PROJECT_SECTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

  const organizationLabel =
    organizationOptions.find(
      (entry) => entry.value === (project.organizationId ?? ""),
    )?.label ?? "No organization";

  // Match web shouldShowProjectNav: hide pills on documents & letters.
  const showSectionNav = section !== "documents" && section !== "letters";

  return (
    <div className="project-detail" data-content-detail>
      {showSectionNav ? (
        <div className="project-detail__nav">
          <PillNav
            ariaLabel="Project sections"
            items={sectionItems}
            value={section}
            onChange={setSection}
          />
        </div>
      ) : null}

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
          <div className="project-detail__overview-top">
            <header className="project-detail__header">
              <span className="project-detail__icon">
                <ProjectOverviewIcon
                  icon={project.icon}
                  name={project.name}
                  onIconChange={onIconChange}
                />
              </span>
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
                    setNameSource(next);
                  }
                  return result;
                }}
              />
              <input
                type="text"
                className="project-detail__summary"
                value={summary}
                placeholder="Add a short summary…"
                aria-label="Project summary"
                onChange={(event) => setSummary(event.target.value)}
                onBlur={() => {
                  void onSaveSummary?.(summary.trim());
                }}
              />
            </header>

            <section
              className="project-detail__meta"
              aria-label="Project metadata"
            >
              <div className="project-detail__meta-row">
                <span className="project-detail__meta-label">Properties</span>
                <div className="project-detail__meta-fields">
                  <span className="project-detail__key">{project.key}</span>
                  <PropertyDropdown
                    value={status}
                    options={statusOptions}
                    onChange={onStatusChange}
                    searchPlaceholder="Change status…"
                    searchShortcutLabel="S"
                    ariaLabel="Status"
                    taskPropertyDropdownId="status"
                    fallbackIcon={
                      <ProjectStatusIcon status={status} size={14} />
                    }
                    fallbackLabel={getProjectStatusLabel(status)}
                  />
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
                  {organizationOptions.length > 0 || onOrganizationChange ? (
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
                          onOrganizationChange?.(
                            next === "__none__" ? null : next,
                          )
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
                                getCreateEntityFromQueryLabel(
                                  "organization",
                                  query,
                                )
                            : undefined
                        }
                        onCreateFromQuery={onCreateOrganizationFromQuery}
                      />
                    </PropertyDropdownNavigateRow>
                  ) : null}
                  <span className="project-detail__meta-dates">
                    <TaskDueDateDropdown
                      dueDate={start}
                      variant="property"
                      noDueDateLabel="No start date"
                      searchPlaceholder="tomorrow, next Friday…"
                      searchShortcutLabel="⇧S"
                      taskPropertyDropdownId="startDate"
                      showIcon={false}
                      onDueDateChange={onStartDateChange}
                    />
                    <span className="project-overview-row__dates-sep">›</span>
                    <TaskDueDateDropdown
                      dueDate={due}
                      status={status}
                      variant="property"
                      showIcon={false}
                      onDueDateChange={onDueDateChange}
                    />
                  </span>
                  <span className="project-detail__progress">
                    <span>{formatProjectTaskProgressPercent(progress)}</span>
                    <ProjectProgressRing progress={progress} size={16} />
                  </span>
                </div>
              </div>
              <div className="project-detail__meta-row">
                <span className="project-detail__meta-label">Areas</span>
                <div className="project-detail__meta-fields">
                  <PropertyDropdown
                    value={project.area ?? "__none__"}
                    options={areaOptions}
                    onChange={(next) =>
                      onAreaChange?.(
                        next === "__none__" ? null : (next as ProjectArea),
                      )
                    }
                    searchPlaceholder="Change area…"
                    searchShortcutLabel="A"
                    ariaLabel="Area"
                    taskPropertyDropdownId="area"
                    fallbackIcon={<ProjectAreaBadge area={project.area ?? null} />}
                    fallbackLabel={
                      project.area
                        ? PROJECT_AREA_LABELS[project.area]
                        : "No area"
                    }
                    mutedFallback={!project.area}
                  />
                </div>
              </div>
            </section>
          </div>

          <section
            className={`project-detail__description${
              descriptionExpanded
                ? " project-detail__description--expanded"
                : ""
            }`}
          >
            <div className="project-detail__description-heading">
              <button
                type="button"
                className="project-detail__description-toggle"
                aria-expanded={descriptionExpanded}
                onClick={() => setDescriptionExpanded((open) => !open)}
              >
                <span>Description</span>
                <span
                  aria-hidden="true"
                  className={`project-detail__description-chevron${
                    descriptionExpanded
                      ? ""
                      : " project-detail__description-chevron--collapsed"
                  }`}
                >
                  ▾
                </span>
              </button>
            </div>

            {descriptionExpanded ? (
              <div
                className="project-detail__description-body"
                data-content-view-mode={mode}
              >
                <ContentMarkdownViewLayout
                  mode={mode}
                  editorActivated={editorActivated}
                  onToggleMode={toggleViewMode}
                  editor={
                    <DocumentMarkdownEditor
                      value={value}
                      onChange={handleChange}
                      onBlur={handleBlurSave}
                      focusRequest={editorFocusRequest}
                      ariaLabel="Project description"
                    />
                  }
                  preview={
                    <ContentMarkdownPreviewColumn includeTopInset={false}>
                      {value.trim() ? (
                        <DocumentMarkdownPreview body={value} />
                      ) : (
                        <p className="project-detail__description-empty">
                          Add a project description…
                        </p>
                      )}
                    </ContentMarkdownPreviewColumn>
                  }
                  toggle={
                    <FloatingPillToggleDock>
                      <SegmentedPillToggle
                        value={mode}
                        options={[
                          { value: "edit", label: "Edit" },
                          { value: "preview", label: "Preview" },
                        ]}
                        onChange={setViewMode}
                        ariaLabel="Project description view mode"
                      />
                    </FloatingPillToggleDock>
                  }
                />
              </div>
            ) : null}

            {error ? (
              <p className="project-detail__description-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
