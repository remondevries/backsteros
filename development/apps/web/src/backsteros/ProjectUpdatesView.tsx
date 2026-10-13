import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { BacksterosMarkdownPreview } from "~/backsteros/markdown-editor";
import {
  ProjectUpdateKindIncidentIcon,
  ProjectUpdateKindMaintenanceIcon,
  ProjectUpdateKindUpdateIcon,
} from "~/backsteros/project-update-kind-icons";
import {
  PROJECT_UPDATE_SEVERITY_COLORS,
  ProjectUpdateSeverityDot,
} from "~/backsteros/project-update-severity-icons";
import {
  ProjectUpdateStatusInternalIcon,
  ProjectUpdateStatusOpenIcon,
  ProjectUpdateStatusPublishedIcon,
  ProjectUpdateStatusResolvedIcon,
} from "~/backsteros/project-update-status-icons";
import {
  coerceProjectUpdateStatusForKind,
  defaultProjectUpdateStatusForKind,
  isProjectUpdateKind,
  isProjectUpdateSeverity,
  PROJECT_UPDATE_DEFAULT_SEVERITY,
  PROJECT_UPDATE_KIND_LABELS,
  PROJECT_UPDATE_SEVERITY_LABELS,
  PROJECT_UPDATE_STATUS_LABELS,
  projectUpdateStatusesForKind,
  type BacksterosProjectUpdateKind,
  type BacksterosProjectUpdateSeverity,
  type BacksterosProjectUpdateStatus,
} from "~/backsteros/projectUpdates";
import { BacksterosSearchablePropertyMenu } from "~/backsteros/SearchablePropertyMenu";
import { getBacksterosTaskStatusColor } from "~/backsteros/taskStatusIconGeometry";
import { getBacksterosTaskStatusLabel, migrateBacksterosTaskStatus } from "~/backsteros/taskStatus";
import type { BacksterosProjectUpdate, BacksterosTask } from "~/backsteros/types";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { cn } from "~/lib/utils";
import "~/backsteros/projectUpdates.css";
import "~/backsteros/backsterosPropertyMenu.css";

export type ProjectUpdateRelatedTaskOption = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly projectKey?: string | null;
};

