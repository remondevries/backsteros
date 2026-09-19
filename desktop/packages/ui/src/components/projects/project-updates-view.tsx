"use client";

import type {
  ProjectUpdate,
  ProjectUpdateKind,
  ProjectUpdateSeverity,
  ProjectUpdateStatus,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import type { SearchableDropdownMenuApi } from "../../dropdowns/searchable-dropdown-menu-api.js";
import { requestCloseSearchableDropdowns } from "../../dropdowns/searchable-dropdown-events.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  coerceProjectUpdateStatusForKind,
  defaultProjectUpdateSeverity,
  defaultProjectUpdateStatus,
  PROJECT_UPDATE_KIND_LABELS,
  PROJECT_UPDATE_SEVERITY_LABELS,
  PROJECT_UPDATE_STATUS_LABELS,
  projectUpdateStatusOptionsForKind,
} from "../../projects/project-updates.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { EntityActionsMenu } from "../entity-actions/entity-actions-menu.js";
import {
  ProjectUpdateKindIncidentIcon,
  ProjectUpdateKindMaintenanceIcon,
  ProjectUpdateKindUpdateIcon,
} from "./project-update-kind-icons.js";
import {
  ProjectUpdateStatusInternalIcon,
  ProjectUpdateStatusOpenIcon,
  ProjectUpdateStatusPublishedIcon,
  ProjectUpdateStatusResolvedIcon,
} from "./project-update-status-icons.js";
import { ProjectUpdateSeverityDot, PROJECT_UPDATE_SEVERITY_COLORS } from "./project-update-severity-icons.js";
import {
  ProjectUpdateRelatedTimeline,
  type ProjectUpdateRelatedTimelineItem,
} from "./project-update-related-timeline.js";
import { TaskRelatedChips } from "../tasks/task-related-chips.js";
import {
  TaskCommentEditor,
  type TaskCommentEditorHandle,
} from "../tasks/task-comment-editor.js";
import { getTaskStatusLabel, isTaskStatus } from "../../tasks/task-status.js";
import type { ReactNode } from "react";

export type ProjectUpdateRelatedTaskOption = {
  id: string;
  number: number;
  title: string;
  status: string;
  projectKey?: string | null;
};

export type ProjectUpdatesViewProps = {
  updates: ProjectUpdate[];
  loading?: boolean;
  posting?: boolean;
  error?: string | null;
  /** Project tasks available for the Related picker. */
  relatedTaskOptions?: ProjectUpdateRelatedTaskOption[];
  onCreate: (input: {
    title: string;
    body: string;
    kind: ProjectUpdateKind;
    status: ProjectUpdateStatus;
    severity: ProjectUpdateSeverity | null;
  }) => void | Promise<void>;
  onPatch?: (
    id: string,
    patch: Partial<{
      title: string;
      body: string;
      kind: ProjectUpdateKind;
      status: ProjectUpdateStatus;
      severity: ProjectUpdateSeverity | null;
      relatedTaskIds: string[];
    }>,
  ) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  onOpenRelatedTask?: (taskId: string) => void;
};

function formatRelatedTaskKey(task: ProjectUpdateRelatedTaskOption): string {
  if (task.projectKey) {
    return `${task.projectKey}-${task.number}`;
  }
  return `#${task.number}`;
}

function buildKindOptions(
  incidentColor?: string,
): SearchableDropdownOption<ProjectUpdateKind>[] {
  return [
    {
      value: "update",
      label: PROJECT_UPDATE_KIND_LABELS.update,
      icon: <ProjectUpdateKindUpdateIcon size={14} />,
    },
    {
      value: "incident",
      label: PROJECT_UPDATE_KIND_LABELS.incident,
      icon: (
        <ProjectUpdateKindIncidentIcon size={14} color={incidentColor} />
      ),
    },
    {
      value: "maintenance",
      label: PROJECT_UPDATE_KIND_LABELS.maintenance,
      icon: <ProjectUpdateKindMaintenanceIcon size={14} />,
    },
  ];
}

const KIND_OPTIONS = buildKindOptions();

const STATUS_OPTIONS: SearchableDropdownOption<ProjectUpdateStatus>[] = [
  {
    value: "internal",
    label: PROJECT_UPDATE_STATUS_LABELS.internal,
    icon: <ProjectUpdateStatusInternalIcon size={14} />,
  },
  {
    value: "published",
    label: PROJECT_UPDATE_STATUS_LABELS.published,
    icon: <ProjectUpdateStatusPublishedIcon size={14} />,
  },
  {
    value: "open",
    label: PROJECT_UPDATE_STATUS_LABELS.open,
    icon: <ProjectUpdateStatusOpenIcon size={14} />,
  },
  {
    value: "resolved",
    label: PROJECT_UPDATE_STATUS_LABELS.resolved,
    icon: <ProjectUpdateStatusResolvedIcon size={14} />,
  },
];

