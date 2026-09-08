import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  RegisterEntityDeleteAction,
  RegisterEntityDuplicateAction,
  RegisterPageTitle,
  TaskDetailSkeleton,
  TaskDetailView,
  TaskLinkedCommitSection,
  buildAssigneeDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildSpellcheckSegments,
  buildTaskProjectChangeRedirectPath,
  buildTaskRelatedDropdownOptions,
  buildTasksDueHref,
  composeSpellcheckText,
  encodeTaskSlug,
  getInboxTaskRouteSlugForTask,
  getTaskDisplayId,
  getTasksDueFilterLabel,
  INBOX_TASK_KEY,
  isTasksDueFilter,
  resolveDuplicatedTaskHref,
  spellcheckHasChanges,
  toggleSpellcheckSegment,
  type TaskSpellcheckHighlight,
  type TasksDueFilter,
} from "@backsteros/ui";

import {
  DesktopTaskActivityPanel,
  type TaskSpellcheckAppliedPayload,
} from "../components/desktop-task-activity-panel";
import { DesktopTaskLayout } from "../components/desktop-task-layout";
import { navigateToHref } from "../router/navigate-href";
import {
  useShellLocation,
  useShellParams,
  useKeepAliveActive,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useTaskFileAttachments } from "../lib/use-task-file-attachments";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useTaskDescriptionImages } from "../lib/task-description-images";
import { useDesktopTaskDescription } from "../lib/use-task-description";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import { useDesktopApi } from "../lib/api-context";
import { usePostTaskTimerActivity } from "../lib/use-post-task-timer-activity";
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
  buildLetterLinkOptions,
} from "../lib/task-link-picker-options";
import { useAgentMail } from "../lib/agentmail-context";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
  useWorkspaceSurfaceReady,
} from "../lib/workspace-data";
import { parseTaskLinks } from "../lib/workspace/row-mappers";

export type TaskDetailPageProps = {
  taskRouteParam?: string;
  backHref?: string;
  breadcrumbItems?: { label: string; href?: string }[];
  /** When false, detail is kept mounted but hidden (tasks list host). */
  detailVisible?: boolean;
  /** List-row snapshot for instant paint before workspace index catches up. */
  bootstrapTask?: TaskDetailBootstrap | null;
  /**
   * Embed in a host panel (calendar overlay / Timetracking rail):
   * render task + properties only.
   */
  overlayMode?: boolean;
};

type TaskRouteRow = {
  id: string;
  number: number | null;
  projectId: string | null;
  projectKey?: string | null;
  contactId?: string | null;
  contactKey?: string | null;
  assigneeId?: string | null;
  agentChatId?: string | null;
  linkedCommitShas?: string[] | null;
  projectName?: string | null;
  title: string;
  status: string;
  priority: number;
  /** Epoch ms when known (workspace rows); absent on bootstrap rows. */
  updatedAt?: number;
};

export type TaskDetailBootstrap = {
  id: string;
  title: string;
  number: number | null;
  status: string;
  priority?: number;
  projectKey?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  agentChatId?: string | null;
  assigneeId?: string | null;
  /** Slug/id segment from the navigation href (guards stale bootstrap). */
  routeSlug?: string | null;
};

function bootstrapMatchesRoute(
  bootstrap: TaskDetailBootstrap,
  routeParam: string,
): boolean {
  const normalized = decodeURIComponent(routeParam).toLowerCase();
  if (bootstrap.routeSlug?.toLowerCase() === normalized) return true;
  if (bootstrap.id === routeParam || bootstrap.id.toLowerCase() === normalized) {
    return true;
  }
  return false;
}

/** Local create ids (uuid without dashes) — not display slugs like `bsh-3`. */
function isPendingCreatedTaskRouteParam(
  routeParam: string | null | undefined,
): boolean {
  if (!routeParam) return false;
  if (routeParam.includes("-")) return false;
  return /^[a-zA-Z0-9_]{20,}$/.test(routeParam);
}