function formatRelatedTaskKey(task: ProjectUpdateRelatedTaskOption): string {
  if (task.projectKey) return `${task.projectKey}-${task.number}`;
  return `#${task.number}`;
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function kindIcon(kind: BacksterosProjectUpdateKind, severityColor?: string): ReactNode {
  switch (kind) {
    case "incident":
      return severityColor ? (
        <ProjectUpdateKindIncidentIcon size={14} color={severityColor} />
      ) : (
        <ProjectUpdateKindIncidentIcon size={14} />
      );
    case "maintenance":
      return <ProjectUpdateKindMaintenanceIcon size={14} />;
    default:
      return <ProjectUpdateKindUpdateIcon size={14} />;
  }
}

function statusIcon(status: BacksterosProjectUpdateStatus): ReactNode {
  switch (status) {
    case "published":
      return <ProjectUpdateStatusPublishedIcon size={14} />;
    case "open":
      return <ProjectUpdateStatusOpenIcon size={14} />;
    case "resolved":
      return <ProjectUpdateStatusResolvedIcon size={14} />;
    default:
      return <ProjectUpdateStatusInternalIcon size={14} />;
  }
}

function normalizeKind(value: string): BacksterosProjectUpdateKind {
  return isProjectUpdateKind(value) ? value : "update";
}

function normalizeStatus(
  kind: BacksterosProjectUpdateKind,
  value: string,
): BacksterosProjectUpdateStatus {
  return coerceProjectUpdateStatusForKind(kind, value);
}

function normalizeSeverity(value: string | null | undefined): BacksterosProjectUpdateSeverity {
  return isProjectUpdateSeverity(value) ? value : PROJECT_UPDATE_DEFAULT_SEVERITY;
}

function UpdateActionsMenu(props: {
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger
        disabled={props.disabled}
        className="project-updates__item-menu-trigger"
        aria-label="Update actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="13" cy="8" r="1.25" />
        </svg>
      </MenuTrigger>
      <MenuPopup align="end" className="bos-task-property-menu">
        <MenuItem closeOnClick className="bos-task-property-menu__option" onClick={props.onEdit}>
          <span className="bos-task-property-menu__option-label">Edit</span>
        </MenuItem>
        <MenuSeparator className="bos-task-property-menu__separator" />
        <MenuItem closeOnClick className="bos-task-property-menu__option" onClick={props.onDelete}>
          <span className="bos-task-property-menu__option-label">Delete</span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function SidePanelPlusIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M6 2.5V9.5M2.5 6H9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RemoveXIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RelatedTaskAddMenu(props: {
  readonly options: readonly ProjectUpdateRelatedTaskOption[];
  readonly relatedIds: readonly string[];
  readonly projectKey: string | null | undefined;
  readonly disabled?: boolean;
  readonly onAdd: (taskId: string) => void;
}) {
  return (
    <div className="project-updates__related-add">
      <BacksterosSearchablePropertyMenu
        label="Related"
        hideLabel
        triggerClassName="project-updates__related-add-btn"
        icon={<SidePanelPlusIcon />}
        value=""
        options={props.options
          .filter((task) => !props.relatedIds.includes(task.id))
          .map((task) => ({
            value: task.id,
            label: `${formatRelatedTaskKey({
              ...task,
              projectKey: task.projectKey ?? props.projectKey ?? null,
            })} ${task.title}`,
            searchText: `${task.number} ${task.title}`,
          }))}
        searchPlaceholder="Add related task…"
        ariaLabel="Related tasks"
        disabled={props.disabled}
        onChange={(taskId) => {
          if (!taskId || props.relatedIds.includes(taskId)) return;
          props.onAdd(taskId);
        }}
      />
    </div>
  );
}

export function BacksterosProjectUpdatesView(props: {
  readonly updates: readonly BacksterosProjectUpdate[];
  readonly loading?: boolean;
  readonly posting?: boolean;
  readonly error?: string | null;
  readonly relatedTaskOptions?: readonly ProjectUpdateRelatedTaskOption[];
  readonly projectKey?: string | null;
  readonly onCreate: (input: {
    title: string;
    body: string;
    kind: BacksterosProjectUpdateKind;
    status: BacksterosProjectUpdateStatus;
    severity: BacksterosProjectUpdateSeverity | null;
  }) => void | Promise<void>;
  readonly onPatch?: (
    id: string,
    patch: Partial<{
      title: string;
      body: string;
      kind: BacksterosProjectUpdateKind;
      status: BacksterosProjectUpdateStatus;
      severity: BacksterosProjectUpdateSeverity | null;
      relatedTaskIds: string[];
    }>,
  ) => void | Promise<void>;
  readonly onDelete?: (id: string) => void | Promise<void>;
  readonly onOpenRelatedTask?: (taskId: string) => void;
}) {
  const {
    updates,
    loading = false,
    posting = false,
    error = null,
    relatedTaskOptions = [],
    projectKey = null,
    onCreate,
    onPatch,
    onDelete,
    onOpenRelatedTask,
  } = props;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<BacksterosProjectUpdateKind>("update");
  const [status, setStatus] = useState<BacksterosProjectUpdateStatus>(
    defaultProjectUpdateStatusForKind("update"),
  );
  const [severity, setSeverity] = useState<BacksterosProjectUpdateSeverity>(
    PROJECT_UPDATE_DEFAULT_SEVERITY,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isIncident = kind === "incident";
  const statusOptions = useMemo(
    () =>
      projectUpdateStatusesForKind(kind).map((value) => ({
        value,
        label: PROJECT_UPDATE_STATUS_LABELS[value],
        icon: statusIcon(value),
      })),
    [kind],
  );
  const kindOptions = useMemo(
    () =>
      (["update", "incident", "maintenance"] as const).map((value) => ({
        value,
        label: PROJECT_UPDATE_KIND_LABELS[value],
        icon: kindIcon(
          value,
          value === "incident" ? PROJECT_UPDATE_SEVERITY_COLORS[severity] : undefined,
        ),
      })),
    [severity],
  );
  const severityOptions = useMemo(
    () =>
      (["high_risk", "degraded", "low_risk"] as const).map((value) => ({
        value,
        label: PROJECT_UPDATE_SEVERITY_LABELS[value],
        icon: <ProjectUpdateSeverityDot severity={value} size={14} />,
      })),
    [],
  );

  const taskById = useMemo(() => {
    const map = new Map<string, ProjectUpdateRelatedTaskOption>();
    for (const task of relatedTaskOptions) map.set(task.id, task);
    return map;
  }, [relatedTaskOptions]);

  const handleKindChange = useCallback((next: BacksterosProjectUpdateKind) => {
    setKind(next);
    setStatus(defaultProjectUpdateStatusForKind(next));
  }, []);

  const submit = useCallback(async () => {
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody || posting) return;
    await onCreate({
      title: nextTitle,
      body: nextBody,
      kind,
      status,
      severity: kind === "incident" ? severity : null,
    });
    setTitle("");
    setBody("");
    setKind("update");
    setStatus(defaultProjectUpdateStatusForKind("update"));
    setSeverity(PROJECT_UPDATE_DEFAULT_SEVERITY);
  }, [body, kind, onCreate, posting, severity, status, title]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleBodyKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  const canSubmit = Boolean(title.trim() && body.trim()) && !posting;

  function startEdit(entry: BacksterosProjectUpdate) {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditBody(entry.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
  }

  async function saveEdit(id: string) {
    if (!onPatch) return;
    const nextTitle = editTitle.trim();
    const nextBody = editBody.trim();
    if (!nextTitle || !nextBody) return;
    setSavingEdit(true);
    try {
      await onPatch(id, { title: nextTitle, body: nextBody });
      cancelEdit();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (!onDelete) return;
    if (!window.confirm("Delete this update?")) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      if (editingId === id) cancelEdit();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="project-updates">
      <form className="project-updates__composer" onSubmit={handleSubmit}>
        <div className="project-updates__meta project-updates__meta--kind">
          <BacksterosSearchablePropertyMenu
            label={PROJECT_UPDATE_KIND_LABELS[kind]}
            icon={kindIcon(
              kind,
              kind === "incident" ? PROJECT_UPDATE_SEVERITY_COLORS[severity] : undefined,
            )}
            value={kind}
            options={kindOptions}
            searchPlaceholder="Category"
            ariaLabel="Category"
            disabled={posting}
            onChange={handleKindChange}
          />
          {isIncident ? (
            <BacksterosSearchablePropertyMenu
              label={PROJECT_UPDATE_SEVERITY_LABELS[severity]}
              icon={<ProjectUpdateSeverityDot severity={severity} size={14} />}
              value={severity}
              options={severityOptions}
              searchPlaceholder="Priority"
              ariaLabel="Priority"
              disabled={posting}
              onChange={setSeverity}
            />
          ) : null}
        </div>
        <input
          className="project-updates__title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          aria-label="Update title"
          disabled={posting}
        />
        <div className="project-updates__comment-row">
          <textarea
            className="project-updates__comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleBodyKeyDown}
            placeholder="Write an update… (**bold**, _italic_, - lists, [links](url))"
            aria-label="Update body"
            disabled={posting}
            rows={3}
          />
          <button
            type="submit"
            className="project-updates__send"
            disabled={!canSubmit}
            aria-label="Post update"
            tabIndex={-1}
          >
            {posting ? "…" : "↑"}
          </button>
        </div>
        <div className="project-updates__meta project-updates__meta--footer">
          <BacksterosSearchablePropertyMenu
            label={PROJECT_UPDATE_STATUS_LABELS[status]}
            icon={statusIcon(status)}
            value={status}
            options={statusOptions}
            searchPlaceholder="Status"
            ariaLabel="Status"
            disabled={posting}
            onChange={setStatus}
          />
        </div>
      </form>

      {error ? (
        <p className="project-updates__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading && updates.length === 0 ? (
        <p className="project-updates__empty">Loading updates…</p>
      ) : updates.length === 0 ? (
        <p className="project-updates__empty">No updates yet. Post the first one above.</p>
      ) : (
        <ul className="project-updates__list" aria-label="Project updates">
          {updates.map((entry) => {
            const entryKind = normalizeKind(entry.kind);
            const entryStatus = normalizeStatus(entryKind, entry.status);
            const entrySeverity = normalizeSeverity(entry.severity);
            const isEditing = editingId === entry.id;
            const relatedIds = entry.relatedTaskIds ?? [];

            return (
              <li
                key={entry.id}
                className={cn(
                  "project-updates__item",
                  isEditing && "project-updates__item--editing",
                )}
              >
                <div className="project-updates__item-top">
                  <div className="project-updates__item-meta project-updates__item-meta--kind">
                    {entryKind === "incident" ? (
                      <BacksterosSearchablePropertyMenu
                        label={PROJECT_UPDATE_KIND_LABELS.incident}
                        icon={
                          <ProjectUpdateKindIncidentIcon
                            size={14}
                            color={PROJECT_UPDATE_SEVERITY_COLORS[entrySeverity]}
                          />
                        }
                        value={entrySeverity}
                        options={severityOptions}
                        searchPlaceholder="Priority"
                        ariaLabel="Priority"
                        disabled={!onPatch || posting || isEditing}
                        onChange={(next) => {
                          void onPatch?.(entry.id, { severity: next });
                        }}
                      />
                    ) : (
                      <BacksterosSearchablePropertyMenu
                        label={PROJECT_UPDATE_KIND_LABELS[entryKind]}
                        icon={kindIcon(entryKind)}
                        value={entryKind}
                        options={kindOptions}
                        searchPlaceholder="Category"
                        ariaLabel="Category"
                        disabled={!onPatch || posting || isEditing}
                        onChange={(next) => {
                          void onPatch?.(entry.id, {
                            kind: next,
                            status: coerceProjectUpdateStatusForKind(next, entry.status),
                            severity: next === "incident" ? entrySeverity : null,
                          });
                        }}
                      />
                    )}
                  </div>
                  {isEditing ? (
                    <div className="project-updates__item-edit-actions project-updates__item-edit-actions--top">
                      <button
                        type="button"
                        className="project-updates__item-edit-cancel"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="project-updates__item-edit-save"
                        onClick={() => void saveEdit(entry.id)}
                        disabled={savingEdit || !editTitle.trim() || !editBody.trim()}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : onPatch || onDelete ? (
                    <UpdateActionsMenu
                      disabled={posting || deletingId === entry.id}
                      onEdit={() => startEdit(entry)}
                      onDelete={() => void handleDelete(entry.id)}
                    />
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="project-updates__item-edit">
                    <input
                      className="project-updates__title project-updates__title--item"
                      type="text"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      placeholder="Title"
                      aria-label="Edit title"
                      disabled={savingEdit}
                    />
                    <textarea
                      className="project-updates__comment project-updates__comment--item"
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      placeholder="Body"
                      aria-label="Edit body"
                      disabled={savingEdit}
                      rows={4}
                    />
                  </div>
                ) : (
                  <>
                    <div className="project-updates__item-header">
                      <h3 className="project-updates__item-title">{entry.title}</h3>
                      <time className="project-updates__item-when" dateTime={entry.createdAt}>
                        {formatWhen(entry.createdAt)}
                      </time>
                    </div>
                    <div className="project-updates__item-body">
                      <BacksterosMarkdownPreview body={entry.body} />
                    </div>
                  </>
                )}

                <div className="project-updates__related">
                  <h4 className="project-updates__changelog-title">
                    {entryKind === "incident" ? "Timeline" : "Changelog"}
                  </h4>
                  {entryKind === "incident" && onPatch && relatedTaskOptions.length > 0 ? (
                    <RelatedTaskAddMenu
                      options={relatedTaskOptions}
                      relatedIds={relatedIds}
                      projectKey={projectKey}
                      disabled={posting || isEditing}
                      onAdd={(taskId) => {
                        void onPatch(entry.id, {
                          relatedTaskIds: [...relatedIds, taskId],
                        });
                      }}
                    />
                  ) : null}
                  {relatedIds.length > 0 ? (
                    <div className="project-updates__timeline" aria-label="Related tasks">
                      <div className="project-updates__timeline-list">
                        {relatedIds.map((taskId) => {
                          const task = taskById.get(taskId);
                          const key = task
                            ? formatRelatedTaskKey({
                                ...task,
                                projectKey: task.projectKey ?? projectKey,
                              })
                            : taskId.slice(0, 8);
                          const titleLabel = task?.title ?? "Unknown task";
                          const migratedStatus = task
                            ? migrateBacksterosTaskStatus(task.status)
                            : null;
                          const statusInline = entryKind === "incident";
                          const statusBadge =
                            migratedStatus != null ? (
                              <span
                                className={cn(
                                  "project-updates__timeline-status",
                                  statusInline && "project-updates__timeline-status--inline",
                                )}
                                style={
                                  {
                                    background: getBacksterosTaskStatusColor(
                                      migratedStatus,
                                      "dark",
                                    ),
                                    color: "var(--background, #0a0a0a)",
                                  } satisfies CSSProperties
                                }
                              >
                                {getBacksterosTaskStatusLabel(migratedStatus)}
                              </span>
                            ) : null;

                          return (
                            <div key={taskId} className="project-updates__timeline-item">
                              <div className="project-updates__timeline-content">
                                <span
                                  className="project-updates__timeline-dot"
                                  aria-hidden="true"
                                />
                                <div className="project-updates__timeline-heading-chip">
                                  <button
                                    type="button"
                                    className="project-updates__timeline-heading"
                                    title={titleLabel}
                                    disabled={!onOpenRelatedTask || !task}
                                    onClick={() => onOpenRelatedTask?.(taskId)}
                                  >
                                    {statusInline ? statusBadge : null}
                                    <span className="project-updates__timeline-task-key">
                                      {key}
                                    </span>
                                    <span className="project-updates__timeline-title">
                                      {titleLabel}
                                    </span>
                                  </button>
                                  {onPatch ? (
                                    <button
                                      type="button"
                                      className="project-updates__timeline-remove"
                                      aria-label={`Remove ${titleLabel}`}
                                      title="Remove"
                                      disabled={posting || isEditing}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void onPatch(entry.id, {
                                          relatedTaskIds: relatedIds.filter((id) => id !== taskId),
                                        });
                                      }}
                                    >
                                      <RemoveXIcon />
                                    </button>
                                  ) : null}
                                </div>
                                {!statusInline ? statusBadge : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {entryKind !== "incident" && onPatch && relatedTaskOptions.length > 0 ? (
                    <RelatedTaskAddMenu
                      options={relatedTaskOptions}
                      relatedIds={relatedIds}
                      projectKey={projectKey}
                      disabled={posting || isEditing}
                      onAdd={(taskId) => {
                        void onPatch(entry.id, {
                          relatedTaskIds: [...relatedIds, taskId],
                        });
                      }}
                    />
                  ) : null}
                </div>

                <div className="project-updates__item-meta project-updates__item-meta--footer">
                  <BacksterosSearchablePropertyMenu
                    label={PROJECT_UPDATE_STATUS_LABELS[entryStatus]}
                    icon={statusIcon(entryStatus)}
                    value={entryStatus}
                    options={projectUpdateStatusesForKind(entryKind).map((value) => ({
                      value,
                      label: PROJECT_UPDATE_STATUS_LABELS[value],
                      icon: statusIcon(value),
                    }))}
                    searchPlaceholder="Status"
                    ariaLabel="Status"
                    disabled={!onPatch || posting}
                    onChange={(next) => {
                      void onPatch?.(entry.id, { status: next });
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function tasksToUpdateRelatedOptions(
  tasks: readonly BacksterosTask[],
  projectKey: string | null | undefined,
): ProjectUpdateRelatedTaskOption[] {
  return tasks.map((task) => ({
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    projectKey: projectKey ?? null,
  }));
}
