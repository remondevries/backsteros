import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@tanstack/react-router";

import { BacksterosContactPersonIcon } from "~/backsteros/ContactPersonIcon";
import { createBacksterosTask, fetchBacksterosContacts } from "~/backsteros/client";
import {
  getNextComposeTaskTabField,
  type ComposeTaskTabField,
} from "~/backsteros/compose-task-tab-flow";
import { BacksterosDueDatePropertyMenu } from "~/backsteros/DueDatePropertyMenu";
import { BacksterosEntityAvatarIcon } from "~/backsteros/EntityAvatarIcon";
import { isBacksterosPropertyMenuOpen } from "~/backsteros/isBacksterosPropertyMenuOpen";
import {
  BacksterosMarkdownDescription,
  type BacksterosMarkdownDescriptionMode,
  useContentViewModeShortcut,
} from "~/backsteros/markdown-editor";
import { openBacksterosTaskChat } from "~/backsteros/openTaskChat";
import { openTaskPropertyDropdown } from "~/backsteros/openTaskPropertyDropdown";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "~/backsteros/SearchablePropertyMenu";
import { FloatingPillToggleDock, SegmentedPillToggle } from "~/backsteros/SegmentedPillToggle";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import {
  BACKSTEROS_TASK_PRIORITY_LABELS,
  getBacksterosTaskPriorityLabel,
} from "~/backsteros/taskDetailFormat";
import { BacksterosTaskPriorityIcon } from "~/backsteros/TaskPriorityIcon";
import { BacksterosTaskStatusIcon } from "~/backsteros/TaskStatusIcon";
import {
  BACKSTEROS_TASK_STATUS_ORDER,
  getBacksterosTaskStatusLabel,
  type BacksterosTaskStatus,
} from "~/backsteros/taskStatus";
import type { BacksterosCodebaseProject, BacksterosContact } from "~/backsteros/types";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosContactAvatarSrcMap } from "~/backsteros/useBacksterosContactAvatars";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import { useTaskPropertyDropdownShortcuts } from "~/backsteros/useTaskPropertyDropdownShortcuts";
import { useProjects } from "~/state/entities";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import "~/backsteros/backsterosPropertyMenu.css";
import "~/backsteros/overview-name-editor.css";
import "~/backsteros/backsteros-compose-modal.css";

const UNASSIGNED_VALUE = "__unassigned__";

