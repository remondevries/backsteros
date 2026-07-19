"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  getComposeKindForShortcutKey,
  hasCmdShiftArrowShortcutModifiers,
  isHorizontalArrowKey,
  type ComposeKind,
} from "../compose-modal-events.js";
import {
  buildComposeFolderCascadeSegments,
  COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  folderPathFromComposeFolderValue,
  resolveComposeDocumentFolderValue,
  type ComposeDocumentFoldersByTarget,
} from "../compose-document-folders.js";
import {
  getNextComposeTaskTabField,
  type ComposeTaskTabField,
} from "../compose-task-tab-flow.js";
import {
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  COMPOSE_NO_PROJECT_VALUE,
  isComposeKnowledgeBaseValue,
  isComposeTasksPagePathname,
  resolveComposeContextDocumentTarget,
  resolveComposeContextDueDate,
  resolveComposeContextKind,
  resolveComposeContextProjectId,
} from "../compose-task.js";
import { requestCloseSearchableDropdowns } from "../searchable-dropdown-events.js";
import type { SearchableDropdownMenuApi } from "../searchable-dropdown-menu-api.js";
import { formatDueDateInputValue } from "../task-due-date.js";
import { getTaskStatusLabel, TASK_STATUS_ORDER, type TaskStatus } from "../task-status.js";
import {
  focusAndSelectTitleInput,
  isTitleRenameShortcut,
} from "../title-rename-shortcut.js";
import { ComposeAssigneeDropdown } from "./compose-assignee-dropdown.js";
import { ComposeDueDateDropdown } from "./compose-due-date-dropdown.js";
import { ComposeFolderIcon } from "./compose-folder-icon.js";
import type { AssigneeDropdownContact } from "./dropdown-options.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import { getDisplayProjectIcon, ProjectOcticon } from "./project-octicon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { KnowledgeBaseNavIcon } from "./sidebar-nav-icons.js";
import { TaskStatusIcon } from "./task-status-icon.js";

const NO_PROJECT_VALUE = COMPOSE_NO_PROJECT_VALUE;
const KNOWLEDGE_BASE_VALUE = COMPOSE_KNOWLEDGE_BASE_VALUE;
const CREATE_TASK_DESCRIPTION_MIN_HEIGHT_PX = 48;
const CREATE_TASK_DESCRIPTION_MAX_HEIGHT_PX = 320;

function isComposeSubmitShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

function buildComposeTaskStatusOptions(): SearchableDropdownOption<TaskStatus>[] {
  return TASK_STATUS_ORDER.map((value) => {
    const label = getTaskStatusLabel(value);
    return {
      value,
      label,
      searchTerms: value.replaceAll("_", " "),
      icon: <TaskStatusIcon status={value} title={label} size={14} />,
    };
  });
}

function getDefaultStatus(): TaskStatus {
  return "triage";
}

export type ComposeModalProject = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color?: string | null;
  dueDate?: Date | null;
};

export type ComposeModalCreateTaskInput = {
  title: string;
  description: string;
  projectId: string | null;
  status?: string;
  dueDate: string | null;
  assigneeId: string | null;
};

export type ComposeModalCreateDocumentInput = {
  title: string;
  target: "knowledge" | "project";
  projectId?: string;
  folderPath: string;
};

export type ComposeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  projects: ComposeModalProject[];
  contacts: AssigneeDropdownContact[];
  defaultAssigneeId: string | null;
  documentFoldersByTarget: ComposeDocumentFoldersByTarget;
  contextLoading?: boolean;
  contextError?: string | null;
  onCreateTask: (input: ComposeModalCreateTaskInput) => Promise<{ href: string }>;
  onCreateDocument: (
    input: ComposeModalCreateDocumentInput,
  ) => Promise<{ href: string }>;
  onNavigate: (href: string) => void;
  /** Optional link for empty projects CTA; if omitted render plain text. */
  projectsHref?: string;
};