function statusOptionsForKind(
  kind: ProjectUpdateKind,
): SearchableDropdownOption<ProjectUpdateStatus>[] {
  const allowed = new Set(
    projectUpdateStatusOptionsForKind(kind).map((option) => option.value),
  );
  return STATUS_OPTIONS.filter((option) => allowed.has(option.value));
}

function statusFallbackIcon(status: ProjectUpdateStatus): ReactNode {
  switch (status) {
    case "published":
      return <ProjectUpdateStatusPublishedIcon size={14} />;
    case "open":
      return <ProjectUpdateStatusOpenIcon size={14} />;
    case "resolved":
      return <ProjectUpdateStatusResolvedIcon size={14} />;
    case "internal":
    default:
      return <ProjectUpdateStatusInternalIcon size={14} />;
  }
}

const SEVERITY_OPTIONS: SearchableDropdownOption<ProjectUpdateSeverity>[] = [
  {
    value: "high_risk",
    label: PROJECT_UPDATE_SEVERITY_LABELS.high_risk,
    icon: <ProjectUpdateSeverityDot severity="high_risk" size={14} />,
  },
  {
    value: "degraded",
    label: PROJECT_UPDATE_SEVERITY_LABELS.degraded,
    icon: <ProjectUpdateSeverityDot severity="degraded" size={14} />,
  },
  {
    value: "low_risk",
    label: PROJECT_UPDATE_SEVERITY_LABELS.low_risk,
    icon: <ProjectUpdateSeverityDot severity="low_risk" size={14} />,
  },
];

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

/**
 * Project Updates tab — compose (category [+ priority] + title + comment; status below).
 *
 * Tab order: Category → (Severity if incident) → Title → Body → Status
 */