function CreateTaskDescriptionSection(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly onTabFromEdit: () => void;
}) {
  const { value, onChange, disabled, hostRef, onTabFromEdit } = props;
  const [mode, setMode] = useState<BacksterosMarkdownDescriptionMode>("edit");

  const setViewMode = useCallback((next: BacksterosMarkdownDescriptionMode) => {
    setMode(next);
    if (next === "preview") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      const focusedCm = document.querySelector(".cm-editor.cm-focused .cm-content");
      if (focusedCm instanceof HTMLElement) focusedCm.blur();
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode(mode === "edit" ? "preview" : "edit");
  }, [mode, setViewMode]);

  useContentViewModeShortcut({
    enabled: !disabled,
    onToggle: toggleViewMode,
    onForcePreview: () => setViewMode("preview"),
    hostRef,
  });

  useEffect(() => {
    if (mode !== "edit") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        const host = hostRef.current;
        const target = event.target;
        if (!(target instanceof Node) || !host?.contains(target)) return;
        event.preventDefault();
        event.stopPropagation();
        onTabFromEdit();
        return;
      }

      if (event.key !== "Escape" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;
      const host = hostRef.current;
      const target = event.target;
      if (
        !(target instanceof Node) ||
        !host ||
        (!host.contains(target) && !(target instanceof Element && target.closest(".cm-editor")))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setViewMode("preview");
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [hostRef, mode, onTabFromEdit, setViewMode]);

  return (
    <div className="bos-task-description-section bos-compose-modal-description" ref={hostRef}>
      <BacksterosMarkdownDescription
        mode={mode}
        value={value}
        onChange={onChange}
        disabled={disabled}
        ariaLabel="Task description"
        placeholder="Add a description…"
        emptyMessage="Add a description…"
        // Keep title autofocus on open; user clicks or ⌘E to focus the editor.
        focusOnEdit={false}
        toggle={
          <FloatingPillToggleDock>
            <SegmentedPillToggle
              value={mode}
              options={[
                { value: "preview", label: "Preview" },
                { value: "edit", label: "Edit" },
              ]}
              onChange={setViewMode}
              ariaLabel="Content view mode"
              disabled={disabled}
            />
          </FloatingPillToggleDock>
        }
      />
    </div>
  );
}

export function BacksterosCreateTaskForm({
  initialProject,
}: {
  readonly initialProject: BacksterosCodebaseProject;
}) {
  const router = useRouter();
  const projects = useProjects();
  const ensureT3Project = useEnsureBacksterosT3Project();
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);
  const openCreateTaskDetail = useBacksterosTaskDetailUiStore(
    (state) => state.openCreateTaskDetail,
  );
  const closeCompose = useBacksterosTaskDetailUiStore((state) => state.closeCompose);
  const { state: projectsState } = useBacksterosCodebaseProjects(true);

  const [selectedProject, setSelectedProject] = useState(initialProject);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<BacksterosTaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<readonly BacksterosContact[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const descriptionHostRef = useRef<HTMLDivElement | null>(null);
  const composeTabCursorRef = useRef<ComposeTaskTabField>("description");
  const modalRef = useRef<HTMLDivElement | null>(null);

  // S / P / A / Shift+D / Shift+P while compose is open (desktop parity).
  useTaskPropertyDropdownShortcuts({ enabled: !submitting });

  useEffect(() => {
    const controller = new AbortController();
    void fetchBacksterosContacts(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setContacts(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setContacts([]);
      });
    return () => controller.abort();
  }, []);

  const codebaseProjects = useMemo((): readonly BacksterosCodebaseProject[] => {
    if (projectsState.status === "ready") return projectsState.projects;
    return [selectedProject];
  }, [projectsState, selectedProject]);

  const projectOptions = useMemo((): readonly BacksterosSearchablePropertyOption[] => {
    return codebaseProjects.map((entry) => ({
      value: entry.id,
      label: entry.name,
      searchText: `${entry.key} ${entry.name}`,
      icon: (
        <ProjectOcticon
          icon={entry.icon}
          type={entry.type}
          size={14}
          className="shrink-0 opacity-70"
        />
      ),
    }));
  }, [codebaseProjects]);

  const statusOptions = useMemo(
    (): BacksterosSearchablePropertyOption<BacksterosTaskStatus>[] =>
      BACKSTEROS_TASK_STATUS_ORDER.map((entry) => ({
        value: entry,
        label: getBacksterosTaskStatusLabel(entry),
        searchText: entry.replaceAll("_", " "),
        icon: <BacksterosTaskStatusIcon status={entry} size={14} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    (): BacksterosSearchablePropertyOption[] =>
      BACKSTEROS_TASK_PRIORITY_LABELS.map((label, value) => ({
        value: String(value),
        label,
        icon: <BacksterosTaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  const avatarSrcById = useBacksterosContactAvatarSrcMap(contacts);
  const assignee = useMemo(
    () => contacts.find((contact) => contact.id === assigneeId) ?? null,
    [assigneeId, contacts],
  );

  const assigneeOptions = useMemo((): BacksterosSearchablePropertyOption[] => {
    const unassigned: BacksterosSearchablePropertyOption = {
      value: UNASSIGNED_VALUE,
      label: "Unassigned",
      searchText: "unassigned none clear",
      icon: <BacksterosContactPersonIcon size={14} className="opacity-70" />,
    };
    const contactOptions = contacts.map((contact, index) => ({
      value: contact.id,
      label: contact.name,
      searchText: [contact.name, contact.firstName, contact.lastName, contact.email]
        .filter(Boolean)
        .join(" "),
      icon: <BacksterosEntityAvatarIcon src={avatarSrcById[contact.id] ?? null} size={14} />,
      separatorBefore: index === 0,
    }));
    return [unassigned, ...contactOptions];
  }, [avatarSrcById, contacts]);
  const canSubmit = title.trim().length > 0 && !submitting;

  const handleProjectChange = useCallback(
    (projectId: string) => {
      const next = codebaseProjects.find((entry) => entry.id === projectId);
      if (!next || next.id === selectedProject.id) return;
      setSelectedProject(next);
      // Keep store in sync for rail context without remounting this form.
      openCreateTaskDetail(next);
      window.requestAnimationFrame(() => {
        titleInputRef.current?.focus();
      });
    },
    [codebaseProjects, openCreateTaskDetail, selectedProject.id],
  );

  const focusComposeTaskField = useCallback((field: ComposeTaskTabField) => {
    const scope = modalRef.current;
    switch (field) {
      case "description": {
        const content =
          descriptionHostRef.current?.querySelector<HTMLElement>(".cm-content") ??
          descriptionHostRef.current?.querySelector<HTMLElement>("[contenteditable='true']");
        content?.focus();
        return;
      }
      case "status":
        openTaskPropertyDropdown("status", scope);
        return;
      case "dueDate":
        openTaskPropertyDropdown("dueDate", scope);
        return;
      case "priority":
        openTaskPropertyDropdown("priority", scope);
        return;
      case "assignee":
        openTaskPropertyDropdown("assignee", scope);
        return;
      case "submit":
        submitButtonRef.current?.focus();
        return;
      default:
        return;
    }
  }, []);

  const advanceComposeTaskTab = useCallback(() => {
    const nextField = getNextComposeTaskTabField(composeTabCursorRef.current, {
      statusEnabled: true,
      assigneeEnabled: contacts.length > 0,
    });
    if (!nextField) return;
    composeTabCursorRef.current = nextField;
    focusComposeTaskField(nextField);
  }, [contacts.length, focusComposeTaskField]);

  const openComposeProjectDropdown = useCallback(() => {
    if (submitting) return;
    openTaskPropertyDropdown("project", modalRef.current);
  }, [submitting]);

  const handleCreate = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;

    setSubmitting(true);
    try {
      const created = await createBacksterosTask({
        title: trimmedTitle,
        projectId: selectedProject.id,
        description: description.trim() || null,
        status,
        priority,
        dueDate,
        assigneeId,
      });

      closeCompose();
      openTaskDetail({ taskId: created.id, project: selectedProject });
      await openBacksterosTaskChat({
        task: created,
        backsterosProject: selectedProject,
        projects,
        ensureT3Project,
        navigate: (opts) => router.navigate(opts as never),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not create task",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    assigneeId,
    closeCompose,
    description,
    dueDate,
    ensureT3Project,
    openTaskDetail,
    priority,
    projects,
    router,
    selectedProject,
    status,
    submitting,
    title,
  ]);

  // Desktop compose Tab / Shift+Tab / Escape ownership while the modal is open.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      if (event.key === "Tab" && event.shiftKey && !event.metaKey && !event.ctrlKey) {
        if (isBacksterosPropertyMenuOpen()) return;
        if (event.target === titleInputRef.current) {
          event.preventDefault();
          event.stopPropagation();
          openComposeProjectDropdown();
        }
        return;
      }

      if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        if (isBacksterosPropertyMenuOpen()) return;
        if (event.target === titleInputRef.current) {
          // Browser would leave the dialog; send focus into description → properties.
          event.preventDefault();
          event.stopPropagation();
          composeTabCursorRef.current = "description";
          focusComposeTaskField("description");
          return;
        }
        if (event.target === submitButtonRef.current) return;

        const modal = modalRef.current;
        const active = document.activeElement;
        const inModal =
          modal instanceof HTMLElement && active instanceof Node && modal.contains(active);
        const focusRecoverable = active === document.body || active === null;
        if (!inModal && !focusRecoverable) return;
        // Description Tab is handled in CreateTaskDescriptionSection.
        if (
          active instanceof Element &&
          (active.closest(".cm-editor") || active.closest(".bos-compose-modal-description"))
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        advanceComposeTaskTab();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [advanceComposeTaskTab, focusComposeTaskField, openComposeProjectDropdown]);

  const propertyMenus = (
    <>
      <BacksterosSearchablePropertyMenu
        label={getBacksterosTaskStatusLabel(status)}
        icon={<BacksterosTaskStatusIcon status={status} size={12} className="shrink-0" />}
        value={status}
        options={statusOptions}
        searchPlaceholder="Set status…"
        disabled={submitting}
        taskPropertyDropdownId="status"
        onChange={setStatus}
      />

      <BacksterosSearchablePropertyMenu
        label={getBacksterosTaskPriorityLabel(priority)}
        icon={<BacksterosTaskPriorityIcon priority={priority} size={12} />}
        value={String(priority)}
        options={priorityOptions}
        searchPlaceholder="Set priority…"
        disabled={submitting}
        taskPropertyDropdownId="priority"
        onChange={(value) => setPriority(Number(value))}
      />

      <BacksterosDueDatePropertyMenu
        dueDate={dueDate}
        status={status}
        disabled={submitting}
        onChange={setDueDate}
      />

      <BacksterosSearchablePropertyMenu
        label={assignee?.name ?? "Unassigned"}
        muted={!assignee}
        icon={
          assignee ? (
            <BacksterosEntityAvatarIcon src={avatarSrcById[assignee.id] ?? null} size={12} />
          ) : (
            <BacksterosContactPersonIcon size={12} className="opacity-70" />
          )
        }
        value={assigneeId ?? UNASSIGNED_VALUE}
        options={assigneeOptions}
        searchPlaceholder="Set assignee…"
        disabled={submitting}
        taskPropertyDropdownId="assignee"
        onChange={(value) => {
          setAssigneeId(value === UNASSIGNED_VALUE ? null : value);
        }}
      />
    </>
  );

  return (
    <div ref={modalRef}>
      <div className="bos-compose-modal-body">
        <div className="bos-compose-modal-header">
          <BacksterosSearchablePropertyMenu
            label={selectedProject.name}
            value={selectedProject.id}
            options={projectOptions}
            searchPlaceholder="Set project…"
            ariaLabel="Project"
            disabled={submitting}
            taskPropertyDropdownId="project"
            icon={
              <ProjectOcticon
                icon={selectedProject.icon}
                type={selectedProject.type}
                size={12}
                className="shrink-0 opacity-70"
              />
            }
            onChange={handleProjectChange}
          />
        </div>

        <div className="bos-compose-modal-text-fields">
          <div className="bos-overview-name-editor">
            <h1 className="bos-overview-name-editor__title text-[20px] font-semibold leading-[1.25] tracking-[-0.02em]">
              <textarea
                ref={titleInputRef}
                autoFocus
                rows={1}
                value={title}
                onChange={(event) => {
                  const next = event.target.value.replace(/[\n\r\u2028\u2029]/g, "");
                  setTitle(next);
                  event.currentTarget.style.height = "0px";
                  event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if ((event.metaKey || event.ctrlKey) && canSubmit) {
                      void handleCreate();
                    }
                  }
                }}
                placeholder="Task title"
                aria-label="Task name"
                data-compose-modal-text-field=""
                className="bos-overview-name-editor__input"
                disabled={submitting}
              />
            </h1>
          </div>

          <CreateTaskDescriptionSection
            value={description}
            onChange={setDescription}
            disabled={submitting}
            hostRef={descriptionHostRef}
            onTabFromEdit={() => {
              composeTabCursorRef.current = "description";
              advanceComposeTaskTab();
            }}
          />
        </div>
      </div>

      <div className="bos-compose-modal-footer">
        <div className="bos-compose-modal-properties">{propertyMenus}</div>
        <div className="bos-compose-modal-actions">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={submitting}
            onClick={closeCompose}
          >
            Cancel
          </Button>
          <Button
            ref={submitButtonRef}
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void handleCreate()}
            onFocus={() => {
              composeTabCursorRef.current = "submit";
            }}
          >
            {submitting ? "Creating…" : "Create task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BacksterosComposeModal() {
  const composeProject = useBacksterosTaskDetailUiStore((state) => state.composeProject);
  const closeCompose = useBacksterosTaskDetailUiStore((state) => state.closeCompose);

  useEffect(() => {
    if (!composeProject) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;

      // Open property popover: let Base UI close it; do not dismiss compose.
      // Sidepanel Escape is separately gated while compose is open.
      if (isBacksterosPropertyMenuOpen()) {
        return;
      }

      // Description edit mode with focus in the editor consumes Escape first.
      const editHost = document.querySelector(
        '[data-compose-modal] [data-content-view-mode="edit"]',
      );
      if (
        editHost &&
        event.target instanceof Node &&
        (editHost.contains(event.target) ||
          (event.target instanceof Element && event.target.closest(".cm-editor")))
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeCompose();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeCompose, composeProject]);

  if (!composeProject || typeof document === "undefined") return null;

  return createPortal(
    <div className="bos-compose-modal-root" data-blocking-modal="">
      <button
        type="button"
        className="bos-compose-modal-overlay"
        aria-label="Close create task"
        onClick={closeCompose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create BacksterOS task"
        className="bos-compose-modal-dialog"
        data-compose-modal=""
      >
        <div className="bos-compose-modal-shell">
          <BacksterosCreateTaskForm initialProject={composeProject} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
