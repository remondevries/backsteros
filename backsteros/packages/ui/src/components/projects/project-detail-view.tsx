"use client";

import { useCallback, useState, type ReactNode } from "react";

import type { ProjectArea } from "../../projects/project-areas.js";
import {
  PROJECT_SECTIONS,
  type ProjectSectionId,
} from "../../projects/project-sections.js";
import type { ProjectStatus } from "../../projects/project-status.js";
import type { ProjectProvider } from "../../projects/project-provider.js";
import type { ProjectEmailCategory } from "../../projects/project-email-category.js";
import type { ProjectTaskProgress } from "../../projects/project-progress-ring.js";
import { adoptRemoteField } from "../../shared/adopt-remote-field.js";
import { useCopyEntityIdShortcut } from "../../shortcuts/copy-entity-id-shortcut.js";
import { useTitleRenameShortcut } from "../../shortcuts/title-rename-shortcut.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "../content/content-markdown-view-layout.js";
import { DetailWithPropertiesLayout } from "../content/detail-with-properties-layout.js";
import { PROJECT_PROPERTIES_PANEL_WIDTH_KEY } from "../../content/properties-panel.js";
import { ProjectOverviewIcon } from "./project-overview-icon.js";
import { ProjectPropertiesDisplay } from "./project-properties-display.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { PillNav } from "../shared/pill-nav.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

export type ProjectDetailViewProject = {
  id: string;
  key: string;
  name: string;
  status: string;
  priority: number;
  area: ProjectArea | null;
  /** Nested custom area under Personal / Business / Clients. */
  areaId?: string | null;
  type?: string | null;
  /** Registrar/hosting provider (e.g. TransIP for Domains). */
  provider?: string | null;
  /** Email provider category when `type = email`. */
  category?: string | null;
  icon?: string | null;
  organizationId?: string | null;
  summary?: string | null;
  description?: string | null;
  startDate?: number | Date | null;
  dueDate?: number | Date | null;
  /** Linked Cloudflare zone when Catalog Domains matched this hostname. */
  cloudflareZoneId?: string | null;
  /** Status probe mode when `type = codebase`. */
  healthCheckMode?: "simple" | "advanced" | null;
  /** Hostname for simple health checks (no scheme), e.g. quarrymill.com. */
  healthCheckDomain?: string | null;
  /** Billable hourly rate in euro cents. */
  hourlyRateCents?: number | null;
  /** Budget rows (monthly / weekly / quarterly). */
  budgets?: Array<{
    period: "monthly" | "weekly" | "quarterly";
    amountCents: number;
  }>;
  taskProgress?: ProjectTaskProgress;
};

export type ProjectDetailNestedArea = {
  id: string;
  name: string;
  parent: ProjectArea | null;
  sortOrder?: number;
};

export type ProjectDetailViewProps = {
  project: ProjectDetailViewProject;
  /** Nested custom areas for the second Areas dropdown. */
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
   * When false, ⌘. does not copy this project's key (hidden keep-alive).
   * Defaults to true.
   */
  copyIdShortcutEnabled?: boolean;
  /** When true, section pills live in the product chrome (next to ⋯). */
  hideSectionNav?: boolean;
};

export function ProjectDetailView({
  project,
  nestedAreas = [],
  onSaveName,
  onSaveKey,
  onSaveSummary,
  onSaveDescription,
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
  onSectionChange,
  initialSection = "overview",
  renderSection,
  copyIdShortcutEnabled = true,
  hideSectionNav = false,
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
        return { ok: true };
      }
      return Promise.resolve(onSaveDescription(next)).then(() => ({
        ok: true as const,
      }));
    },
  });

  const sectionItems = PROJECT_SECTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

  // Match web shouldShowProjectNav: hide pills on documents & letters.
  // Host may also move pills into the chrome header (next to ⋯).
  const showSectionNav =
    !hideSectionNav && section !== "documents" && section !== "letters";

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
        <div
          className="project-detail__overview project-detail-split"
          data-detail-split=""
        >
          <DetailWithPropertiesLayout
            storageKey={PROJECT_PROPERTIES_PANEL_WIDTH_KEY}
            main={
              <div className="project-detail__overview-main">
                <div className="project-detail__overview-top">
                  <header className="project-detail__header">
                    <span className="project-detail__icon">
                      <ProjectOverviewIcon
                        icon={project.icon}
                        type={project.type}
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
                          // Keep source on the last confirmed remote until the
                          // patched project lands — bumping source early lets
                          // adoptRemoteField briefly revert the field.
                          setName(next);
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
                              <DocumentMarkdownPreview
                                body={value}
                                onChange={handleChange}
                              />
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
                    <p
                      className="project-detail__description-error"
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : null}
                </section>
              </div>
            }
            properties={
              <ProjectPropertiesDisplay
                project={project}
                nestedAreas={nestedAreas}
                onSaveKey={onSaveKey}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
                onProviderChange={onProviderChange}
                onCategoryChange={onCategoryChange}
                onHealthCheckChange={onHealthCheckChange}
                onHourlyRateChange={onHourlyRateChange}
                onBudgetsChange={onBudgetsChange}
                onAreaChange={onAreaChange}
                onAreaIdChange={onAreaIdChange}
                onOrganizationChange={onOrganizationChange}
                onStartDateChange={onStartDateChange}
                onDueDateChange={onDueDateChange}
                organizationOptions={organizationOptions}
                organizationNavigateHref={organizationNavigateHref}
                onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
              />
            }
          />
        </div>
      )}
    </div>
  );
}