function bootstrapToRouteRow(bootstrap: TaskDetailBootstrap): TaskRouteRow {
  return {
    id: bootstrap.id,
    number: bootstrap.number,
    projectId: bootstrap.projectId ?? null,
    projectKey: bootstrap.projectKey ?? null,
    assigneeId: bootstrap.assigneeId ?? null,
    agentChatId: bootstrap.agentChatId ?? null,
    projectName: bootstrap.projectName ?? null,
    title: bootstrap.title,
    status: bootstrap.status,
    priority: bootstrap.priority ?? 0,
  };
}

function buildTaskRouteIndex(
  allTasks: readonly TaskRouteRow[],
  contactKeyById: ReadonlyMap<string, string | null>,
): Map<string, TaskRouteRow> {
  const index = new Map<string, TaskRouteRow>();
  for (const entry of allTasks) {
    const contactKey = entry.contactId
      ? (contactKeyById.get(entry.contactId) ?? null)
      : null;
    const keys = new Set<string>();
    keys.add(entry.id);
    keys.add(entry.id.toLowerCase());
    const displayId = getTaskDisplayId(
      {
        number: entry.number,
        projectId: entry.projectId,
        contactId: entry.contactId,
      },
      entry.projectKey ?? contactKey,
    );
    if (displayId) {
      keys.add(displayId);
      keys.add(displayId.toLowerCase());
    }
    const slug = getInboxTaskRouteSlugForTask({
      number: entry.number,
      projectKey: entry.projectKey,
      contactKey,
    });
    keys.add(slug);
    keys.add(slug.toLowerCase());
    if (entry.number != null) {
      if (entry.projectKey) {
        keys.add(encodeTaskSlug(entry.projectKey, entry.number));
      }
      if (contactKey) {
        keys.add(encodeTaskSlug(contactKey, entry.number));
      }
    }
    for (const key of keys) {
      index.set(key, entry);
    }
  }
  return index;
}

