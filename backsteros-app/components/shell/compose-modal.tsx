"use client";

import Link from "next/link";
import { ArrowUpIcon } from "@primer/octicons-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { useMounted } from "@/hooks/use-mounted";
import { useIsMobileUi } from "@/hooks/use-circle-platform";
import { createDocumentAction, createKnowledgeDocumentAction } from "@/lib/mutations/documents";
import { createTaskFromComposeAction } from "@/lib/mutations/tasks";
import { ComposeFolderIcon } from "@/components/documents/compose-folder-icon";
import { KnowledgeBaseNavIcon } from "@/components/shell/sidebar-nav-icons";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { TaskStatusIcon } from "@/components/task-status";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import { buildTaskStatusDropdownOptions } from "@/components/tasks/task-status-dropdown-options";
import { ComposeDueDateDropdown } from "@/components/tasks/compose-due-date-dropdown";
import { TaskCreateAssigneeDropdown } from "@/components/tasks/task-create-assignee-dropdown";
import {
  getComposeKindForShortcutKey,
  type ComposeKind,
} from "@/lib/compose-modal-events";
import {
  hasCmdShiftArrowShortcutModifiers,
  isHorizontalArrowKey,
} from "@/lib/shortcuts/cmd-option-arrow-shortcut";
import {
  focusAndSelectTitleInput,
  isTitleRenameShortcut,
} from "@/lib/shortcuts/title-rename-shortcut";
import {
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  COMPOSE_NO_PROJECT_VALUE,
  isComposeKnowledgeBaseValue,
  resolveComposeContextDocumentTarget,
  resolveComposeContextDueDate,
  resolveComposeContextKind,
  resolveComposeContextProjectId,
} from "@/lib/compose-task";
import { formatDueDateInputValue } from "@/lib/task-due-date";
import { isTasksPagePathname } from "@/lib/tasks-due-filters";
import {
  getNextComposeTaskTabField,
  type ComposeTaskTabField,
} from "@/lib/compose-task-tab-flow";
import type { SearchableDropdownMenuApi } from "@/components/ui/searchable-dropdown-menu-api";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import { appendComposeDocumentViewQuery } from "@/lib/content-side-panel";
import {
  COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  folderPathFromComposeFolderValue,
  resolveComposeDocumentFolderValue,
  type ComposeDocumentFoldersByTarget,
} from "@/lib/documents/compose-document-folders.shared";
import { buildComposeFolderCascadeSegments } from "@/lib/documents/compose-document-folder-cascade";
import { requestCloseSearchableDropdowns } from "@/lib/searchable-dropdown-events";
import { getProjectDocumentHrefFromPathname } from "@/lib/document-navigation-path";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import {
  getInboxTaskHref,
  getProjectTaskHref,
} from "@/lib/task-navigation-path";
import {
  getTaskStatusLabel,
  type TaskStatus,
} from "@/lib/task-status";
import { useAutosizeTextarea } from "@/lib/ui/use-autosize-textarea";

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

type ComposeProject = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
  dueDate: Date | null;
};

type ComposeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ComposeProject[];
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
  documentFoldersByTarget: ComposeDocumentFoldersByTarget;
  contextLoading?: boolean;
  contextError?: string | null;
};

function getDefaultStatus(): TaskStatus {
  return "triage";
}