export function ComposeModal({
  open,
  onOpenChange,
  pathname,
  projects,
  contacts,
  defaultAssigneeId,
  documentFoldersByTarget,
  contextLoading = false,
  contextError = null,
  onCreateTask,
  onCreateDocument,
  onNavigate,
  projectsHref,
}: ComposeModalProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const composeTabCursorRef = useRef<ComposeTaskTabField>("description");
  const projectMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const folderMenuRefs = useRef<Record<number, SearchableDropdownMenuApi | null>>(
    {},
  );
  const breadcrumbScrollRef = useRef<HTMLDivElement>(null);
  const breadcrumbTrackRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const dueDateMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const assigneeMenuRef = useRef<SearchableDropdownMenuApi | null>(null);
  const [kind, setKind] = useState<ComposeKind>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [documentProjectId, setDocumentProjectId] = useState<string | null>(null);
  const [documentFolderId, setDocumentFolderId] = useState(
    COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  );
  const [status, setStatus] = useState<TaskStatus>("triage");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);
  const [error, setError] = useState<string | null>(null);
  const [showBreadcrumbFade, setShowBreadcrumbFade] = useState(false);
  const [pending, setPending] = useState(false);

  const navigateAfterCompose = useCallback(
    (href: string) => {
      onOpenChange(false);
      onNavigate(href);
    },
    [onOpenChange, onNavigate],
  );

  useLayoutEffect(() => {
    const element = descriptionTextareaRef.current;
    if (!element || !open || kind !== "task") {
      return;
    }

    element.style.height = "auto";
    const scrollHeight = element.scrollHeight;
    const nextHeight = Math.min(
      Math.max(scrollHeight, CREATE_TASK_DESCRIPTION_MIN_HEIGHT_PX),
      CREATE_TASK_DESCRIPTION_MAX_HEIGHT_PX,
    );
    element.style.overflowY =
      scrollHeight > CREATE_TASK_DESCRIPTION_MAX_HEIGHT_PX ? "auto" : "hidden";
    element.style.height = `${nextHeight}px`;
  }, [description, kind, open]);

  const composeResetKey = open
    ? `${pathname}|${defaultAssigneeId}|${projects.length}`
    : "";
  const [prevComposeResetKey, setPrevComposeResetKey] = useState("");
  if (open && composeResetKey !== prevComposeResetKey) {
    setPrevComposeResetKey(composeResetKey);
    const contextProjectId = resolveComposeContextProjectId(pathname, projects);
    const contextDocumentTarget = resolveComposeContextDocumentTarget(
      pathname,
      projects,
    );
    setKind(resolveComposeContextKind(pathname));
    setTitle("");
    setDescription("");
    setTaskProjectId(contextProjectId);
    setDocumentProjectId(contextDocumentTarget);
    setDocumentFolderId(
      resolveComposeDocumentFolderValue(
        contextDocumentTarget,
        pathname,
        contextDocumentTarget,
        documentFoldersByTarget,
      ),
    );
    setStatus("triage");
    setDueDate(resolveComposeContextDueDate(pathname, projects));
    setAssigneeId(defaultAssigneeId);
    setError(null);
  } else if (!open && prevComposeResetKey !== "") {
    setPrevComposeResetKey("");
  }

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    composeTabCursorRef.current = "description";

    const focusTitle = () => {
      titleInputRef.current?.focus();
    };

    const frame = requestAnimationFrame(focusTitle);

    const handleWindowFocus = () => {
      requestAnimationFrame(focusTitle);
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [open, composeResetKey]);

  const registerProjectMenu = useCallback(
    (api: SearchableDropdownMenuApi | null) => {
      projectMenuRef.current = api;
    },
    [],
  );

  const registerFolderMenuAt = useCallback((index: number) => {
    return (api: SearchableDropdownMenuApi | null) => {
      if (api) {
        folderMenuRefs.current[index] = api;
        return;
      }

      delete folderMenuRefs.current[index];
    };
  }, []);

  const registerStatusMenu = useCallback(
    (api: SearchableDropdownMenuApi | null) => {
      statusMenuRef.current = api;
    },
    [],
  );

  const registerDueDateMenu = useCallback(
    (api: SearchableDropdownMenuApi | null) => {
      dueDateMenuRef.current = api;
    },
    [],
  );

  const registerAssigneeMenu = useCallback(
    (api: SearchableDropdownMenuApi | null) => {
      assigneeMenuRef.current = api;
    },
    [],
  );

  const focusComposeTaskField = useCallback((field: ComposeTaskTabField) => {
    switch (field) {
      case "description":
        descriptionTextareaRef.current?.focus();
        return;
      case "status":
        statusMenuRef.current?.open();
        return;
      case "dueDate":
        dueDateMenuRef.current?.open();
        return;
      case "assignee":
        assigneeMenuRef.current?.open();
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
      statusEnabled: Boolean(taskProjectId),
      assigneeEnabled: contacts.length > 0,
    });

    if (!nextField) {
      return;
    }

    composeTabCursorRef.current = nextField;
    focusComposeTaskField(nextField);
  }, [contacts.length, focusComposeTaskField, taskProjectId]);

  const openComposeProjectDropdown = useCallback(() => {
    if (pending) {
      return;
    }

    projectMenuRef.current?.open();
  }, [pending]);

  const openComposeFolderDropdown = useCallback(() => {
    if (pending) {
      return;
    }

    const indices = Object.keys(folderMenuRefs.current)
      .map((key) => Number(key))
      .sort((left, right) => right - left);
    const deepestIndex = indices[0];

    if (deepestIndex != null) {
      folderMenuRefs.current[deepestIndex]?.open();
      return;
    }

    folderMenuRefs.current[0]?.open();
  }, [pending]);

  const focusComposeTitle = useCallback(() => {
    requestCloseSearchableDropdowns();
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }, []);

  const handleComposeProjectTabFromSearch = useCallback(() => {
    if (
      kind === "document" &&
      documentProjectId &&
      (documentFoldersByTarget[documentProjectId]?.length ?? 0) > 0
    ) {
      openComposeFolderDropdown();
      return;
    }

    focusComposeTitle();
  }, [
    documentFoldersByTarget,
    documentProjectId,
    focusComposeTitle,
    kind,
    openComposeFolderDropdown,
  ]);

  const handleComposeFolderTabFromSearch = useCallback(() => {
    focusComposeTitle();
  }, [focusComposeTitle]);

  const handleKindChange = useCallback(
    (nextKind: ComposeKind) => {
      setKind(nextKind);
      setError(null);
      if (nextKind === "document") {
        setDocumentFolderId(
          resolveComposeDocumentFolderValue(
            documentProjectId,
            pathname,
            resolveComposeContextDocumentTarget(pathname, projects),
            documentFoldersByTarget,
          ),
        );
      }
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
      });
    },
    [documentFoldersByTarget, documentProjectId, pathname, projects],
  );

  const submitTask = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Task title is required.");
      titleInputRef.current?.focus();
      return;
    }

    if (pending) {
      return;
    }

    setPending(true);
    setError(null);
    const resolvedProjectId = taskProjectId?.trim() ? taskProjectId : null;

    onCreateTask({
      title: trimmedTitle,
      description,
      projectId: resolvedProjectId,
      status: resolvedProjectId ? status : undefined,
      dueDate,
      assigneeId,
    })
      .then((result) => {
        navigateAfterCompose(result.href);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not create task.");
      })
      .finally(() => {
        setPending(false);
      });
  }, [
    assigneeId,
    description,
    dueDate,
    navigateAfterCompose,
    onCreateTask,
    pending,
    status,
    taskProjectId,
    title,
  ]);

  const submitDocument = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Document title is required.");
      titleInputRef.current?.focus();
      return;
    }

    if (!documentProjectId) {
      setError("Select Knowledge Base or a project for this document.");
      return;
    }

    if (pending) {
      return;
    }

    const isKnowledgeBase = isComposeKnowledgeBaseValue(documentProjectId);
    const folderPath = folderPathFromComposeFolderValue(documentFolderId);

    setPending(true);
    setError(null);

    const input: ComposeModalCreateDocumentInput = isKnowledgeBase
      ? { title: trimmedTitle, target: "knowledge", folderPath }
      : {
          title: trimmedTitle,
          target: "project",
          projectId: documentProjectId,
          folderPath,
        };

    onCreateDocument(input)
      .then((result) => {
        navigateAfterCompose(result.href);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Could not create document.",
        );
      })
      .finally(() => {
        setPending(false);
      });
  }, [
    documentFolderId,
    documentProjectId,
    navigateAfterCompose,
    onCreateDocument,
    pending,
    title,
  ]);

  const canSubmit = useMemo(() => {
    if (pending || contextLoading) {
      return false;
    }

    if (!title.trim()) {
      return false;
    }

    if (kind === "task") {
      return true;
    }

    return Boolean(documentProjectId) && projects.length > 0;
  }, [contextLoading, documentProjectId, kind, pending, projects.length, title]);

  const submit = useCallback(() => {
    if (!canSubmit) {
      return;
    }

    if (kind === "task") {
      submitTask();
      return;
    }

    submitDocument();
  }, [canSubmit, kind, submitDocument, submitTask]);

  const handleComposeTitleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab" && event.shiftKey) {
        if (document.querySelector("[data-searchable-dropdown-panel]")) {
          return;
        }

        event.preventDefault();

        if (
          kind === "document" &&
          documentProjectId &&
          (documentFoldersByTarget[documentProjectId]?.length ?? 0) > 0
        ) {
          openComposeFolderDropdown();
          return;
        }

        openComposeProjectDropdown();
        return;
      }

      if (
        kind === "document" &&
        event.key === "Enter" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        canSubmit
      ) {
        event.preventDefault();
        event.stopPropagation();
        submit();
      }
    },
    [
      canSubmit,
      documentFoldersByTarget,
      documentProjectId,
      kind,
      openComposeFolderDropdown,
      openComposeProjectDropdown,
      submit,
    ],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTitleRenameShortcut(event)) {
        if (document.querySelector("[data-searchable-dropdown-panel]")) {
          event.preventDefault();
          event.stopPropagation();
          requestCloseSearchableDropdowns();
        } else {
          event.preventDefault();
          event.stopPropagation();
        }
        window.requestAnimationFrame(() => {
          focusAndSelectTitleInput(titleInputRef.current);
        });
        return;
      }

      if (event.key === "Escape") {
        if (document.querySelector("[data-searchable-dropdown-panel]")) {
          event.preventDefault();
          event.stopPropagation();
          requestCloseSearchableDropdowns();
          window.requestAnimationFrame(() => {
            titleInputRef.current?.focus();
          });
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        return;
      }

      if (isComposeSubmitShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (canSubmit) {
          submit();
        }
        return;
      }

      if (kind === "task" && event.key === "Tab" && !event.shiftKey) {
        if (document.querySelector("[data-searchable-dropdown-panel]")) {
          return;
        }

        const target = event.target;
        if (target === titleInputRef.current || target === descriptionTextareaRef.current) {
          return;
        }

        const modal = document.querySelector("[data-compose-modal]");
        const activeElement = document.activeElement;
        const focusIsInModal =
          modal instanceof HTMLElement &&
          activeElement instanceof Node &&
          modal.contains(activeElement);
        const focusIsRecoverable =
          activeElement === document.body || activeElement === null;

        if (!focusIsInModal && !focusIsRecoverable) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        advanceComposeTaskTab();
        return;
      }

      if (
        !isHorizontalArrowKey(event) ||
        !hasCmdShiftArrowShortcutModifiers(event)
      ) {
        return;
      }

      if (document.querySelector("[data-searchable-dropdown-panel]")) {
        return;
      }

      const nextKind = getComposeKindForShortcutKey(event.key, event.code);
      if (!nextKind || nextKind === kind) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleKindChange(nextKind);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [
    advanceComposeTaskTab,
    canSubmit,
    handleKindChange,
    kind,
    onOpenChange,
    open,
    submit,
  ]);

  const taskProjectOptions = useMemo(
    () => [
      {
        value: NO_PROJECT_VALUE,
        label: "No project",
        searchTerms: "no project unassigned",
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(null)}
            size={14}
            className="text-foreground/70"
          />
        ),
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(project.icon)}
            size={14}
            className="text-foreground/70"
          />
        ),
      })),
    ],
    [projects],
  );

  const documentProjectOptions = useMemo(
    () => [
      {
        value: KNOWLEDGE_BASE_VALUE,
        label: "Knowledge Base",
        searchTerms: "knowledge base kb documentation wiki",
        icon: <KnowledgeBaseNavIcon className="size-3.5 text-foreground/70" />,
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
        icon: (
          <ProjectOcticon
            icon={getDisplayProjectIcon(project.icon)}
            size={14}
            className="text-foreground/70"
          />
        ),
      })),
    ],
    [projects],
  );

  const statusOptions = useMemo(() => {
    const allOptions = buildComposeTaskStatusOptions();
    if (!taskProjectId) {
      return allOptions.filter((option) => option.value === "triage");
    }
    return allOptions;
  }, [taskProjectId]);

  const documentFolderOptions = useMemo(() => {
    if (!documentProjectId) {
      return [];
    }

    return documentFoldersByTarget[documentProjectId] ?? [];
  }, [documentFoldersByTarget, documentProjectId]);

  const documentFolderCascade = useMemo(() => {
    if (documentFolderOptions.length === 0) {
      return [];
    }

    return buildComposeFolderCascadeSegments(
      documentFolderOptions,
      documentFolderId,
    );
  }, [documentFolderId, documentFolderOptions]);

  const selectedTaskProjectValue = taskProjectId ?? NO_PROJECT_VALUE;

  const showDocumentFolderDropdown =
    kind === "document" &&
    Boolean(documentProjectId) &&
    documentFolderCascade.length > 0;

  const updateBreadcrumbScrollState = useCallback(() => {
    const sync = () => {
      const scrollElement = breadcrumbScrollRef.current;
      if (!scrollElement) {
        setShowBreadcrumbFade(false);
        return;
      }

      const overflows =
        scrollElement.scrollWidth > scrollElement.clientWidth + 1;

      if (overflows) {
        scrollElement.scrollLeft =
          scrollElement.scrollWidth - scrollElement.clientWidth;
      } else if (scrollElement.scrollLeft !== 0) {
        scrollElement.scrollLeft = 0;
      }

      setShowBreadcrumbFade(overflows && scrollElement.scrollLeft > 1);
    };

    window.requestAnimationFrame(sync);
  }, []);

  const handleBreadcrumbScroll = useCallback(() => {
    const scrollElement = breadcrumbScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const overflows =
      scrollElement.scrollWidth > scrollElement.clientWidth + 1;
    setShowBreadcrumbFade(overflows && scrollElement.scrollLeft > 1);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updateBreadcrumbScrollState();
  }, [
    open,
    kind,
    documentFolderCascade,
    documentProjectId,
    taskProjectId,
    updateBreadcrumbScrollState,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const scrollElement = breadcrumbScrollRef.current;
    const trackElement = breadcrumbTrackRef.current;
    if (!scrollElement) {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateBreadcrumbScrollState();
    });

    observer.observe(scrollElement);
    if (trackElement) {
      observer.observe(trackElement);
    }

    return () => observer.disconnect();
  }, [open, updateBreadcrumbScrollState]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const isTask = kind === "task";
  const headerProjectValue = isTask
    ? selectedTaskProjectValue
    : documentProjectId;
  const headerProjectOptions = isTask
    ? taskProjectOptions
    : documentProjectOptions;
  const headerProjectFallbackLabel = isTask
    ? "No project"
    : isComposeKnowledgeBaseValue(documentProjectId)
      ? "Knowledge Base"
      : "Select project";
  const headerProjectPlaceholder = isTask
    ? "Change project…"
    : "Select destination…";
  const showHeaderProjectDropdown = isTask
    ? taskProjectOptions.length > 0
    : documentProjectOptions.length > 0;

  function handleStatusChange(nextStatus: TaskStatus) {
    setStatus(nextStatus);
    setError(null);
  }

  function handleHeaderProjectChange(value: string) {
    const nextProjectId = value === NO_PROJECT_VALUE ? null : value;

    if (isTask) {
      setTaskProjectId(nextProjectId);
      setDocumentProjectId(nextProjectId);
      setStatus(getDefaultStatus());

      if (!isComposeTasksPagePathname(pathname)) {
        if (!nextProjectId) {
          setDueDate(null);
        } else {
          const project = projects.find((entry) => entry.id === nextProjectId);
          const formatted = project?.dueDate
            ? formatDueDateInputValue(project.dueDate)
            : "";
          setDueDate(formatted || null);
        }
      }
    } else {
      setDocumentProjectId(value);
      if (!isComposeKnowledgeBaseValue(value)) {
        setTaskProjectId(value);
      }
      setDocumentFolderId(
        resolveComposeDocumentFolderValue(
          value,
          pathname,
          resolveComposeContextDocumentTarget(pathname, projects),
          documentFoldersByTarget,
        ),
      );
    }

    setError(null);
  }

  function handleDocumentFolderChange(value: string) {
    setDocumentFolderId(value);
    setError(null);
    focusComposeTitle();
  }

  const destinationBreadcrumb = showHeaderProjectDropdown ? (
    <div
      className="compose-modal-header-breadcrumb"
      data-faded={showBreadcrumbFade ? "" : undefined}
    >
      <div
        ref={breadcrumbScrollRef}
        className="compose-modal-header-breadcrumb-scroll"
        onScroll={handleBreadcrumbScroll}
      >
        <div
          ref={breadcrumbTrackRef}
          className="compose-modal-header-breadcrumb-track"
        >
          <PropertyDropdown
            value={headerProjectValue}
            options={headerProjectOptions}
            onChange={handleHeaderProjectChange}
            disabled={pending || contextLoading}
            searchPlaceholder={headerProjectPlaceholder}
            searchShortcutLabel="P"
            ariaLabel="Project"
            registerOpenMenu={registerProjectMenu}
            taskPropertyDropdownId="project"
            onTabFromSearch={handleComposeProjectTabFromSearch}
            fallbackIcon={
              <ProjectOcticon
                icon={getDisplayProjectIcon(null)}
                size={14}
                className="text-foreground/70"
              />
            }
            fallbackLabel={headerProjectFallbackLabel}
            mutedFallback
            panelAlign="start"
            triggerVariant="composePill"
          />
          {showDocumentFolderDropdown
            ? documentFolderCascade.map((segment, index) => {
                const dropdownOptions = segment.options.map((option) => ({
                  value: option.value,
                  label: option.label,
                  searchTerms: option.searchTerms,
                  icon: <ComposeFolderIcon />,
                }));
                const isOptionalTail = segment.selectedValue === null;
                const segmentValue = isOptionalTail ? null : segment.selectedValue;

                return (
                  <span
                    key={`${documentProjectId}-folder-${segment.depth}-${segment.parentPath}`}
                    className="compose-modal-header-folder-segment"
                  >
                    <span
                      className="compose-modal-header-folder-separator"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    <PropertyDropdown
                      value={segmentValue}
                      options={dropdownOptions}
                      onChange={handleDocumentFolderChange}
                      disabled={pending || contextLoading}
                      searchPlaceholder="Select folder…"
                      ariaLabel={index === 0 ? "Folder" : "Subfolder"}
                      registerOpenMenu={registerFolderMenuAt(index)}
                      onTabFromSearch={handleComposeFolderTabFromSearch}
                      onShiftTabFromSearch={focusComposeTitle}
                      fallbackIcon={<ComposeFolderIcon />}
                      fallbackLabel={index === 0 ? "Folder" : "Subfolder"}
                      mutedFallback
                      mutedSelected={
                        index === 0
                          ? documentFolderId === COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE
                          : isOptionalTail
                      }
                      panelAlign="start"
                      triggerVariant="composePill"
                    />
                  </span>
                );
              })
            : null}
        </div>
      </div>
    </div>
  ) : (
    <p className="compose-modal-destination-empty px-1 text-[13px] leading-snug text-foreground/50">
      Create a{" "}
      {projectsHref ? (
        <a
          href={projectsHref}
          className="text-foreground/70 underline"
          onClick={(event) => {
            event.preventDefault();
            onOpenChange(false);
            onNavigate(projectsHref);
          }}
        >
          project
        </a>
      ) : (
        <span className="text-foreground/70 underline">project</span>
      )}{" "}
      first.
    </p>
  );

  const submitLabel = isTask ? "Create task" : "Create document";
  const submitPendingLabel = pending ? "Creating…" : contextLoading ? "Loading…" : null;

  return createPortal(
    <div className="create-task-modal-root" data-blocking-modal="">
      <button
        type="button"
        className="create-task-modal-overlay"
        aria-label="Close create dialog"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-modal-title"
        className="create-task-modal-dialog"
        data-compose-modal=""
      >
        <div className="create-task-modal-shell">
          <div className="create-task-modal-body">
            <div
              className={[
                "compose-modal-type-toggle-row",
                !isTask ? "compose-modal-type-toggle-row--document" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title="Task: ⌘⇧← · Document: ⌘⇧→"
            >
              {isTask ? (
                <div className="compose-modal-header-project">
                  {destinationBreadcrumb}
                </div>
              ) : null}

              <div className="shrink-0">
                <SegmentedPillToggle
                  value={kind}
                  options={[
                    { value: "task", label: "Task" },
                    { value: "document", label: "Document" },
                  ]}
                  onChange={handleKindChange}
                  ariaLabel="Create type"
                  disabled={pending || contextLoading}
                />
              </div>
            </div>

            <div className="create-task-modal-text-fields">
              <input
                ref={titleInputRef}
                id="compose-modal-title"
                type="text"
                value={title}
                data-compose-modal-text-field=""
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={handleComposeTitleKeyDown}
                disabled={pending}
                placeholder={isTask ? "Task title" : "Document title"}
                aria-label={isTask ? "Task title" : "Document title"}
                className="create-task-modal-title-input"
              />

              {isTask ? (
                <textarea
                  ref={descriptionTextareaRef}
                  value={description}
                  rows={1}
                  data-compose-modal-text-field=""
                  onChange={(event) => setDescription(event.target.value)}
                  onFocus={() => {
                    composeTabCursorRef.current = "description";
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Tab" && !event.shiftKey) {
                      event.preventDefault();
                      composeTabCursorRef.current = "description";
                      advanceComposeTaskTab();
                      return;
                    }
                  }}
                  disabled={pending || contextLoading}
                  placeholder="Add a description…"
                  aria-label="Task description"
                  className="create-task-modal-description-input"
                />
              ) : null}
            </div>
          </div>

          <footer
            className={[
              "create-task-modal-footer",
              !isTask ? "create-task-modal-footer--document" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isTask ? (
              <div className="create-task-modal-properties">
                <PropertyDropdown
                  value={status}
                  options={statusOptions}
                  onChange={handleStatusChange}
                  disabled={pending || !taskProjectId}
                  searchPlaceholder="Change status…"
                  searchShortcutLabel="S"
                  ariaLabel="Status"
                  registerOpenMenu={registerStatusMenu}
                  taskPropertyDropdownId="status"
                  fallbackIcon={
                    <TaskStatusIcon
                      status={status}
                      title={getTaskStatusLabel(status)}
                      size={14}
                    />
                  }
                  fallbackLabel={getTaskStatusLabel(status)}
                  panelAlign="start"
                  triggerVariant="composePill"
                />

                <ComposeDueDateDropdown
                  value={dueDate}
                  onChange={setDueDate}
                  disabled={pending || contextLoading}
                  registerOpenMenu={registerDueDateMenu}
                  triggerVariant="composePill"
                />

                <ComposeAssigneeDropdown
                  contacts={contacts}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  disabled={pending || contextLoading}
                  registerOpenMenu={registerAssigneeMenu}
                  triggerVariant="composePill"
                />
              </div>
            ) : (
              <div className="compose-modal-document-trail">{destinationBreadcrumb}</div>
            )}

            <div className="create-task-modal-actions">
              {contextError ? (
                <p className="create-task-modal-error" role="alert">
                  {contextError}
                </p>
              ) : null}
              {error ? (
                <p className="create-task-modal-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                ref={submitButtonRef}
                type="button"
                className="create-task-modal-submit"
                onClick={submit}
                onFocus={() => {
                  if (isTask) {
                    composeTabCursorRef.current = "submit";
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                disabled={!canSubmit}
                aria-label={submitLabel}
                title={submitLabel}
              >
                {submitPendingLabel ?? submitLabel}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
