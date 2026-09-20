import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BacksterosCodebaseProjectActivityPanel } from "~/backsteros/CodebaseProjectActivityPanel";
import {
  fetchBacksterosGithubRepositories,
  fetchBacksterosOrganizations,
  fetchBacksterosProject,
  updateBacksterosProject,
} from "~/backsteros/client";
import { BacksterosComposeFolderIcon } from "~/backsteros/ComposeFolderIcon";
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
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
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

function BacksterosCodebaseProjectDescription(props: {
  readonly description: string | null;
  readonly onSave: (next: string | null) => Promise<void>;
}) {
  const { description, onSave } = props;
  const descriptionHostRef = useRef<HTMLDivElement | null>(null);

  const saveDescription = useCallback(
    async (nextValue: string) => {
      const next = nextValue.trim() || null;
      const current = description?.trim() || null;
      if (next === current) return;
      await onSave(next);
    },
    [description, onSave],
  );

  const { value, mode, handleChange, handleBlurSave, setViewMode, toggleViewMode } =
    useBacksterosMarkdownDetailEditor({
      initialValue: description ?? "",
      save: saveDescription,
    });

  useContentViewModeShortcut({
    enabled: true,
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
        placeholder="Add a project description…"
        emptyMessage="Add a project description…"
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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const label = workingDirectoryLabel(props.value);

  useEffect(() => {
    setDraft(props.value ?? "");
  }, [props.value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

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
          aria-label="Working directory"
          className="bos-codebase-overview__cwd-input"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      className={cn("bos-task-property-chip", !label && "bos-task-property-chip--muted")}
      title={props.value ?? "Set working directory (required for Files / Documents)"}
      onClick={() => setEditing(true)}
    >
      <span className="bos-task-property-chip__icon" aria-hidden="true">
        <BacksterosComposeFolderIcon size={PROPERTY_ICON_SIZE} />
      </span>
      <span className="bos-task-property-chip__label">{label ?? "Set folder…"}</span>
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
    <div className="bos-codebase-workbench__side-scroll">
      <div className="bos-codebase-overview__key-row">
        {detail.key ? <p className="bos-codebase-overview__key">{detail.key}</p> : <span />}
        <span
          className="bos-codebase-overview__progress"
          title={`${taskProgress.completed} of ${taskProgress.total} completed`}
        >
          <span>{formatBacksterosProjectTaskProgressPercent(taskProgress)}</span>
          <BacksterosProjectProgressRing progress={taskProgress} size={16} />
        </span>
      </div>
      <div className="bos-codebase-overview__title-row">
        <span className="mt-1 shrink-0 text-muted-foreground">
          <ProjectOcticon icon={detail.icon} type={detail.type} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <BacksterosOverviewNameEditor
            value={detail.name}
            entityLabel="Project"
            resetKey={detail.id}
            renameFocusRequest={titleRenameFocusRequest}
            onSave={handleSaveName}
          />
        </div>
      </div>

      <div className="bos-task-detail-properties">
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
        <span className="bos-task-property-chip bos-task-property-chip--static" title="Type">
          <span className="bos-task-property-chip__icon" aria-hidden="true">
            <TerminalConsoleIcon size={PROPERTY_ICON_SIZE} />
          </span>
          <span className="bos-task-property-chip__label">Codebase</span>
        </span>
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
                area: value === NONE_VALUE ? null : (value as "personal" | "business" | "clients"),
                areaId: null,
              },
              "Could not update area",
            );
          }}
        />
        <WorkingDirectoryChip
          value={detail.localWorkingDirectory}
          onSave={async (localWorkingDirectory) => {
            await applyPatch({ localWorkingDirectory }, "Could not update working directory");
          }}
        />
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

      <BacksterosCodebaseProjectDescription
        description={detail.description ?? null}
        onSave={async (next) => {
          await applyPatch({ description: next }, "Could not update description");
        }}
      />

      <div className="mt-5">
        <BacksterosCodebaseProjectActivityPanel
          projectId={detail.id}
          projectKey={detail.key}
          tasks={tasks}
        />
      </div>
    </div>
  );
}