export function TaskDetailPage({
  taskRouteParam,
  backHref: backHrefProp,
  breadcrumbItems: breadcrumbItemsProp,
  detailVisible = true,
  bootstrapTask = null,
  overlayMode = false,
}: TaskDetailPageProps = {}) {
  const navigate = useNavigate();
  const location = useShellLocation();
  const shellParams = useShellParams() as {
    taskId?: string;
    taskSlug?: string;
    dueFilter?: string;
  };
  const routeParam =
    taskRouteParam ?? shellParams.taskSlug ?? shellParams.taskId;
  // Warm flips leave the TanStack match on /tasks — dueFilter must come from
  // the keep-alive snapshot (or the detail path segment), not useParams().
  const dueFilterFromPath = (() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "tasks" && parts.length >= 3 && isTasksDueFilter(parts[1])) {
      return parts[1];
    }
    return null;
  })();
  const dueFilterParam = shellParams.dueFilter ?? dueFilterFromPath;
  const dueFilter: TasksDueFilter | null =
    dueFilterParam && isTasksDueFilter(dueFilterParam) ? dueFilterParam : null;
  const backHref =
    backHrefProp ??
    (dueFilter ? buildTasksDueHref(dueFilter) : "/tasks");
  const { allTasks, taskDetails } =
    useDesktopWorkspaceTasks();
  const { projects, letters } = useDesktopWorkspaceProjects();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { knowledgeDocuments, projectDocuments } =
    useDesktopWorkspaceDocuments();
  const workspace = useDesktopWorkspaceActions();
  const { client } = useDesktopApi();
  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );
  const tasksReady = useWorkspaceSurfaceReady("tasks");
  const keepAliveActive = useKeepAliveActive();
  const agentMail = useAgentMail();
  const documentLinkOptions = useMemo(
    () =>
      buildDocumentLinkOptions(
        [...knowledgeDocuments, ...projectDocuments],
        projects,
      ),
    [knowledgeDocuments, projectDocuments, projects]);
  const letterLinkOptions = useMemo(
    () => buildLetterLinkOptions(letters, projects),
    [letters, projects]);
  const emailLinkOptions = useMemo(
    () => buildEmailLinkOptions(agentMail.messages),
    [agentMail.messages]);
  const [spellcheckHighlight, setSpellcheckHighlight] =
    useState<TaskSpellcheckHighlight | null>(null);
  const [activityFeedBump, setActivityFeedBump] = useState(0);
  const [pendingCreateLookupExpired, setPendingCreateLookupExpired] =
    useState(false);
  /** CLI/API-linked SHAs before PowerSync list catch-up. */
  const [fetchedLinkedCommitShas, setFetchedLinkedCommitShas] = useState<
    string[]
  >([]);
  /** Immediate UI after link/unlink — wins over stale SQLite/hydrate. */
  const [linkedCommitShasOverride, setLinkedCommitShasOverride] = useState<
    string[] | null
  >(null);
  const [activeCommitSha, setActiveCommitSha] = useState<string | null>(null);
  const [openCommitPickerRequest, setOpenCommitPickerRequest] = useState(0);
  const spellcheckNonceRef = useRef(0);
  /** Keeps the open task stable while project-change URL rewrite catches up. */
  const pinnedTaskIdRef = useRef<string | null>(null);

  const onSpellcheckApplied = useCallback(
    (payload: TaskSpellcheckAppliedPayload) => {
      const titleSegments = buildSpellcheckSegments(
        payload.beforeTitle,
        payload.afterTitle);
      const descriptionSegments = buildSpellcheckSegments(
        payload.beforeDescription,
        payload.afterDescription);
      if (
        !spellcheckHasChanges(titleSegments) &&
        !spellcheckHasChanges(descriptionSegments)
      ) {
        setSpellcheckHighlight(null);
        return;
      }
      spellcheckNonceRef.current += 1;
      setSpellcheckHighlight({
        beforeTitle: payload.beforeTitle,
        beforeDescription: payload.beforeDescription,
        titleSegments,
        descriptionSegments,
        nonce: spellcheckNonceRef.current,
      });
    },
    []);

  const contactKeyById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      map.set(contact.id, contact.key ?? null);
    }
    return map;
  }, [contacts]);

  const taskRouteIndex = useMemo(
    () => buildTaskRouteIndex(allTasks, contactKeyById),
    [allTasks, contactKeyById],
  );

  const matchedByRoute = useMemo(() => {
    if (!routeParam) return null;
    const normalized = decodeURIComponent(routeParam).toLowerCase();
    return (
      taskRouteIndex.get(routeParam) ??
      taskRouteIndex.get(normalized) ??
      null
    );
  }, [routeParam, taskRouteIndex]);

  if (matchedByRoute) {
    pinnedTaskIdRef.current = null;
  }

  const base =
    matchedByRoute ??
    (bootstrapTask && routeParam && bootstrapMatchesRoute(bootstrapTask, routeParam)
      ? bootstrapToRouteRow(bootstrapTask)
      : null) ??
    (pinnedTaskIdRef.current
      ? (allTasks.find((entry) => entry.id === pinnedTaskIdRef.current) ?? null)
      : null);

  useEnsureProjectVault(detailVisible ? base?.projectId : null);

  const bumpActivityFeed = useCallback(() => {
    setActivityFeedBump((n) => n + 1);
  }, []);
  const postTimerActivity = usePostTaskTimerActivity(base?.id, bumpActivityFeed);

  const {
    description: fetchedDescription,
    rememberDescription,
  } = useDesktopTaskDescription(base?.id, {
    enabled: keepAliveActive && detailVisible && Boolean(base?.id),
  });

  const { onUploadImages, resolveImageSrc } = useTaskDescriptionImages(
    detailVisible ? (base?.id ?? "") : "",
  );

  const {
    attachments: fileAttachments,
    uploading: fileUploading,
    uploadFile,
    remove: removeFileAttachment,
    open: openFileAttachment,
  } = useTaskFileAttachments(base?.id, {
    enabled: keepAliveActive && detailVisible && Boolean(base?.id),
  });

  const [belowDescriptionReady, setBelowDescriptionReady] = useState(false);
  useEffect(() => {
    if (!detailVisible) {
      setBelowDescriptionReady(false);
      return;
    }
    let cancelled = false;
    const raf1 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) setBelowDescriptionReady(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
    };
  }, [detailVisible, base?.id]);

  const applySpellcheckComposition = useCallback(
    async (session: TaskSpellcheckHighlight) => {
      if (!base) return;
      const nextDescription = composeSpellcheckText(
        session.descriptionSegments,
      );
      rememberDescription(nextDescription);
      await workspace.patchTask(base.id, {
        title: composeSpellcheckText(session.titleSegments),
        description: nextDescription,
      });
    },
    [base, rememberDescription, workspace]);

  const onToggleSpellcheckTitleSegment = useCallback(
    (segmentId: string) => {
      setSpellcheckHighlight((current) => {
        if (!current) return current;
        const next: TaskSpellcheckHighlight = {
          ...current,
          titleSegments: toggleSpellcheckSegment(
            current.titleSegments,
            segmentId),
        };
        void applySpellcheckComposition(next);
        return next;
      });
    },
    [applySpellcheckComposition]);

  const onToggleSpellcheckDescriptionSegment = useCallback(
    (segmentId: string) => {
      setSpellcheckHighlight((current) => {
        if (!current) return current;
        const next: TaskSpellcheckHighlight = {
          ...current,
          descriptionSegments: toggleSpellcheckSegment(
            current.descriptionSegments,
            segmentId),
        };
        void applySpellcheckComposition(next);
        return next;
      });
    },
    [applySpellcheckComposition]);

  const onSpellcheckReset = useCallback(() => {
    const session = spellcheckHighlight;
    if (!session || !base) {
      setSpellcheckHighlight(null);
      return;
    }
    rememberDescription(session.beforeDescription);
    void workspace
      .patchTask(base.id, {
        title: session.beforeTitle,
        description: session.beforeDescription,
      })
      .finally(() => setSpellcheckHighlight(null));
  }, [base, rememberDescription, spellcheckHighlight, workspace]);

  // Drop highlight when navigating to another task.
  const highlightTaskId = base?.id ?? null;
  const [prevHighlightTaskId, setPrevHighlightTaskId] = useState(highlightTaskId);
  if (highlightTaskId !== prevHighlightTaskId) {
    setPrevHighlightTaskId(highlightTaskId);
    if (spellcheckHighlight) setSpellcheckHighlight(null);
  }

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    detailVisible ? contacts : [],
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    detailVisible ? organizations : [],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc)),
    [contactAvatarSrc, contacts]);

  const relatedOptions = useMemo(
    () =>
      buildTaskRelatedDropdownOptions({
        contactOptions: assigneeOptions,
        organizationOptions: buildOrganizationDropdownOptions(
          withAvatarSrc(organizations, organizationAvatarSrc),
          { includeNone: false },
        ),
      }),
    [assigneeOptions, organizationAvatarSrc, organizations],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        }))),
    [projects]);

  const task = useMemo(() => {
    if (!base) return null;
    const resolvedProjectKey = base.projectKey ?? null;
    const project =
      projects.find((entry) => entry.key === resolvedProjectKey) ?? null;
    const resolvedAssigneeId = base.assigneeId ?? null;
    const assignee =
      contacts.find((entry) => entry.id === resolvedAssigneeId) ?? null;
    const linkedCommitShas = (() => {
      if (linkedCommitShasOverride != null) {
        return linkedCommitShasOverride;
      }
      const fromBase = Array.isArray(base.linkedCommitShas)
        ? base.linkedCommitShas
        : [];
      const fromDetails = Array.isArray(taskDetails[base.id]?.linkedCommitShas)
        ? taskDetails[base.id]!.linkedCommitShas!
        : [];
      const normalize = (values: string[]) =>
        values
          .filter(
            (sha): sha is string =>
              typeof sha === "string" && /^[0-9a-fA-F]{7,64}$/.test(sha.trim()),
          )
          .map((sha) => sha.trim());
      const baseShas = normalize(fromBase);
      const detailShas = normalize(fromDetails);
      const fetchedShas = normalize(fetchedLinkedCommitShas);
      if (baseShas.length > 0) return baseShas;
      if (detailShas.length > 0) return detailShas;
      return fetchedShas;
    })();
    return {
      ...base,
      assigneeId: resolvedAssigneeId,
      assigneeName: assignee?.name ?? null,
      projectKey: resolvedProjectKey,
      projectName: project?.name ?? base.projectName ?? null,
      description: fetchedDescription,
      links: parseTaskLinks(taskDetails[base.id]?.links),
      linkedCommitShas,
      displayId: getTaskDisplayId(
        {
          number: base.number,
          projectId: base.projectId,
        },
        base.projectKey),
    };
  }, [
    base,
    contacts,
    fetchedDescription,
    fetchedLinkedCommitShas,
    linkedCommitShasOverride,
    projects,
    taskDetails,
  ]);

  // When PowerSync list lag drops `linkedCommitShas` (e.g. CLI link), hydrate
  // from REST so Changes stay visible.
  useEffect(() => {
    if (!base?.id) {
      setFetchedLinkedCommitShas([]);
      setLinkedCommitShasOverride(null);
      return;
    }
    const taskId = base.id;
    setLinkedCommitShasOverride(null);
    let cancelled = false;
    void client
      .requestJson<{ linkedCommitShas?: string[] | null }>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      )
      .then((row) => {
        if (cancelled) return;
        const shas = Array.isArray(row.linkedCommitShas)
          ? row.linkedCommitShas.filter(
              (sha): sha is string =>
                typeof sha === "string" &&
                /^[0-9a-fA-F]{7,64}$/.test(sha.trim()),
            )
          : [];
        setFetchedLinkedCommitShas(shas);
      })
      .catch(() => {
        if (!cancelled) setFetchedLinkedCommitShas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [base?.id, client]);

  useEffect(() => {
    setActiveCommitSha(null);
  }, [task?.id]);

  useEffect(() => {
    if (task || !isPendingCreatedTaskRouteParam(routeParam)) {
      setPendingCreateLookupExpired(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingCreateLookupExpired(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [routeParam, task]);

  const taskLabel = task
    ? task.displayId
      ? `${task.displayId} ${task.title}`
      : task.title
    : null;

  const breadcrumbItems = useMemo(() => {
    if (breadcrumbItemsProp) {
      return [
        ...breadcrumbItemsProp,
        ...(taskLabel ? [{ label: taskLabel }] : []),
      ];
    }
    if (dueFilter) {
      return [
        { label: "Tasks", href: "/tasks" },
        {
          label: getTasksDueFilterLabel(dueFilter),
          href: buildTasksDueHref(dueFilter),
        },
        ...(taskLabel ? [{ label: taskLabel }] : []),
      ];
    }
    return taskLabel
      ? [
          { label: "Tasks", href: backHref },
          { label: taskLabel },
        ]
      : [{ label: "Tasks", href: backHref }];
  }, [backHref, breadcrumbItemsProp, dueFilter, taskLabel]);

  useDesktopSectionBreadcrumb(breadcrumbItems, {
    enabled:
      detailVisible && (!overlayMode || Boolean(breadcrumbItemsProp?.length)),
  });



  const handleDeleteTask = useCallback(async () => {
    if (!base) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      await workspace.softDeleteTask(base.id);
      navigateToHref(navigate, backHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to delete task.",
      };
    }
  }, [backHref, base, navigate, workspace]);

  const handleDuplicateTask = useCallback(async () => {
    if (!base) {
      return { ok: false as const, error: "Task is required." };
    }
    try {
      const created = await workspace.duplicateTask(base.id);
      const project = base.projectId
        ? (projects.find((entry) => entry.id === base.projectId) ?? null)
        : null;
      const contact = base.contactId
        ? (contacts.find((entry) => entry.id === base.contactId) ?? null)
        : null;
      navigateToHref(
        navigate,
        resolveDuplicatedTaskHref({
          id: created.id,
          number: created.number,
          projectKey: project?.key ?? base.projectKey ?? null,
          contactKey: contact?.key ?? null,
        }));
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to duplicate task.",
      };
    }
  }, [base, contacts, navigate, projects, workspace]);

  if (!task) {
    // Hydrating, or a just-created opaque id before the workspace index lands.
    // A stale bootstrap prop used to force Not found here (`!bootstrapTask` gate).
    if (
      !tasksReady ||
      (isPendingCreatedTaskRouteParam(routeParam) && !pendingCreateLookupExpired)
    ) {
      return <TaskDetailSkeleton />;
    }
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Task not found.</p>
          <button type="button" onClick={() => navigateToHref(navigate, backHref)}>
            Back to tasks
          </button>
        </div>
      </div>
    );
  }

  const deleteEntityLabel = task.displayId
    ? `task ${task.displayId}`
    : "task";

  const project =
    projects.find((entry) => entry.key === task.projectKey) ?? null;
  const workingDirectory = project?.localWorkingDirectory ?? null;
  const canLinkCommit =
    project?.type === "codebase" &&
    Boolean(project.id) &&
    Boolean(project.githubRepository?.trim());
  const linkedCommitShas = Array.isArray(task.linkedCommitShas)
    ? task.linkedCommitShas
    : [];

  const patchStatus = (next: string) => {
    void workspace.patchTask(task.id, { status: next });
  };
  const patchPriority = (next: number) => {
    void workspace.patchTask(task.id, { priority: next });
  };
  const patchTrackedDurationSeconds = (seconds: number | null) => {
    const trackedMinutes =
      seconds != null && seconds >= 60 ? Math.floor(seconds / 60) : null;
    void workspace.patchTask(task.id, {
      trackedDurationSeconds: seconds,
      trackedMinutes,
    });
  };
  const patchDueDate = (next: Date | null) => {
    void workspace.patchTask(task.id, {
      dueDate: next ? next.toISOString() : null,
    });
  };
  const patchAssignee = (next: string | null) => {
    void workspace.patchTask(task.id, { assigneeId: next });
  };
  const patchRelated = (related: {
    contactIds: string[];
    organizationIds: string[];
  }) => {
    void workspace.patchTask(task.id, {
      relatedContactIds: related.contactIds,
      relatedOrganizationIds: related.organizationIds,
    });
  };
  const patchProjectKey = (next: string | null) => {
    const previousProjectKey = task.projectKey ?? INBOX_TASK_KEY;
    const nextProject = next
      ? projects.find((entry) => entry.key === next) ?? null
      : null;
    const nextOrganization = nextProject?.organizationId
      ? (organizations.find(
          (entry) => entry.id === nextProject.organizationId) ?? null)
      : null;
    const redirectBase = {
      taskId: task.id,
      // Same `?? 0` convention as the confirmed-number rewrite below.
      taskNumber: task.number ?? 0,
      oldProjectKey: previousProjectKey,
      newProjectKey: nextProject?.key ?? null,
      newOrganizationRouteParam: nextProject
        ? nextOrganization
          ? String(
              nextOrganization.number ??
                nextOrganization.key ??
                nextOrganization.id)
          : null
        : undefined,
    } as const;

    pinnedTaskIdRef.current = task.id;

    // Prefer the durable task id until the server confirms the destination
    // number — scope moves renumber when the old number is already taken.
    const interimPath = buildTaskProjectChangeRedirectPath(location.pathname, {
      ...redirectBase,
      routeLeaf: nextProject ? "task-id" : "display-slug",
    });
    if (interimPath !== location.pathname) {
      navigateToHref(navigate, interimPath, { replace: true });
    }

    void workspace
      .patchTask(task.id, {
        projectId: nextProject?.id ?? null,
        // Scheduled / due-list tasks stay out of triage inbox when moving.
        ...(nextProject ? { inbox: false } : {}),
      })
      .then((result) => {
        if (!nextProject) return;
        const confirmedNumber =
          typeof result?.number === "number" && result.number > 0
            ? result.number
            : task.number != null && task.number > 0
              ? task.number
              : null;
        const prettyPath = buildTaskProjectChangeRedirectPath(interimPath, {
          ...redirectBase,
          taskNumber: confirmedNumber ?? 0,
          routeLeaf: confirmedNumber != null ? "display-slug" : "task-id",
        });
        if (prettyPath !== interimPath) {
          navigateToHref(navigate, prettyPath, {
            replace: true,
          });
        }
      });
  };
  const saveDescription = (description: string) => {
    rememberDescription(description);
    void workspace.patchTask(task.id, { description });
  };
  const changeLinks = (links: typeof task.links) => {
    void workspace.patchTask(task.id, { links: links ?? [] });
  };
  const saveTitle = async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      return { ok: false as const, error: "Task title is required." };
    }
    try {
      await workspace.patchTask(task.id, { title: trimmed });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Could not rename task.",
      };
    }
  };
  const createAssigneeFromQuery = (query: string) => {
    void workspace.createContact({ name: query }).then((created) => {
      void workspace.patchTask(task.id, { assigneeId: created.id });
    });
  };
  const createRelatedContactFromQuery = (query: string) => {
    void workspace.createContact({ name: query }).then((created) => {
      const current =
        "relatedContactIds" in task && Array.isArray(task.relatedContactIds)
          ? task.relatedContactIds
          : [];
      if (current.includes(created.id)) return;
      void workspace.patchTask(task.id, {
        relatedContactIds: [...current, created.id],
      });
    });
  };

  const taskAgentSummary = {
    number: base?.number ?? 0,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    projectKey: task.projectKey,
    projectId: project?.id ?? base?.projectId ?? null,
    projectName: project?.name ?? task.projectName ?? null,
    displayId:
      task.displayId ??
      getTaskDisplayId(
        {
          number: base?.number ?? task.number ?? null,
          projectId: project?.id ?? base?.projectId ?? null,
        },
        task.projectKey),
    workingDirectory,
  };

  const activityPanel = (spellcheckControlsVisible = true) => (
    <DesktopTaskActivityPanel
      taskId={task.id}
      taskUpdatedAt={base?.updatedAt ?? null}
      contacts={contacts}
      contactAvatarSrc={contactAvatarSrc}
      patchTaskValues={async (values) => {
        await workspace.patchTask(task.id, values);
      }}
      onSpellcheckApplied={onSpellcheckApplied}
      spellcheckPending={Boolean(spellcheckHighlight)}
      onSpellcheckConfirm={() => setSpellcheckHighlight(null)}
      onSpellcheckReset={onSpellcheckReset}
      spellcheckControlsVisible={spellcheckControlsVisible}
      activityFeedBump={activityFeedBump}
      taskSummary={taskAgentSummary}
    />
  );

  const linkedCommitPanel =
    canLinkCommit && project
      ? ({ hide }: { hide: () => void }) => (
          <TaskLinkedCommitSection
            projectId={project.id}
            defaultBranch={null}
            linkedCommitShas={linkedCommitShas}
            activeSha={activeCommitSha}
            onActiveShaChange={setActiveCommitSha}
            openPickerRequest={openCommitPickerRequest}
            requestJson={requestJson}
            onHidePanel={hide}
            onLinkCommit={async (sha) => {
              const next = [
                ...linkedCommitShas.filter(
                  (entry) => entry.toLowerCase() !== sha.toLowerCase(),
                ),
                sha,
              ].slice(0, 20);
              setLinkedCommitShasOverride(next);
              setFetchedLinkedCommitShas(next);
              await workspace.patchTask(task.id, { linkedCommitShas: next });
              setActiveCommitSha(sha);
            }}
            onUnlinkCommit={async (sha) => {
              const next = linkedCommitShas.filter(
                (entry) => entry.toLowerCase() !== sha.toLowerCase(),
              );
              setLinkedCommitShasOverride(next);
              setFetchedLinkedCommitShas(next);
              await workspace.patchTask(task.id, { linkedCommitShas: next });
              setActiveCommitSha(next[next.length - 1] ?? null);
            }}
          />
        )
      : null;

  const detailView = (
        <TaskDetailView
          task={task}
          spellcheckHighlight={spellcheckHighlight}
          onSpellcheckHighlightClear={() => setSpellcheckHighlight(null)}
          onToggleSpellcheckTitleSegment={onToggleSpellcheckTitleSegment}
          onToggleSpellcheckDescriptionSegment={
            onToggleSpellcheckDescriptionSegment
          }
          onStatusChange={patchStatus}
          onPriorityChange={patchPriority}
          onTrackedDurationSecondsChange={patchTrackedDurationSeconds}
          onTimerSessionChange={postTimerActivity}
          timerSession={{
            kind: "task",
            entityId: task.id,
            title: task.title,
            subtitle: task.displayId ?? null,
            statusKey: task.status,
            href: location.pathname,
          }}
          onDueDateChange={patchDueDate}
          onAssigneeChange={patchAssignee}
          onRelatedChange={patchRelated}
          onProjectChange={patchProjectKey}
          onSaveDescription={saveDescription}
          onChangeLinks={changeLinks}
          fileAttachments={fileAttachments}
          fileUploading={fileUploading}
          onUploadFile={async (file) => {
            await uploadFile(file);
          }}
          onRemoveFile={removeFileAttachment}
          onOpenFile={openFileAttachment}
          documentLinkOptions={documentLinkOptions}
          letterLinkOptions={letterLinkOptions}
          emailLinkOptions={emailLinkOptions}
          onNavigateLink={(href) => {
            navigateToHref(navigate, href);
          }}
          onUploadImages={onUploadImages}
          resolveImageSrc={resolveImageSrc}
          onSaveTitle={saveTitle}
          assigneeOptions={assigneeOptions}
          relatedOptions={relatedOptions}
          projectOptions={projectOptions}
          assigneeNavigateHref={
            task.assigneeId ? `/contacts/${task.assigneeId}` : null
          }
          projectNavigateHref={
            task.projectKey ? `/projects/${task.projectKey}` : null
          }
          onCreateAssigneeFromQuery={createAssigneeFromQuery}
          onCreateRelatedContactFromQuery={createRelatedContactFromQuery}
          onAgentInboxApprove={() => {
            void workspace.patchTask(task.id, { agentInboxApproved: true });
          }}
          belowDescription={
            belowDescriptionReady
              ? ({ mode }) => activityPanel(mode === "preview")
              : undefined
          }
        />
  );

  return (
    <>
      {detailVisible && keepAliveActive ? (
        <RegisterPageTitle
          active={keepAliveActive}
          href={location.pathname}
          title={task.title}
        />
      ) : null}
      {detailVisible ? (
        <>
          <RegisterEntityDuplicateAction onDuplicate={handleDuplicateTask} />
          <RegisterEntityDeleteAction
            entityLabel={deleteEntityLabel}
            onDelete={handleDeleteTask}
          />
        </>
      ) : null}
      {overlayMode ? (
        <div className="task-detail-page-overlay">{detailView}</div>
      ) : (
        <DesktopTaskLayout
          key={`task-layout-${task.id}`}
          taskId={task.id}
          preferWideTaskPanel={!canLinkCommit}
          sidePanel={linkedCommitPanel}
          sidePanelSurfaces={linkedCommitShas.map((sha) => ({
            id: sha,
            label: sha.slice(0, 7),
          }))}
          sidePanelActiveSurfaceId={activeCommitSha}
          onActivateSidePanelSurface={setActiveCommitSha}
          sidePanelCanAddSurface={linkedCommitShas.length < 20}
          onAddSidePanelSurface={() => {
            setOpenCommitPickerRequest((n) => n + 1);
          }}
        >
          {detailView}
        </DesktopTaskLayout>
      )}
    </>
  );
}