export function ProjectUpdatesView({
  updates,
  loading = false,
  posting = false,
  error = null,
  relatedTaskOptions = [],
  onCreate,
  onPatch,
  onDelete,
  onOpenRelatedTask,
}: ProjectUpdatesViewProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<ProjectUpdateKind>("update");
  const [status, setStatus] = useState<ProjectUpdateStatus>(
    defaultProjectUpdateStatus,
  );
  const [severity, setSeverity] = useState<ProjectUpdateSeverity>(
    defaultProjectUpdateSeverity,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectUpdate | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyEditorRef = useRef<TaskCommentEditorHandle | null>(null);
  const editBodyEditorRef = useRef<TaskCommentEditorHandle | null>(null);
  const kindMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const statusMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const severityMenuRef = useRef<SearchableDropdownMenuApi | null>(null);

  const statusOptions = useMemo(() => statusOptionsForKind(kind), [kind]);
  const severityOptions = useMemo(() => SEVERITY_OPTIONS, []);
  const isIncident = kind === "incident";
  const composerKindOptions = useMemo(
    () =>
      isIncident
        ? buildKindOptions(PROJECT_UPDATE_SEVERITY_COLORS[severity])
        : KIND_OPTIONS,
    [isIncident, severity],
  );

  const relatedDropdownOptions = useMemo<SearchableDropdownOption<string>[]>(
    () =>
      relatedTaskOptions.map((task) => ({
        value: task.id,
        label: task.title,
        searchTerms: [
          task.title,
          formatRelatedTaskKey(task),
          isTaskStatus(task.status)
            ? getTaskStatusLabel(task.status)
            : task.status,
        ].join(" "),
      })),
    [relatedTaskOptions],
  );

  const relatedTasksById = useMemo(() => {
    const map = new Map<string, ProjectUpdateRelatedTaskOption>();
    for (const task of relatedTaskOptions) {
      map.set(task.id, task);
    }
    return map;
  }, [relatedTaskOptions]);

  const buildTimelineItems = useCallback(
    (relatedTaskIds: readonly string[]): ProjectUpdateRelatedTimelineItem[] => {
      const items: ProjectUpdateRelatedTimelineItem[] = [];
      for (const id of relatedTaskIds) {
        const task = relatedTasksById.get(id);
        if (!task) {
          items.push({
            id,
            title: "Unknown task",
            taskKey: "—",
          });
          continue;
        }
        items.push({
          id: task.id,
          title: task.title,
          taskKey: formatRelatedTaskKey(task),
          status: task.status,
        });
      }
      return items;
    },
    [relatedTasksById],
  );

  const focusTitle = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, []);

  const focusBody = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      bodyEditorRef.current?.focus();
    });
  }, []);

  const openKindMenu = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      kindMenuRef.current?.open();
    });
  }, []);

  const openStatusMenu = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      statusMenuRef.current?.open();
    });
  }, []);

  const openSeverityMenu = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      severityMenuRef.current?.open();
    });
  }, []);

  const handleKindChange = useCallback((next: ProjectUpdateKind) => {
    setKind(next);
    setStatus((current) => coerceProjectUpdateStatusForKind(next, current));
    if (next === "incident") {
      setSeverity((current) => current || defaultProjectUpdateSeverity);
    }
  }, []);

  const startEdit = useCallback((entry: ProjectUpdate) => {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditBody(entry.body);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
    setSavingEdit(false);
  }, []);

  const saveEdit = useCallback(
    async (id: string) => {
      const nextTitle = editTitle.trim();
      const nextBody = editBody.trim();
      if (!onPatch || !nextTitle || !nextBody || savingEdit) return;
      setSavingEdit(true);
      try {
        await onPatch(id, { title: nextTitle, body: nextBody });
        setEditingId(null);
        setEditTitle("");
        setEditBody("");
      } finally {
        setSavingEdit(false);
      }
    },
    [editBody, editTitle, onPatch, savingEdit],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || !onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      if (editingId === pendingDelete.id) {
        cancelEdit();
      }
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }, [cancelEdit, deleting, editingId, onDelete, pendingDelete]);

  const handleStatusTab = useCallback(() => {
    requestCloseSearchableDropdowns();
  }, []);

  const handleKindTab = useCallback(() => {
    if (kind === "incident") {
      openSeverityMenu();
      return;
    }
    focusTitle();
  }, [focusTitle, kind, openSeverityMenu]);

  const handleTitleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      if (event.shiftKey) {
        if (kind === "incident") {
          openSeverityMenu();
        } else {
          openKindMenu();
        }
        return;
      }
      focusBody();
    },
    [focusBody, kind, openKindMenu, openSeverityMenu],
  );

  const handleBodyKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        focusTitle();
        return;
      }
      openStatusMenu();
    },
    [focusTitle, openStatusMenu],
  );

  async function submit() {
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
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  const canSubmit = Boolean(title.trim() && body.trim()) && !posting;

  return (
    <div className="project-updates">
      <form className="project-updates__composer" onSubmit={handleSubmit}>
        <div className="project-updates__meta project-updates__meta--kind">
          <PropertyDropdown
            value={kind}
            options={composerKindOptions}
            onChange={handleKindChange}
            searchPlaceholder="Category"
            ariaLabel="Category"
            fallbackLabel="Category"
            fallbackIcon={<ProjectUpdateKindUpdateIcon size={14} />}
            triggerVariant="composePill"
            disabled={posting}
            registerOpenMenu={(api) => {
              kindMenuRef.current = api;
            }}
            onTabFromSearch={handleKindTab}
            onShiftTabFromSearch={() => {
              requestCloseSearchableDropdowns();
            }}
          />
          {isIncident ? (
            <PropertyDropdown
              value={severity}
              options={severityOptions}
              onChange={setSeverity}
              searchPlaceholder="Priority"
              ariaLabel="Priority"
              fallbackLabel={PROJECT_UPDATE_SEVERITY_LABELS[severity]}
              fallbackIcon={
                <ProjectUpdateSeverityDot severity={severity} size={14} />
              }
              triggerVariant="composePill"
              disabled={posting}
              registerOpenMenu={(api) => {
                severityMenuRef.current = api;
              }}
              onTabFromSearch={focusTitle}
              onShiftTabFromSearch={openKindMenu}
            />
          ) : null}
        </div>
        <input
          ref={titleInputRef}
          className="project-updates__title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder="Title"
          aria-label="Update title"
          disabled={posting}
        />
        <div
          className="project-updates__comment-row"
          onKeyDownCapture={handleBodyKeyDown}
        >
          <TaskCommentEditor
            editorRef={bodyEditorRef}
            className="project-updates__comment"
            variant="composer"
            value={body}
            onChange={setBody}
            onSubmitShortcut={() => {
              void submit();
            }}
            placeholder="Write an update… (**bold**, _italic_, - lists, [links](url))"
            ariaLabel="Update body"
            disabled={posting}
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
          <PropertyDropdown
            value={status}
            options={statusOptions}
            onChange={setStatus}
            searchPlaceholder="Status"
            ariaLabel="Status"
            fallbackLabel={PROJECT_UPDATE_STATUS_LABELS[status]}
            fallbackIcon={statusFallbackIcon(status)}
            triggerVariant="composePill"
            disabled={posting}
            registerOpenMenu={(api) => {
              statusMenuRef.current = api;
            }}
            onTabFromSearch={handleStatusTab}
            onShiftTabFromSearch={focusBody}
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
        <p className="project-updates__empty">
          No updates yet. Post the first one above.
        </p>
      ) : (
        <ul className="project-updates__list" aria-label="Project updates">
          {updates.map((entry) => {
            const isEditing = editingId === entry.id;
            const entrySeverity =
              entry.severity ?? defaultProjectUpdateSeverity;
            const canMutate = Boolean(onPatch || onDelete) && !posting;
            const menuItems = [
              ...(onPatch
                ? [
                    {
                      id: "edit",
                      label: "Edit",
                      onSelect: () => startEdit(entry),
                      disabled: isEditing || savingEdit,
                    },
                  ]
                : []),
              ...(onDelete
                ? [
                    {
                      id: "delete",
                      label: "Delete",
                      danger: true as const,
                      onSelect: () => setPendingDelete(entry),
                      disabled: deleting,
                    },
                  ]
                : []),
            ];

            return (
              <li
                key={entry.id}
                className={[
                  "project-updates__item",
                  isEditing ? "project-updates__item--editing" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="project-updates__item-top">
                  <div className="project-updates__item-meta project-updates__item-meta--kind">
                    {entry.kind === "incident" ? (
                      <PropertyDropdown
                        value={entrySeverity}
                        options={severityOptions}
                        onChange={(next) => {
                          void onPatch?.(entry.id, { severity: next });
                        }}
                        searchPlaceholder="Priority"
                        ariaLabel="Priority"
                        fallbackLabel={PROJECT_UPDATE_KIND_LABELS.incident}
                        fallbackIcon={
                          <ProjectUpdateKindIncidentIcon
                            size={14}
                            color={
                              PROJECT_UPDATE_SEVERITY_COLORS[entrySeverity]
                            }
                          />
                        }
                        selectedDisplayLabel={
                          PROJECT_UPDATE_KIND_LABELS.incident
                        }
                        selectedDisplayIcon={
                          <ProjectUpdateKindIncidentIcon
                            size={14}
                            color={
                              PROJECT_UPDATE_SEVERITY_COLORS[entrySeverity]
                            }
                          />
                        }
                        triggerVariant="inlineChip"
                        disabled={!onPatch || posting || isEditing}
                      />
                    ) : (
                      <PropertyDropdown
                        value={entry.kind}
                        options={KIND_OPTIONS}
                        onChange={(next) => {
                          void onPatch?.(entry.id, {
                            kind: next,
                            status: coerceProjectUpdateStatusForKind(
                              next,
                              entry.status,
                            ),
                            severity:
                              next === "incident" ? entrySeverity : null,
                          });
                        }}
                        searchPlaceholder="Category"
                        ariaLabel="Category"
                        fallbackLabel="Category"
                        fallbackIcon={<ProjectUpdateKindUpdateIcon size={14} />}
                        triggerVariant="inlineChip"
                        disabled={!onPatch || posting || isEditing}
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
                        onClick={() => {
                          void saveEdit(entry.id);
                        }}
                        disabled={
                          savingEdit ||
                          !editTitle.trim() ||
                          !editBody.trim()
                        }
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : menuItems.length > 0 ? (
                    <EntityActionsMenu
                      ariaLabel="Update actions"
                      triggerAriaLabel="Update actions"
                      triggerClassName="project-updates__item-menu-trigger"
                      disabled={!canMutate}
                      items={menuItems}
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
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEdit();
                        }
                      }}
                      placeholder="Title"
                      aria-label="Edit update title"
                      disabled={savingEdit}
                      autoFocus
                    />
                    <TaskCommentEditor
                      editorRef={editBodyEditorRef}
                      className="project-updates__comment project-updates__comment--item"
                      variant="edit"
                      value={editBody}
                      onChange={setEditBody}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEdit();
                        }
                      }}
                      onSubmitShortcut={() => {
                        void saveEdit(entry.id);
                      }}
                      placeholder="Write an update…"
                      ariaLabel="Edit update body"
                      disabled={savingEdit}
                    />
                  </div>
                ) : (
                  <>
                    <div className="project-updates__item-header">
                      <h3 className="project-updates__item-title">
                        {entry.title}
                      </h3>
                      <time
                        className="project-updates__item-when"
                        dateTime={entry.createdAt}
                      >
                        {formatWhen(entry.createdAt)}
                      </time>
                    </div>
                    <div className="project-updates__item-body">
                      <DocumentMarkdownPreview body={entry.body} />
                    </div>
                  </>
                )}
                <div className="project-updates__related">
                  <h4 className="project-updates__changelog-title">
                    {entry.kind === "incident" ? "Timeline" : "Changelog"}
                  </h4>
                  {entry.kind === "incident" ? (
                    <TaskRelatedChips
                      values={entry.relatedTaskIds ?? []}
                      options={relatedDropdownOptions}
                      onChange={
                        onPatch
                          ? (next) => {
                              const current = entry.relatedTaskIds ?? [];
                              const currentSet = new Set(current);
                              const nextSet = new Set(next);
                              const added = next.filter(
                                (id) => !currentSet.has(id),
                              );
                              const kept = current.filter((id) =>
                                nextSet.has(id),
                              );
                              void onPatch(entry.id, {
                                relatedTaskIds: [...added, ...kept],
                              });
                            }
                          : undefined
                      }
                      disabled={!onPatch || posting || savingEdit}
                      emptyLabel="Related"
                      searchPlaceholder="Add related task…"
                      ariaLabel="Related tasks"
                      variant="inline"
                      showSelectedChips={false}
                      addTrigger="plus"
                    />
                  ) : null}
                  <ProjectUpdateRelatedTimeline
                    items={buildTimelineItems(entry.relatedTaskIds ?? [])}
                    onOpenItem={onOpenRelatedTask}
                    onRemoveItem={
                      onPatch
                        ? (taskId) => {
                            void onPatch(entry.id, {
                              relatedTaskIds: (entry.relatedTaskIds ?? []).filter(
                                (id) => id !== taskId,
                              ),
                            });
                          }
                        : undefined
                    }
                    statusPlacement={
                      entry.kind === "incident" ? "inline" : "below"
                    }
                  />
                  {entry.kind !== "incident" ? (
                    <TaskRelatedChips
                      values={entry.relatedTaskIds ?? []}
                      options={relatedDropdownOptions}
                      onChange={
                        onPatch
                          ? (next) => {
                              void onPatch(entry.id, {
                                relatedTaskIds: next,
                              });
                            }
                          : undefined
                      }
                      disabled={!onPatch || posting || savingEdit}
                      emptyLabel="Related"
                      searchPlaceholder="Add related task…"
                      ariaLabel="Related tasks"
                      variant="inline"
                      showSelectedChips={false}
                      addTrigger="plus"
                    />
                  ) : null}
                </div>
                <div className="project-updates__item-meta project-updates__item-meta--footer">
                  <PropertyDropdown
                    value={coerceProjectUpdateStatusForKind(
                      entry.kind,
                      entry.status,
                    )}
                    options={statusOptionsForKind(entry.kind)}
                    onChange={(next) => {
                      void onPatch?.(entry.id, { status: next });
                    }}
                    searchPlaceholder="Status"
                    ariaLabel="Status"
                    fallbackLabel={
                      PROJECT_UPDATE_STATUS_LABELS[
                        coerceProjectUpdateStatusForKind(
                          entry.kind,
                          entry.status,
                        )
                      ]
                    }
                    fallbackIcon={statusFallbackIcon(
                      coerceProjectUpdateStatusForKind(
                        entry.kind,
                        entry.status,
                      ),
                    )}
                    triggerVariant="inlineChip"
                    disabled={!onPatch || posting}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete ? (
        <ProjectUpdateDeleteConfirmModal
          title={pendingDelete.title}
          deleting={deleting}
          onConfirm={() => {
            void confirmDelete();
          }}
          onCancel={() => {
            if (!deleting) setPendingDelete(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectUpdateDeleteConfirmModal({
  title,
  deleting,
  onConfirm,
  onCancel,
}: {
  title: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!deleting) onCancel();
        return;
      }
      if (event.key === "d" || event.key === "D") {
        if (deleting) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [deleting, onCancel, onConfirm]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-entity-delete-modal=""
    >
      <button
        type="button"
        aria-label="Cancel delete"
        className="entity-delete-modal-backdrop"
        disabled={deleting}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-update-delete-modal-title"
        className="entity-delete-modal"
      >
        <h2
          id="project-update-delete-modal-title"
          className="entity-delete-modal-title"
        >
          Delete update?
        </h2>
        <p className="entity-delete-modal-body">
          Remove “{title}”. This cannot be undone. Press{" "}
          <kbd className="entity-delete-modal-kbd">D</kbd> again to confirm, or{" "}
          <kbd className="entity-delete-modal-kbd">Esc</kbd> to cancel.
        </p>
        <div className="entity-delete-modal-actions">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="entity-delete-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="entity-delete-modal-confirm"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
