import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BacksterosCodebaseProjectActivityPanel } from "~/backsteros/CodebaseProjectActivityPanel";
import {
  fetchBacksterosGithubRepositories,
  fetchBacksterosOrganizations,
  fetchBacksterosProject,
  updateBacksterosProject,
  type BacksterosLocationFsTarget,
} from "~/backsteros/client";
import { BacksterosComposeFolderIcon } from "~/backsteros/ComposeFolderIcon";
import { BacksterosLocationFolderPicker } from "~/backsteros/LocationFolderPicker";
import { BacksterosDueDatePropertyMenu } from "~/backsteros/DueDatePropertyMenu";
import { BacksterosGitHubIcon } from "~/backsteros/GitHubIcon";
import { BacksterosHealthCheckIcon } from "~/backsteros/HealthCheckIcon";
import {
  BacksterosMarkdownDescription,
  useBacksterosMarkdownDetailEditor,
  useContentViewModeShortcut,
} from "~/backsteros/markdown-editor";
import { BacksterosOrganizationIcon } from "~/backsteros/OrganizationIcon";
import { BacksterosOverviewNameEditor } from "~/backsteros/OverviewNameEditor";
import { BacksterosProjectStatusIcon } from "~/backsteros/ProjectStatusIcon";
import {
  BacksterosProjectProgressRing,
  formatBacksterosProjectTaskProgressPercent,
} from "~/backsteros/ProjectProgressRing";
import {
  BACKSTEROS_PROJECT_STATUS_ORDER,
  getBacksterosProjectStatusLabel,
  migrateBacksterosProjectStatus,
  type BacksterosProjectStatus,
} from "~/backsteros/projectStatus";
import { BacksterosSearchablePropertyMenu } from "~/backsteros/SearchablePropertyMenu";
import { FloatingPillToggleDock, SegmentedPillToggle } from "~/backsteros/SegmentedPillToggle";
import { TerminalConsoleIcon } from "~/backsteros/TerminalConsoleIcon";
import { BacksterosTaskPriorityIcon } from "~/backsteros/TaskPriorityIcon";
import { getBacksterosTaskPriorityLabel } from "~/backsteros/taskDetailFormat";
import type {
  BacksterosCodebaseProject,
  BacksterosOrganization,
  BacksterosTask,
} from "~/backsteros/types";
import { useTitleRenameShortcut } from "~/backsteros/useTitleRenameShortcut";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import "~/backsteros/backsterosPropertyMenu.css";

const NONE_VALUE = "__none__";
const PROPERTY_ICON_SIZE = 14;
const PROJECT_AREAS = ["personal", "business", "clients"] as const;
const AREA_LABELS: Record<(typeof PROJECT_AREAS)[number], string> = {
  personal: "Personal",
  business: "Business",
  clients: "Clients",
};

function workingDirectoryLabel(path: string | null | undefined): string | null {
  const trimmed = path?.replace(/\/+$/, "").trim() ?? "";
  if (!trimmed) return null;
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

function normalizeHealthDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (candidate.includes("://")) {
    try {
      candidate = new URL(candidate).hostname;
    } catch {
      candidate = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    }
  }
  candidate = candidate.split("/")[0] ?? candidate;
  candidate = candidate.split("?")[0] ?? candidate;
  candidate = candidate.replace(/:\d+$/, "").replace(/\.$/, "");
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(candidate) &&
    candidate !== "localhost"
  ) {
    return null;
  }
  return candidate;
}

/** Description editor for the codebase Overview tab (main pane). */
export function BacksterosCodebaseProjectDescription(props: {
  readonly description: string | null;
  readonly emptyMessage?: string;
  readonly placeholder?: string;
  readonly saveEnabled?: boolean;
  readonly onSave: (next: string) => Promise<void>;
}) {
  const {
    description,
    onSave,
    emptyMessage = "Add a project description…",
    placeholder = "Add a project description…",
    saveEnabled = true,
  } = props;
  const descriptionHostRef = useRef<HTMLDivElement | null>(null);

  const saveDescription = useCallback(
    async (nextValue: string) => {
      if (!saveEnabled) return;
      if (nextValue === (description ?? "")) return;
      await onSave(nextValue);
    },
    [description, onSave, saveEnabled],
  );

  const { value, mode, handleChange, handleBlurSave, setViewMode, toggleViewMode } =
    useBacksterosMarkdownDetailEditor({
      initialValue: description ?? "",
      save: saveDescription,
    });

  useContentViewModeShortcut({
    enabled: saveEnabled,
    onToggle: toggleViewMode,
    onForcePreview: () => setViewMode("preview"),
    hostRef: descriptionHostRef,
  });

  return (
    <div className="bos-task-description-section mt-4" ref={descriptionHostRef}>
      <BacksterosMarkdownDescription
        mode={mode}
        value={value}
        onChange={handleChange}
        onBlur={handleBlurSave}
        ariaLabel="Project description"
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        onToggleMode={toggleViewMode}
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
  );
}