export function ComposeModal({
  open,
  onOpenChange,
  projects,
  contacts,
  defaultAssigneeId,
  documentFoldersByTarget,
  contextLoading = false,
  contextError = null,
}: ComposeModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const titleInputRef = useRef<HTMLInputElement>(null);
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
  const [isPending, startTransition] = useTransition();
  const mounted = useMounted();
  const isMobileUi = useIsMobileUi();
  const navigateAfterCompose = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
      router.refresh();
    },
    [onOpenChange, router],
  );
  const { textareaRef: descriptionTextareaRef } = useAutosizeTextarea({
    value: description,
    minHeight: CREATE_TASK_DESCRIPTION_MIN_HEIGHT_PX,
    maxHeight: CREATE_TASK_DESCRIPTION_MAX_HEIGHT_PX,
    enabled: open && kind === "task",
  });

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
  }, [descriptionTextareaRef]);

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
    if (isPending) {
      return;
    }

    projectMenuRef.current?.open();
  }, [isPending]);

  const openComposeFolderDropdown = useCallback(() => {
    if (isPending) {
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
  }, [isPending]);

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

  const handleKindChange = useCallback((nextKind: ComposeKind) => {
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
  }, [documentFoldersByTarget, documentProjectId, pathname, projects]);

  const submitTask = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Task title is required.");
      titleInputRef.current?.focus();
      return;
    }

    if (isPending) {
      return;
    }

    startTransition(async () => {
      setError(null);
      const resolvedProjectId = taskProjectId?.trim() ? taskProjectId : null;

      const result = await createTaskFromComposeAction({
        title: trimmedTitle,
        description,
        projectId: resolvedProjectId,
        status: resolvedProjectId ? status : undefined,
        dueDate,
        assigneeId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const href = result.projectKey
        ? getProjectTaskHref(result.projectKey, result.taskNumber)
        : getInboxTaskHref(result.taskNumber);
      navigateAfterCompose(href);
    });
  }, [
    assigneeId,
    description,
    dueDate,
    isPending,
    navigateAfterCompose,
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

    if (isPending) {
      return;
    }

    const isKnowledgeBase = isComposeKnowledgeBaseValue(documentProjectId);
    const folderPath = folderPathFromComposeFolderValue(documentFolderId);

    startTransition(async () => {
      setError(null);
      const result = isKnowledgeBase
        ? await createKnowledgeDocumentAction({
            title: trimmedTitle,
            folderPath,
          })
        : await createDocumentAction({
            projectId: documentProjectId,
            title: trimmedTitle,
            folderPath,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      let documentHref: string;
      if (isKnowledgeBase) {
        documentHref = getKnowledgeDocumentHref(result.relativePath);
      } else {
        const project = projects.find((entry) => entry.id === documentProjectId);
        if (!project) {
          setError("Project not found.");
          return;
        }
        documentHref = getProjectDocumentHrefFromPathname(
          pathname,
          project.key,
          result.relativePath,
        );
      }

      navigateAfterCompose(appendComposeDocumentViewQuery(documentHref));
    });
  }, [
    documentFolderId,
    documentProjectId,
    isPending,
    navigateAfterCompose,
    pathname,
    projects,
    title,
  ]);

  const canSubmit = useMemo(() => {
    if (isPending || contextLoading) {
      return false;
    }

    if (!title.trim()) {
      return false;
    }

    if (kind === "task") {
      return true;
    }

    return Boolean(documentProjectId) && projects.length > 0;
  }, [contextLoading, documentProjectId, isPending, kind, projects.length, title]);

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
    (event: React.KeyboardEvent<HTMLInputElement>) => {
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
    descriptionTextareaRef,
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
        icon: (
          <KnowledgeBaseNavIcon className="size-3.5 text-foreground/70" />
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

  const statusOptions = useMemo(() => {
    const allOptions = buildTaskStatusDropdownOptions();
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

  if (!open || !mounted) {
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

      if (!isTasksPagePathname(pathname)) {
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
            disabled={isPending || contextLoading}
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
                      disabled={isPending || contextLoading}
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
      <Link href="/projects" className="text-foreground/70 underline">
        project
      </Link>{" "}
      first.
    </p>
  );

  const submitLabel = isTask ? "Create task" : "Create document";
  const submitPendingLabel = isPending ? "Creating…" : contextLoading ? "Loading…" : null;

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
                  disabled={isPending || contextLoading}
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
                disabled={isPending}
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
                  disabled={isPending || contextLoading}
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
                  disabled={isPending || !taskProjectId}
                  searchPlaceholder="Change status…"
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
                  disabled={isPending || contextLoading}
                  registerOpenMenu={registerDueDateMenu}
                  triggerVariant="composePill"
                />

                <TaskCreateAssigneeDropdown
                  contacts={contacts}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  disabled={isPending || contextLoading}
                  registerOpenMenu={registerAssigneeMenu}
                  triggerVariant="composePill"
                />
              </div>
            ) : (
              <div className="compose-modal-document-trail">{destinationBreadcrumb}</div>
            )}

            <div className="create-task-modal-actions">
              {contextLoading ? (
                <p className="create-task-modal-error" role="status">
                  Loading compose options…
                </p>
              ) : null}
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
                className={[
                  "create-task-modal-submit",
                  isMobileUi ? "create-task-modal-submit--icon" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={submit}
                onFocus={() => {
                  if (isTask) {
                    composeTabCursorRef.current = "submit";
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.metaKey &&
                    !event.ctrlKey
                  ) {
                    event.preventDefault();
                    submit();
                  }
                }}
                disabled={!canSubmit}
                aria-label={submitLabel}
                title={submitLabel}
              >
                {submitPendingLabel ? (
                  submitPendingLabel
                ) : isMobileUi ? (
                  <ArrowUpIcon aria-hidden className="create-task-modal-submit-icon" />
                ) : (
                  submitLabel
                )}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