function WorkingDirectoryChip(props: {
  readonly value: string | null;
  readonly onSave: (next: string | null) => Promise<void>;
  readonly emptyLabel?: string;
  readonly ariaLabel?: string;
  readonly title?: string;
  readonly prefix?: string;
  /** When set, opens the in-app location folder picker (OS-111) instead of inline text. */
  readonly locationTarget?: BacksterosLocationFsTarget;
  /** Required when locationTarget=local. */
  readonly projectId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(props.value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const basename = workingDirectoryLabel(props.value);
  const label = basename ? (props.prefix ? `${props.prefix}: ${basename}` : basename) : null;
  const emptyLabel = props.emptyLabel ?? "Set folder…";
  const ariaLabel = props.ariaLabel ?? "Working directory";

  useEffect(() => {
    setDraft(props.value ?? "");
  }, [props.value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  if (props.locationTarget) {
    return (
      <>
        <button
          type="button"
          className={cn("bos-task-property-chip", !label && "bos-task-property-chip--muted")}
          title={props.title ?? props.value ?? emptyLabel}
          aria-label={ariaLabel}
          onClick={() => setPickerOpen(true)}
        >
          <span className="bos-task-property-chip__icon" aria-hidden="true">
            <BacksterosComposeFolderIcon size={PROPERTY_ICON_SIZE} />
          </span>
          <span className="bos-task-property-chip__label">{label ?? emptyLabel}</span>
        </button>
        <BacksterosLocationFolderPicker
          open={pickerOpen}
          target={props.locationTarget}
          title={ariaLabel}
          initialPath={props.value}
          {...(props.projectId ? { projectId: props.projectId } : {})}
          onClose={() => setPickerOpen(false)}
          onSelect={(path) => {
            void props.onSave(path.trim() || null).then(() => setPickerOpen(false));
          }}
        />
      </>
    );
  }

  if (editing) {
    return (
      <form
        className="bos-codebase-overview__cwd-edit"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim() || null;
          void props.onSave(next).then(() => setEditing(false));
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = draft.trim() || null;
            void props.onSave(next).then(() => setEditing(false));
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(props.value ?? "");
              setEditing(false);
            }
          }}
          placeholder="/absolute/path/to/repo"
          aria-label={ariaLabel}
          className="bos-codebase-overview__cwd-input"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      className={cn("bos-task-property-chip", !label && "bos-task-property-chip--muted")}
      title={props.title ?? props.value ?? "Set working directory (required for Files / Documents)"}
      onClick={() => setEditing(true)}
    >
      <span className="bos-task-property-chip__icon" aria-hidden="true">
        <BacksterosComposeFolderIcon size={PROPERTY_ICON_SIZE} />
      </span>
      <span className="bos-task-property-chip__label">{label ?? emptyLabel}</span>
    </button>
  );
}

export function BacksterosCodebaseProjectOverviewPane(props: {
  readonly project: BacksterosCodebaseProject;
  readonly tasks: readonly BacksterosTask[];
  readonly onProjectUpdated: (project: BacksterosCodebaseProject) => void;
}) {
  const { project, tasks, onProjectUpdated } = props;
  const [detail, setDetail] = useState(project);
  const [organizations, setOrganizations] = useState<readonly BacksterosOrganization[]>([]);
  const [repositories, setRepositories] = useState<readonly { fullName: string }[]>([]);
  const [titleRenameFocusRequest, setTitleRenameFocusRequest] = useState(0);

  useEffect(() => {
    setDetail(project);
  }, [project]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchBacksterosProject(project.id, controller.signal)
      .then((full) => {
        if (controller.signal.aborted) return;
        setDetail((current) => ({ ...current, ...full }));
        onProjectUpdated(full);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [onProjectUpdated, project.id]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchBacksterosOrganizations(controller.signal),
      fetchBacksterosGithubRepositories(controller.signal).catch(() => []),
    ])
      .then(([orgs, repos]) => {
        if (controller.signal.aborted) return;
        setOrganizations(orgs);
        setRepositories(repos);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [project.id]);

  useTitleRenameShortcut(
    useCallback(() => {
      setTitleRenameFocusRequest((count) => count + 1);
    }, []),
  );

  const taskProgress = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.status === "completed").length;
    return { total, completed };
  }, [tasks]);

  const statusValue = migrateBacksterosProjectStatus(detail.status);
  const priorityValue =
    typeof detail.priority === "number" && Number.isFinite(detail.priority)
      ? Math.min(4, Math.max(0, Math.round(detail.priority)))
      : 0;
  const areaValue =
    detail.area === "personal" || detail.area === "business" || detail.area === "clients"
      ? detail.area
      : NONE_VALUE;
  const healthMode = detail.healthCheckMode === "advanced" ? "advanced" : "simple";
  const healthDomain = detail.healthCheckDomain?.trim() || null;

  const statusOptions = useMemo(
    () =>
      BACKSTEROS_PROJECT_STATUS_ORDER.map((status) => ({
        value: status,
        label: getBacksterosProjectStatusLabel(status),
        icon: (
          <BacksterosProjectStatusIcon
            status={status}
            size={PROPERTY_ICON_SIZE}
            className="shrink-0"
          />
        ),
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      [0, 1, 2, 3, 4].map((priority) => ({
        value: String(priority),
        label: getBacksterosTaskPriorityLabel(priority),
        icon: <BacksterosTaskPriorityIcon priority={priority} size={PROPERTY_ICON_SIZE} />,
      })),
    [],
  );

  const organizationOptions = useMemo(
    () => [
      {
        value: NONE_VALUE,
        label: "No organization",
        icon: <BacksterosOrganizationIcon size={PROPERTY_ICON_SIZE} />,
      },
      ...organizations.map((org) => ({
        value: org.id,
        label: org.name,
        icon: <BacksterosOrganizationIcon size={PROPERTY_ICON_SIZE} />,
      })),
    ],
    [organizations],
  );

  const areaOptions = useMemo(
    () => [
      { value: NONE_VALUE, label: "No area" },
      ...PROJECT_AREAS.map((area) => ({
        value: area,
        label: AREA_LABELS[area],
      })),
    ],
    [],
  );

  const repositoryOptions = useMemo(() => {
    const rows = repositories.map((repo) => ({
      value: repo.fullName,
      label: repo.fullName,
      icon: <BacksterosGitHubIcon size={PROPERTY_ICON_SIZE} />,
    }));
    if (detail.githubRepository && !rows.some((row) => row.value === detail.githubRepository)) {
      rows.unshift({
        value: detail.githubRepository,
        label: detail.githubRepository,
        icon: <BacksterosGitHubIcon size={PROPERTY_ICON_SIZE} />,
      });
    }
    return [
      {
        value: NONE_VALUE,
        label: "No repository",
        icon: <BacksterosGitHubIcon size={PROPERTY_ICON_SIZE} />,
      },
      ...rows,
    ];
  }, [detail.githubRepository, repositories]);

  const healthOptions = useMemo(
    () => [
      { value: NONE_VALUE, label: "No health check" },
      { value: "simple", label: healthDomain ? `Simple · ${healthDomain}` : "Simple…" },
      { value: "advanced", label: "Advanced" },
    ],
    [healthDomain],
  );

  const applyPatch = useCallback(
    async (patch: Parameters<typeof updateBacksterosProject>[1], errorTitle: string) => {
      try {
        const updated = await updateBacksterosProject(detail.id, patch);
        setDetail((current) => ({ ...current, ...updated }));
        onProjectUpdated(updated);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: errorTitle,
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [detail.id, onProjectUpdated],
  );

  const handleSaveName = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) {
        return { ok: false as const, error: "Project name is required." };
      }
      try {
        const updated = await updateBacksterosProject(detail.id, { name: trimmed });
        setDetail((current) => ({ ...current, ...updated }));
        onProjectUpdated(updated);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Could not rename project.",
        };
      }
    },
    [detail.id, onProjectUpdated],
  );

  const organizationLabel =
    organizations.find((org) => org.id === detail.organizationId)?.name ?? "No organization";

  return (
    <div className="bos-codebase-workbench__side-scroll bos-codebase-overview">
      <div className="bos-codebase-overview__key-row">
        <p className="bos-codebase-overview__key">
          {detail.key?.trim() || "Project"}
        </p>
        <span
          className="bos-codebase-overview__progress"
          title={`${taskProgress.completed} of ${taskProgress.total} completed`}
        >
          <span>{formatBacksterosProjectTaskProgressPercent(taskProgress)}</span>
          <BacksterosProjectProgressRing progress={taskProgress} size={16} />
        </span>
      </div>
      <div className="bos-codebase-overview__name-row">
        <BacksterosOverviewNameEditor
          value={detail.name}
          entityLabel="Project"
          resetKey={detail.id}
          renameFocusRequest={titleRenameFocusRequest}
          onSave={handleSaveName}
        />
      </div>

      <div className="bos-entity-overview-subgroup" data-subgroup="General">
        <div className="bos-entity-overview-subgroup__header">
          <span className="bos-entity-overview-subgroup__label">General</span>
          <span className="bos-entity-overview-subgroup__rule" aria-hidden="true" />
        </div>
        <div className="bos-entity-overview-subgroup__fields bos-task-detail-properties bos-task-detail-properties--stacked">
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Health</span>
            <BacksterosSearchablePropertyMenu
              label={
                healthDomain
                  ? healthMode === "advanced"
                    ? `Advanced · ${healthDomain}`
                    : healthDomain
                  : healthMode === "advanced"
                    ? "Advanced"
                    : "No health check"
              }
              muted={!healthDomain && healthMode !== "advanced"}
              icon={<BacksterosHealthCheckIcon size={PROPERTY_ICON_SIZE} />}
              value={healthDomain || healthMode === "advanced" ? healthMode : NONE_VALUE}
              options={healthOptions}
              searchPlaceholder="Health check…"
              taskPropertyDropdownId="healthCheck"
              onChange={(value) => {
                if (value === NONE_VALUE) {
                  void applyPatch(
                    { healthCheckMode: null, healthCheckDomain: null },
                    "Could not update health check",
                  );
                  return;
                }
                if (value === "advanced") {
                  void applyPatch(
                    { healthCheckMode: "advanced", healthCheckDomain: healthDomain },
                    "Could not update health check",
                  );
                  return;
                }
                const nextDomain = window.prompt("Health check domain", healthDomain ?? "");
                if (nextDomain == null) return;
                const normalized = normalizeHealthDomain(nextDomain);
                if (!normalized) {
                  toastManager.add({
                    type: "error",
                    title: "Invalid domain",
                    description: "Enter a hostname like app.example.com",
                  });
                  return;
                }
                void applyPatch(
                  { healthCheckMode: "simple", healthCheckDomain: normalized },
                  "Could not update health check",
                );
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Type</span>
            <span className="bos-task-property-chip bos-task-property-chip--static" title="Type">
              <span className="bos-task-property-chip__icon" aria-hidden="true">
                <TerminalConsoleIcon size={PROPERTY_ICON_SIZE} />
              </span>
              <span className="bos-task-property-chip__label">Codebase</span>
            </span>
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Status</span>
            <BacksterosSearchablePropertyMenu
              label={getBacksterosProjectStatusLabel(statusValue)}
              icon={
                <BacksterosProjectStatusIcon
                  status={statusValue}
                  size={PROPERTY_ICON_SIZE}
                  className="shrink-0"
                />
              }
              value={statusValue}
              options={statusOptions}
              searchPlaceholder="Change status…"
              taskPropertyDropdownId="projectStatus"
              onChange={(value) => {
                void applyPatch(
                  { status: value as BacksterosProjectStatus },
                  "Could not update status",
                );
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Priority</span>
            <BacksterosSearchablePropertyMenu
              label={getBacksterosTaskPriorityLabel(priorityValue)}
              icon={<BacksterosTaskPriorityIcon priority={priorityValue} size={PROPERTY_ICON_SIZE} />}
              value={String(priorityValue)}
              options={priorityOptions}
              searchPlaceholder="Change priority…"
              taskPropertyDropdownId="projectPriority"
              onChange={(value) => {
                void applyPatch({ priority: Number(value) }, "Could not update priority");
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Organization</span>
            <BacksterosSearchablePropertyMenu
              label={organizationLabel}
              muted={!detail.organizationId}
              icon={<BacksterosOrganizationIcon size={PROPERTY_ICON_SIZE} />}
              value={detail.organizationId ?? NONE_VALUE}
              options={organizationOptions}
              searchPlaceholder="Change organization…"
              taskPropertyDropdownId="organization"
              onChange={(value) => {
                void applyPatch(
                  { organizationId: value === NONE_VALUE ? null : value },
                  "Could not update organization",
                );
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Start date</span>
            <BacksterosDueDatePropertyMenu
              dueDate={detail.startDate ?? null}
              status="completed"
              emptyLabel="No start date"
              ariaLabel="Change start date"
              iconSize={PROPERTY_ICON_SIZE}
              taskPropertyDropdownId="startDate"
              onChange={(startDate) => {
                void applyPatch({ startDate }, "Could not update start date");
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Due date</span>
            <BacksterosDueDatePropertyMenu
              dueDate={detail.dueDate ?? null}
              status={detail.status}
              emptyLabel="No due date"
              ariaLabel="Change due date"
              iconSize={PROPERTY_ICON_SIZE}
              taskPropertyDropdownId="dueDate"
              onChange={(dueDate) => {
                void applyPatch({ dueDate }, "Could not update due date");
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Area</span>
            <BacksterosSearchablePropertyMenu
              label={areaValue === NONE_VALUE ? "No area" : AREA_LABELS[areaValue]}
              muted={areaValue === NONE_VALUE}
              icon={null}
              value={areaValue}
              options={areaOptions}
              searchPlaceholder="Change area…"
              taskPropertyDropdownId="area"
              onChange={(value) => {
                void applyPatch(
                  {
                    area:
                      value === NONE_VALUE ? null : (value as "personal" | "business" | "clients"),
                    areaId: null,
                  },
                  "Could not update area",
                );
              }}
            />
          </div>
        </div>
      </div>

      <div className="bos-entity-overview-subgroup" data-subgroup="Locations">
        <div className="bos-entity-overview-subgroup__header">
          <span className="bos-entity-overview-subgroup__label">Locations</span>
          <span className="bos-entity-overview-subgroup__rule" aria-hidden="true" />
        </div>
        <div className="bos-entity-overview-subgroup__fields bos-task-detail-properties bos-task-detail-properties--stacked">
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">GitHub</span>
            <BacksterosSearchablePropertyMenu
              label={detail.githubRepository?.trim() || "No repository"}
              muted={!detail.githubRepository?.trim()}
              icon={<BacksterosGitHubIcon size={PROPERTY_ICON_SIZE} />}
              value={detail.githubRepository?.trim() || NONE_VALUE}
              options={repositoryOptions}
              searchPlaceholder="Change repository…"
              taskPropertyDropdownId="githubRepository"
              onChange={(value) => {
                void applyPatch(
                  { githubRepository: value === NONE_VALUE ? null : value },
                  "Could not update repository",
                );
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Local</span>
            <WorkingDirectoryChip
              value={detail.localWorkingDirectory}
              emptyLabel="Set folder…"
              ariaLabel="Local location"
              locationTarget="local"
              projectId={detail.id}
              title={
                detail.localWorkingDirectory ??
                "Local working directory (required before starting an agent)"
              }
              onSave={async (localWorkingDirectory) => {
                await applyPatch({ localWorkingDirectory }, "Could not update working directory");
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Development</span>
            <WorkingDirectoryChip
              value={detail.developmentLocation ?? null}
              prefix="Dev"
              emptyLabel="Dev location…"
              ariaLabel="Development location"
              locationTarget="development"
              title={
                detail.developmentLocation ??
                "Path on the development server"
              }
              onSave={async (developmentLocation) => {
                await applyPatch({ developmentLocation }, "Could not update development location");
              }}
            />
          </div>
          <div className="bos-entity-overview-field">
            <span className="bos-entity-overview-field__label">Production</span>
            <WorkingDirectoryChip
              value={detail.productionLocation ?? null}
              prefix="Prod"
              emptyLabel="Prod location…"
              ariaLabel="Production location"
              locationTarget="production"
              title={detail.productionLocation ?? "Path on the production server"}
              onSave={async (productionLocation) => {
                await applyPatch({ productionLocation }, "Could not update production location");
              }}
            />
          </div>
        </div>
      </div>

      <div className="bos-entity-overview-subgroup" data-subgroup="Activities">
        <div className="bos-entity-overview-subgroup__header">
          <span className="bos-entity-overview-subgroup__label">Activities</span>
          <span className="bos-entity-overview-subgroup__rule" aria-hidden="true" />
        </div>
        <div className="bos-entity-overview-subgroup__fields">
          <BacksterosCodebaseProjectActivityPanel
            projectId={detail.id}
            projectKey={detail.key}
            tasks={tasks}
          />
        </div>
      </div>
    </div>
  );
}
