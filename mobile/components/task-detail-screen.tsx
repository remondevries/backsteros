import type { Task } from "@backsteros/contracts";
import { trackedMinutesFromTaskSchedule } from "@backsteros/contracts";
import { useUser } from "@clerk/clerk-expo";
import { useNavigation } from "expo-router/react-navigation";
import {
  Stack,
  useRouter,
  useSegments,
  type NativeStackHeaderBackProps,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  parseAttendeeContactIds,
} from "../lib/meeting-detail-model";
import { noteLocalTaskStatusPatch } from "../lib/agent-status-notifications";
import {
  flattenInboxAttentionOrder,
  isAgentInboxPending,
  pickIdAfterRemoving,
  taskBelongsInInbox,
} from "../lib/inbox-attention";
import { readAgentSurfaceTabs } from "../lib/agent/agent-surface-tabs";
import { isPadDevice } from "../lib/device";
import { projectDetailHref, taskDetailHref } from "../lib/detail-href";
import { patchEntityViaPowerSyncOrApi } from "../lib/entity-mutations";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeaderBackButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import {
  formatTaskDueMetaLabel,
} from "../lib/task-due-date";
import {
  getTaskPriorityLabel,
  isTaskPriorityNone,
  TASK_PRIORITY_LABELS,
} from "../lib/task-priority";
import {
  applyTaskRowOverride,
  taskPatchToRowFields,
} from "../lib/task-row-overrides";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../lib/task-status";
import {
  decodeMobileRelatedValues,
  encodeMobileRelatedValues,
} from "../lib/task-related-entities";
import { CONTACTS_SQL, INBOX_NAV_SQL, ORGANIZATIONS_SQL, PROJECTS_SQL } from "./tasks/detail/task-detail-sql";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useLocalQuery } from "../lib/use-local-query";
import { useEntitySoftDelete } from "../lib/use-entity-soft-delete";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useTaskDetail } from "../lib/use-task-detail";
import { PhoneTaskSurfacesSlide } from "./agent/surfaces/phone-task-surfaces-slide";
import { SurfacesActivePulseDot } from "./agent/surfaces/surfaces-active-pulse-dot";
import {
  TaskAgentSurfacesHost,
  type SurfaceTabsController,
} from "./agent/surfaces/task-agent-surfaces-host";
import { AttendeesPropertySheet } from "./attendees-property-sheet";
import { CodebaseTaskLayout } from "./codebase/codebase-task-layout";
import { ContactAvatarIcon } from "./contact-avatar-icon";
import { ContactPersonIcon } from "./contact-person-icon";
import { OrganizationIcon } from "./organization-icon";
import { DetailHeaderDeleteButton } from "./detail-header-delete-button";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { ProjectIcon } from "./project-icon";
import { ProjectsSidePanelIcon } from "./projects-side-panel-icon";
import { SegmentedPillToggle } from "./segmented-pill-toggle";
import { TextInput } from "./app-text-input";
import { toggleMarkdownTaskListItem } from "../lib/markdown-task-list";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TaskActivityPanel } from "./task-activity-panel";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";
import { TrackedTimeField } from "./tracked-time-field";

type Props = {
  taskId: string | undefined;
};

type PickerKind =
  | "status"
  | "priority"
  | "due"
  | "dueEnd"
  | "assignee"
  | "related"
  | "project"
  | null;

type DescriptionViewMode = "edit" | "preview";

const DESCRIPTION_VIEW_OPTIONS = [
  { value: "edit" as const, label: "Edit" },
  { value: "preview" as const, label: "Preview" },
] as const;

type NamedOptionRow = { id: string; name: string | null };

type ContactOptionRow = NamedOptionRow & {
  avatar_storage_key?: string | null;
};

type InboxNavRow = {
  id: string;
  status: string | null;
  inbox?: boolean | number | null;
  due_date?: string | null;
  agent_created_at?: string | null;
  agent_inbox_approved_at?: string | null;
};

function asTaskStatus(value: string | null | undefined): TaskStatus {
  if (value && (TASK_STATUS_ORDER as readonly string[]).includes(value)) {
    return value as TaskStatus;
  }
  return "triage";
}

export function TaskDetailScreen({ taskId }: Props) {
  const segments = useSegments();
  const router = useRouter();
  const navigation = useNavigation();
  const powerSync = useMobilePowerSync();
  const { user } = useUser();

  const client = useMobileApiClient();
  const { confirmAndDelete, navigateBack } = useEntitySoftDelete();
  const inInboxRoute = (segments as string[]).includes("inbox");
  const inPadInboxSplit = isPadDevice() && inInboxRoute;

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  const currentUser = useMemo(
    () => ({
      userId: user?.id?.trim() || null,
      email:
        user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null,
      imageUrl: user?.imageUrl?.trim() || null,
    }),
    [user?.id, user?.imageUrl, user?.primaryEmailAddress?.emailAddress],
  );

  const { task, loading, error, retry, isCodebaseTask } = useTaskDetail(taskId);

  const { data: syncedProjects } = useLocalQuery<NamedOptionRow>(PROJECTS_SQL);
  const { data: syncedContacts } = useLocalQuery<ContactOptionRow>(CONTACTS_SQL);
  const { data: syncedOrganizations } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);
  const { data: inboxNavRows } = useLocalQuery<InboxNavRow>(
    inInboxRoute ? INBOX_NAV_SQL : "SELECT id FROM tasks WHERE 0",
  );

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [descriptionViewMode, setDescriptionViewMode] =
    useState<DescriptionViewMode>("edit");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [localDescription, setLocalDescription] = useState<string | null>(null);
  const [localAgentChatId, setLocalAgentChatId] = useState<string | null>(null);

  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueEndDate, setDueEndDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [relatedValues, setRelatedValues] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [activityFeedRevision, setActivityFeedRevision] = useState(0);
  const [movedToProject, setMovedToProject] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [phoneSurfacesOpen, setPhoneSurfacesOpen] = useState(false);
  const [padSurfacesCollapsed, setPadSurfacesCollapsed] = useState(false);
  const [padDetailCollapsed, setPadDetailCollapsed] = useState(false);
  const [phoneTabsController, setPhoneTabsController] =
    useState<SurfaceTabsController | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const phoneContentSlide = useRef(new Animated.Value(0)).current;
  const phoneSurfacesOpenRef = useRef(phoneSurfacesOpen);
  phoneSurfacesOpenRef.current = phoneSurfacesOpen;
  const iosPushEasing = useMemo(() => Easing.bezier(0.32, 0.72, 0, 1), []);

  useEffect(() => {
    if (isPadDevice()) return;
    Animated.timing(phoneContentSlide, {
      toValue: phoneSurfacesOpen ? 1 : 0,
      duration: 350,
      easing: iosPushEasing,
      useNativeDriver: true,
    }).start();
  }, [iosPushEasing, phoneContentSlide, phoneSurfacesOpen]);

  const togglePhoneSurfaces = useCallback(() => {
    setPhoneSurfacesOpen((open) => !open);
  }, []);

  const closePhoneSurfaces = useCallback(() => {
    setPhoneSurfacesOpen(false);
  }, []);

  // Swipe / hardware back while surfaces are open → return to the task.
  useEffect(() => {
    if (isPadDevice()) return;
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!phoneSurfacesOpenRef.current) return;
      event.preventDefault();
      closePhoneSurfaces();
    });
    return unsubscribe;
  }, [closePhoneSurfaces, navigation]);

  useEffect(() => {
    setLocalTitle(null);
    setLocalDescription(null);
    setLocalAgentChatId(null);
    setSaveError(null);
    setDraftTitle("");
    setDraftDescription("");
    setPicker(null);
    setPropertyError(null);
    setMovedToProject(null);
    setPhoneSurfacesOpen(false);
    setPadSurfacesCollapsed(false);
    setPadDetailCollapsed(false);
    setPhoneTabsController(null);
  }, [taskId]);

  // Keep the bound chat id in sync with PowerSync / API so other devices
  // (and navigate-away) pick up the same session.
  useEffect(() => {
    if (!task) return;
    const fromSync = task.agent_chat_id?.trim() || null;
    if (!fromSync) return;
    setLocalAgentChatId((prev) => (prev === fromSync ? prev : fromSync));
  }, [task?.id, task?.agent_chat_id]);

  // Desktop fillMissingAgentChatIdFromApi — local sync can lag or omit the field.
  const powerSyncReady = powerSync.ready;
  const patchTask = powerSync.patchTask;
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    void client
      .requestJson<Task>(`/api/v1/tasks/${encodeURIComponent(taskId)}`)
      .then((remote) => {
        if (cancelled) return;
        const remoteId = remote.agentChatId?.trim() || null;
        if (!remoteId) return;
        setLocalAgentChatId((prev) => (prev === remoteId ? prev : remoteId));
        applyTaskRowOverride(taskId, { agent_chat_id: remoteId });
        if (powerSyncReady) {
          void patchTask(taskId, { agent_chat_id: remoteId });
        }
      })
      .catch(() => {
        /* offline — rely on PowerSync */
      });
    return () => {
      cancelled = true;
    };
  }, [client, patchTask, powerSyncReady, taskId]);

  // Seed editable fields from sync — only write when values change (avoids
  // max-update-depth when parent re-renders with a fresh `task` object).
  useEffect(() => {
    if (!task) return;
    const nextStatus = asTaskStatus(task.status);
    const nextPriority = task.priority;
    const nextDueDate = task.due_date;
    const nextDueEndDate = task.due_end_date ?? null;
    const nextAssigneeId = task.assignee_id;
    const nextRelated = encodeMobileRelatedValues(
      parseAttendeeContactIds(task.related_contact_ids),
      parseAttendeeContactIds(task.related_organization_ids),
    );
    const nextProjectId = task.project_id;

    setStatus((prev) => (prev === nextStatus ? prev : nextStatus));
    setPriority((prev) => (prev === nextPriority ? prev : nextPriority));
    setDueDate((prev) => (prev === nextDueDate ? prev : nextDueDate));
    setDueEndDate((prev) => (prev === nextDueEndDate ? prev : nextDueEndDate));
    setAssigneeId((prev) => (prev === nextAssigneeId ? prev : nextAssigneeId));
    setRelatedValues((prev) => {
      if (
        prev.length === nextRelated.length &&
        prev.every((id, index) => id === nextRelated[index])
      ) {
        return prev;
      }
      return nextRelated;
    });
    setProjectId((prev) => (prev === nextProjectId ? prev : nextProjectId));
  }, [
    task?.assignee_id,
    task?.due_date,
    task?.due_end_date,
    task?.id,
    task?.priority,
    task?.project_id,
    task?.related_contact_ids,
    task?.related_organization_ids,
    task?.status,
  ]);

  const projects = syncedProjects ?? [];
  const contacts = syncedContacts ?? [];
  const organizations = syncedOrganizations ?? [];

  const contactAvatarEntities = useMemo(
    () =>
      contacts.map((contact) => ({
        id: contact.id,
        avatarStorageKey: contact.avatar_storage_key,
      })),
    [contacts],
  );
  const contactAvatarSrcById = useEntityAvatarSrcMap(
    "contact",
    contactAvatarEntities,
    client,
  );

  const displayTitle = localTitle ?? task?.title ?? "";
  const displayDescription =
    localDescription !== null
      ? localDescription
      : (task?.description ?? "");

  const taskReady = Boolean(task);

  /** Title/description stay inline-editable — seed once per open. */
  useEffect(() => {
    if (!task) return;
    setDraftTitle(task.title);
    setDraftDescription(task.description ?? "");
    setDescriptionViewMode("edit");
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed keys only
  }, [taskId, taskReady]);

  async function saveEditing(nextDescription = draftDescription) {
    if (!task || saving) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    const titleUnchanged = trimmedTitle === displayTitle;
    const descriptionUnchanged = nextDescription === displayDescription;
    if (titleUnchanged && descriptionUnchanged) {
      setSaveError(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const patchBody = {
      title: trimmedTitle,
      description: nextDescription,
    };
    applyTaskRowOverride(task.id, {
      title: trimmedTitle,
      description: nextDescription,
    });
    setLocalTitle(trimmedTitle);
    setLocalDescription(nextDescription);
    try {
      await patchEntityViaPowerSyncOrApi(
        client,
        powerSync,
        "tasks",
        task.id,
        patchBody,
        { title: trimmedTitle, description: nextDescription },
      );
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save task.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDescriptionViewModeChange(next: DescriptionViewMode) {
    if (next === descriptionViewMode) return;
    if (descriptionViewMode === "edit" && next === "preview") {
      void saveEditing();
    }
    setDescriptionViewMode(next);
  }

  function handleToggleTaskCheckbox(index: number) {
    const next = toggleMarkdownTaskListItem(draftDescription, index);
    if (next == null) return;
    setDraftDescription(next);
    void saveEditing(next);
  }

  async function patchProperty(
    values: Record<string, unknown>,
    rowExtras?: Record<string, unknown>,
  ) {
    if (!task) return;
    setPropertyError(null);
    if (typeof values.status === "string") {
      noteLocalTaskStatusPatch(task.id);
    }
    const sqliteValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key === "dueDate") sqliteValues.due_date = value;
      else if (key === "dueEndDate") sqliteValues.due_end_date = value;
      else if (key === "assigneeId") sqliteValues.assignee_id = value;
      else if (key === "relatedContactIds") {
        sqliteValues.related_contact_ids = Array.isArray(value)
          ? JSON.stringify(value)
          : value;
      } else if (key === "relatedOrganizationIds") {
        sqliteValues.related_organization_ids = Array.isArray(value)
          ? JSON.stringify(value)
          : value;
      } else if (key === "projectId") sqliteValues.project_id = value;
      else if (key === "agentInboxApproved") {
        if (value === true) {
          sqliteValues.agent_inbox_approved_at = new Date().toISOString();
        }
      }       else if (key === "inbox") sqliteValues.inbox = value ? 1 : 0;
      else if (key === "trackedDurationSeconds") {
        sqliteValues.tracked_duration_seconds = value;
      } else sqliteValues[key] = value;
    }
    applyTaskRowOverride(task.id, {
      ...taskPatchToRowFields(values),
      ...taskPatchToRowFields(rowExtras ?? {}),
    });
    try {
      await patchEntityViaPowerSyncOrApi(
        client,
        powerSync,
        "tasks",
        task.id,
        values,
        sqliteValues,
      );
      if (typeof values.status === "string") {
        setActivityFeedRevision((current) => current + 1);
      }
    } catch (reason) {
      setPropertyError(
        reason instanceof Error
          ? reason.message
          : "Could not update property.",
      );
    }
  }

  const onAgentChatIdChange = useCallback(
    async (chatId: string | null) => {
      if (!task) return;
      setLocalAgentChatId(chatId);
      applyTaskRowOverride(task.id, { agent_chat_id: chatId });
      const apiValues = {
        agentChatId: chatId,
        activityActor: "agent",
        ...(chatId ? { status: "in_progress" } : {}),
      };
      await patchEntityViaPowerSyncOrApi(
        client,
        powerSync,
        "tasks",
        task.id,
        apiValues,
        {
          agent_chat_id: chatId,
          ...(chatId ? { status: "in_progress" } : {}),
        },
      );
      setActivityFeedRevision((current) => current + 1);
    },
    [client, powerSync, task],
  );

  const statusOptions = useMemo<PropertyOption<TaskStatus>[]>(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        icon: <TaskStatusIcon status={value} size={16} />,
      })),
    [],
  );

  const priorityOptions = useMemo<PropertyOption<number>[]>(
    () =>
      Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
        value: Number(value),
        label,
        icon: <TaskPriorityIcon priority={Number(value)} size={14} />,
      })),
    [],
  );

  const assigneeOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No assignee",
        icon: <ContactPersonIcon size={14} />,
      },
      ...contacts.map((contact) => ({
        value: contact.id,
        label: contact.name?.trim() || "Untitled",
        icon: (
          <ContactAvatarIcon
            src={contactAvatarSrcById[contact.id] ?? null}
            size={14}
            color={colors.foreground}
          />
        ),
      })),
    ],
    [contactAvatarSrcById, contacts],
  );

  const projectOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No project",
        icon: <ProjectIcon size={14} />,
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name?.trim() || "Untitled",
        icon: <ProjectIcon size={14} color={colors.foreground} />,
      })),
    ],
    [projects],
  );

  const dueLabel = formatTaskDueMetaLabel(dueDate);
  const dueEndLabel = formatTaskDueMetaLabel(dueEndDate);
  const selectedAssignee = contacts.find((entry) => entry.id === assigneeId);
  const selectedProject = projects.find((entry) => entry.id === projectId);
  const assigneeLabel =
    selectedAssignee?.name?.trim() ||
    task?.assignee_name?.trim() ||
    null;
  const assigneeAvatarSrc = assigneeId
    ? (contactAvatarSrcById[assigneeId] ?? null)
    : null;
  const projectLabel =
    selectedProject?.name?.trim() || task?.project_name?.trim() || null;

  const statusDisabled = !projectId;

  const propertyRows = [
    {
      key: "status",
      label: "Status",
      value: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={16} />,
      editable: !statusDisabled,
    },
    {
      key: "priority",
      label: "Priority",
      value: getTaskPriorityLabel(priority),
      icon: <TaskPriorityIcon priority={priority} size={14} />,
    },
    {
      key: "due",
      label: "Due date",
      value: dueLabel ?? "No due date",
      icon: <TaskDueDateIcon active={Boolean(dueLabel)} size={14} />,
    },
    {
      key: "dueEnd",
      label: "Due end",
      value: dueEndLabel ?? "No end date",
      icon: <TaskDueDateIcon active={Boolean(dueEndLabel)} size={14} />,
    },
    {
      key: "assignee",
      label: "Assignee",
      value: assigneeLabel || "No assignee",
      icon: <ContactAvatarIcon src={assigneeAvatarSrc} size={14} />,
    },
    {
      key: "related",
      label: "Related",
      value:
        relatedValues.length === 0
          ? "No related"
          : relatedValues.length === 1
            ? (() => {
                const decoded = decodeMobileRelatedValues(relatedValues);
                if (decoded.contactIds[0]) {
                  return (
                    contacts.find((entry) => entry.id === decoded.contactIds[0])
                      ?.name?.trim() || "1 related"
                  );
                }
                if (decoded.organizationIds[0]) {
                  return (
                    organizations.find(
                      (entry) => entry.id === decoded.organizationIds[0],
                    )?.name?.trim() || "1 related"
                  );
                }
                return "1 related";
              })()
            : `${relatedValues.length} related`,
      icon:
        relatedValues.length === 1 &&
        relatedValues[0]?.startsWith("organization:") ? (
          <OrganizationIcon size={14} />
        ) : (
          <ContactPersonIcon size={14} />
        ),
    },
  ];

  const projectRows = [
    {
      key: "project",
      label: "Project",
      value: projectLabel || "No project",
      icon: <ProjectIcon size={14} />,
      navigateHref: projectId ? projectDetailHref(projectId) : null,
      navigateLabel: projectLabel
        ? `Open ${projectLabel}`
        : "Open project",
    },
  ];

  const allPropertyRows = [...propertyRows, ...projectRows];

  const propertyChips = [
    {
      key: "status",
      label: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={14} />,
    },
    ...(!isTaskPriorityNone(priority)
      ? [
          {
            key: "priority",
            label: getTaskPriorityLabel(priority),
            icon: <TaskPriorityIcon priority={priority} size={12} />,
          },
        ]
      : []),
    ...(dueLabel
      ? [
          {
            key: "due",
            label: dueLabel,
            icon: <TaskDueDateIcon active size={12} />,
          },
        ]
      : []),
    ...(assigneeLabel
      ? [
          {
            key: "assignee",
            label: assigneeLabel,
            icon: <ContactAvatarIcon src={assigneeAvatarSrc} size={12} />,
          },
        ]
      : []),
    ...(projectLabel
      ? [
          {
            key: "project",
            label: projectLabel,
            icon: <ProjectIcon size={12} />,
          },
        ]
      : []),
  ];

  const phoneHasOpenSurfaceTabs =
    (phoneTabsController?.state.tabs.length ??
      readAgentSurfaceTabs(taskId).tabs.length) > 0;

  const afterTaskDelete = useCallback(() => {
    if (!task) {
      navigateBack();
      return;
    }
    if (inInboxRoute) {
      const orderedIds = flattenInboxAttentionOrder(
        inboxNavRows.filter((row) =>
          taskBelongsInInbox({
            inbox: row.inbox,
            status: row.status,
            due_date: row.due_date,
            agent_created_at: row.agent_created_at,
            agent_inbox_approved_at: row.agent_inbox_approved_at,
          }),
        ),
      ).map((row) => row.id);
      const nextId = pickIdAfterRemoving(orderedIds, task.id);
      if (nextId) {
        router.replace(`/(app)/inbox/${nextId}`);
        return;
      }
      router.replace("/(app)/inbox");
      return;
    }
    navigateBack();
  }, [inInboxRoute, inboxNavRows, navigateBack, router, task]);

  const taskTitle = task?.title ?? null;
  const onDeleteTask = useCallback(() => {
    if (!taskId) return;
    confirmAndDelete(
      "tasks",
      taskId,
      draftTitle.trim() ||
        localTitle?.trim() ||
        taskTitle?.trim() ||
        "Untitled",
      { onDeleted: afterTaskDelete },
    );
  }, [
    afterTaskDelete,
    confirmAndDelete,
    draftTitle,
    localTitle,
    taskId,
    taskTitle,
  ]);

  const detailScreenOptions = useMemo(() => {
    const base = {
      // iPad: solid black canvas (not `embedded` surface). Only the left task
      // column is carded inside CodebaseTaskLayout; chat floats on the shell.
      ...tabDetailScreenOptions({ embedded: false }),
      // Task id lives above the title in content (letter/detail parity).
      title: "",
      headerTitle: (): ReactNode => null,
      headerTitleAlign: "left" as const,
      // iPad: no stack header — Back lives in the left task column so the
      // right chat/surfaces pane can sit flush to the top of the canvas.
      headerShown: !isPadDevice(),
      ...(isPadDevice()
        ? {
            headerBackVisible: false,
            headerLeft: () => null,
            contentStyle: { backgroundColor: colors.background },
            headerStyle: { backgroundColor: colors.background },
          }
        : null),
    };

    if (isPadDevice()) return base;

    // Task page: stack back returns to wherever the user came from. Surfaces
    // open as a full-window push overlay (header stays put underneath).
    return {
      ...base,
      header: undefined,
      // Custom left replaces native back so a sticky headerLeft: null from the
      // surfaces header cannot leave this screen without a way back.
      headerBackVisible: false,
      headerLeft: (props: NativeStackHeaderBackProps): ReactNode => {
        if (!props.canGoBack && !navigation.canGoBack()) {
          return null;
        }
        return (
          <TabStackHeaderBackButton
            tintColor={
              typeof props.tintColor === "string" ? props.tintColor : undefined
            }
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              router.back();
            }}
          />
        );
      },
      headerRight: (): ReactNode => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <DetailHeaderDeleteButton onDelete={onDeleteTask} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show surfaces"
            accessibilityState={{ expanded: false }}
            hitSlop={8}
            onPress={togglePhoneSurfaces}
            style={({ pressed }) => [
              styles.headerToggle,
              pressed ? { opacity: 0.55 } : null,
            ]}
          >
            <ProjectsSidePanelIcon
              size={18}
              rail="end"
              collapsed={false}
              color={colors.foreground}
            />
            <SurfacesActivePulseDot visible={phoneHasOpenSurfaceTabs} />
          </Pressable>
        </View>
      ),
    };
  }, [
    navigation,
    onDeleteTask,
    phoneHasOpenSurfaceTabs,
    router,
    togglePhoneSurfaces,
  ]);

  const handlePadDetailBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.back();
  }, [navigation, router]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={detailScreenOptions} />
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (error || !task) {
    return (
      <>
        <Stack.Screen options={detailScreenOptions} />
        <View style={ui.screen}>
          <Text style={ui.error}>{error ?? "Task not found."}</Text>
          <Text style={ui.hint} onPress={() => void retry()}>
            Tap to retry
          </Text>
        </View>
      </>
    );
  }

  const usePadSurfacesLayout = isPadDevice();
  /** Nested Modals only when phone chips sheet hosts pickers. */
  const embedPropertySheets = !usePadSurfacesLayout;

  const agentInboxPending = task
    ? isAgentInboxPending({
        agent_created_at: task.agent_created_at,
        agent_inbox_approved_at: task.agent_inbox_approved_at,
      })
    : false;

  function approveAgentInbox() {
    if (!task) return;
    const orderedIds = flattenInboxAttentionOrder(
      inboxNavRows.filter((row) =>
        taskBelongsInInbox({
          inbox: row.inbox,
          status: row.status,
          due_date: row.due_date,
          agent_created_at: row.agent_created_at,
          agent_inbox_approved_at: row.agent_inbox_approved_at,
        }),
      ),
    ).map((row) => row.id);
    const nextId = inInboxRoute
      ? pickIdAfterRemoving(orderedIds, task.id)
      : null;
    void patchProperty({ agentInboxApproved: true });
    if (!inInboxRoute) return;
    if (nextId) {
      router.replace(`/(app)/inbox/${nextId}`);
      return;
    }
    router.replace("/(app)/inbox");
  }

  const propertyEditor = (
    <>
      <DetailPropertyEditorRows
        rows={allPropertyRows}
        onPressRow={(key) => setPicker(key as PickerKind)}
      />
      {propertyError ? (
        <Text style={[ui.error, { paddingTop: 8 }]}>{propertyError}</Text>
      ) : null}
    </>
  );

  const agentApproveButton = agentInboxPending ? (
    <View style={styles.agentApproveWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Approve"
        style={({ pressed }) => [
          styles.agentApproveButton,
          pressed ? styles.agentApproveButtonPressed : null,
        ]}
        onPress={approveAgentInbox}
      >
        <Text style={styles.agentApproveButtonLabel}>Approve</Text>
      </Pressable>
    </View>
  ) : null;

  const propertySheets = (
    <>
      <PropertyOptionSheet
        embedded={embedPropertySheets}
        visible={picker === "status"}
        title="Status"
        options={statusOptions}
        selected={status}
        onSelect={(value) => {
          setStatus(value);
          setPicker(null);
          void patchProperty({ status: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded={embedPropertySheets}
        visible={picker === "priority"}
        title="Priority"
        options={priorityOptions}
        selected={priority}
        onSelect={(value) => {
          setPriority(value);
          setPicker(null);
          void patchProperty({ priority: value });
        }}
        onClose={() => setPicker(null)}
      />
      <DueDatePropertySheet
        embedded={embedPropertySheets}
        visible={picker === "due"}
        title="Due date"
        selected={dueDate}
        onSelect={(value) => {
          setDueDate(value);
          setPicker(null);
          void patchProperty({ dueDate: value });
        }}
        onClose={() => setPicker(null)}
      />
      <DueDatePropertySheet
        embedded={embedPropertySheets}
        visible={picker === "dueEnd"}
        title="Due end"
        selected={dueEndDate}
        onSelect={(value) => {
          setDueEndDate(value);
          setPicker(null);
          void patchProperty({ dueEndDate: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded={embedPropertySheets}
        visible={picker === "assignee"}
        title="Assignee"
        options={assigneeOptions}
        selected={assigneeId}
        onSelect={(value) => {
          setAssigneeId(value);
          setPicker(null);
          const assigneeName =
            contacts.find((entry) => entry.id === value)?.name?.trim() || null;
          void patchProperty(
            { assigneeId: value },
            { assignee_name: assigneeName },
          );
        }}
        onClose={() => setPicker(null)}
      />
      <AttendeesPropertySheet
        visible={picker === "related"}
        title="Related"
        searchPlaceholder="Search contacts and organizations…"
        options={[
          ...contacts.map((contact) => ({
            id: encodeMobileRelatedValues([contact.id], [])[0]!,
            label: contact.name?.trim() || "Untitled",
            icon: <ContactPersonIcon size={16} />,
          })),
          ...organizations.map((organization) => ({
            id: encodeMobileRelatedValues([], [organization.id])[0]!,
            label: organization.name?.trim() || "Untitled",
            icon: <OrganizationIcon size={16} />,
          })),
        ]}
        selectedIds={relatedValues}
        onChange={(ids) => {
          setRelatedValues(ids);
          const related = decodeMobileRelatedValues(ids);
          void patchProperty({
            relatedContactIds: related.contactIds,
            relatedOrganizationIds: related.organizationIds,
          });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded={embedPropertySheets}
        visible={picker === "project"}
        title="Project"
        options={projectOptions}
        selected={projectId}
        onSelect={(value) => {
          setProjectId(value);
          setPicker(null);
          const projectName =
            projects.find((entry) => entry.id === value)?.name?.trim() || null;
          if (value) {
            // Keep triage until the user changes status; leave inbox capture.
            void patchProperty(
              {
                projectId: value,
                inbox: false,
              },
              { project_name: projectName },
            );
            if (inPadInboxSplit || (segments as string[]).includes("inbox")) {
              setMovedToProject({
                id: value,
                name: projectName || "project",
              });
            }
          } else {
            setStatus("triage");
            setMovedToProject(null);
            void patchProperty(
              {
                projectId: null,
                inbox: true,
                status: "triage",
              },
              { project_name: null },
            );
          }
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  /** Title/description stay editable inline — save on blur, no header Edit/Save. */
  const showPadDetailBack =
    usePadSurfacesLayout && !inPadInboxSplit && navigation.canGoBack();
  const showPadDetailToggle = usePadSurfacesLayout;

  const titleDescriptionEditors = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
      {showPadDetailBack || showPadDetailToggle ? (
        <View style={styles.padDetailChrome}>
          {showPadDetailBack ? (
            <TabStackHeaderBackButton
              label="Back"
              onPress={handlePadDetailBack}
            />
          ) : (
            <View style={styles.padDetailChromeSpacer} />
          )}
          {showPadDetailToggle ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide task details"
              accessibilityState={{ expanded: true }}
              hitSlop={8}
              onPress={() => setPadDetailCollapsed(true)}
              style={({ pressed }) => [
                styles.padDetailToggle,
                pressed ? { opacity: 0.55 } : null,
              ]}
            >
              <ProjectsSidePanelIcon size={18} color={colors.foreground} />
            </Pressable>
          ) : null}
          <DetailHeaderDeleteButton onDelete={onDeleteTask} />
        </View>
      ) : null}
      {movedToProject ? (
        <Pressable
          onPress={() => router.push(projectDetailHref(movedToProject.id))}
          style={styles.movedBanner}
          accessibilityRole="link"
          accessibilityLabel={`Moved into ${movedToProject.name}`}
        >
          <Text style={styles.movedBannerText}>
            Moved into{" "}
            <Text style={styles.movedBannerLink}>{movedToProject.name}</Text>.
          </Text>
        </Pressable>
      ) : null}
      {task.display_id ? (
        <Text style={ui.detailId}>{task.display_id}</Text>
      ) : null}
      <TextInput
        value={draftTitle}
        onChangeText={setDraftTitle}
        placeholder="Task title"
        placeholderTextColor={colors.muted}
        returnKeyType="next"
        onBlur={() => {
          void saveEditing();
        }}
        style={{
          color: colors.foreground,
          fontSize: 24,
          fontWeight: "600",
          lineHeight: 30,
          paddingVertical: 4,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 4,
        }}
      >
        <SegmentedPillToggle
          value={descriptionViewMode}
          options={DESCRIPTION_VIEW_OPTIONS}
          onChange={handleDescriptionViewModeChange}
          accessibilityLabel="Description view mode"
        />
      </View>
      {descriptionViewMode === "edit" ? (
        <TextInput
          value={draftDescription}
          onChangeText={setDraftDescription}
          placeholder="Add a description…"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          onBlur={() => {
            void saveEditing();
          }}
          style={{
            color: colors.foreground,
            fontSize: 15,
            lineHeight: 22,
            minHeight: 160,
            paddingVertical: 4,
          }}
        />
      ) : draftDescription.trim() ? (
        <JournalMarkdownBody
          body={draftDescription}
          onToggleTaskCheckbox={handleToggleTaskCheckbox}
        />
      ) : (
        <Text
          style={{
            color: colors.muted,
            fontSize: 15,
            lineHeight: 22,
            paddingVertical: 4,
          }}
        >
          No description yet.
        </Text>
      )}
      {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
    </View>
  );

  const alwaysEditMain = (
    <KeyboardAwareScrollView
      style={ui.screen}
      bottomClearance={FLOATING_TAB_BAR_CLEARANCE}
      keepEndVisibleWhileTyping
    >
      {titleDescriptionEditors}

      {task ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TrackedTimeField
            variant="pill"
            trackedDurationSeconds={task.tracked_duration_seconds ?? null}
            trackedMinutes={task.tracked_minutes ?? null}
            scheduleMinutes={trackedMinutesFromTaskSchedule(dueDate, dueEndDate)}
            timerSession={{
              kind: "task",
              entityId: task.id,
              title: draftTitle.trim() || task.title?.trim() || "Untitled task",
              subtitle: task.display_id ?? null,
              statusKey: status,
              href: taskDetailHref(task.id),
            }}
            onTrackedDurationSecondsChange={(seconds) => {
              void patchProperty({ trackedDurationSeconds: seconds });
            }}
          />
        </View>
      ) : null}

      <DetailPropertiesInlineShell
        modalTitle="Task properties"
        chips={propertyChips}
        overlay={propertySheets}
      >
        {propertyEditor}
      </DetailPropertiesInlineShell>
      {agentApproveButton}

      <TaskActivityPanel
        taskId={task.id}
        feedRevision={activityFeedRevision}
        requestJson={requestJson}
        currentUser={currentUser}
      />
    </KeyboardAwareScrollView>
  );

  const surfacesHostProps = {
    taskId: task.id,
    taskNumber: task.number,
    taskTitle: task.title,
    taskDescription: task.description,
    taskDisplayId: task.display_id,
    projectId: task.project_id,
    projectKey: task.project_key,
    projectLabel: task.project_name ?? "Task",
    cwd: task.project_local_working_directory,
    isCodebaseProject: isCodebaseTask,
    agentChatId: localAgentChatId ?? task.agent_chat_id,
    onAgentChatIdChange,
    onHide: usePadSurfacesLayout
      ? () => setPadSurfacesCollapsed(true)
      : undefined,
    collapsed: usePadSurfacesLayout ? padSurfacesCollapsed : false,
    onExpand: usePadSurfacesLayout
      ? () => setPadSurfacesCollapsed(false)
      : undefined,
    hideInlineTabBar: !usePadSurfacesLayout,
    onTabsControllerChange: !usePadSurfacesLayout
      ? setPhoneTabsController
      : undefined,
  } as const;

  const phoneContentTranslateX = phoneContentSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.round(windowWidth * 0.3)],
  });

  return (
    <>
      <Stack.Screen options={detailScreenOptions} />
      {usePadSurfacesLayout ? (
        <CodebaseTaskLayout
          detail={alwaysEditMain}
          surfacesCollapsed={padSurfacesCollapsed}
          detailCollapsed={padDetailCollapsed}
          onExpandDetail={() => setPadDetailCollapsed(false)}
          agent={<TaskAgentSurfacesHost {...surfacesHostProps} />}
        />
      ) : (
        <View style={styles.phoneRoot}>
          <Animated.View
            style={[
              styles.phoneContent,
              {
                transform: [{ translateX: phoneContentTranslateX }],
              },
            ]}
            pointerEvents={phoneSurfacesOpen ? "none" : "auto"}
          >
            {alwaysEditMain}
          </Animated.View>
          <PhoneTaskSurfacesSlide
            visible={phoneSurfacesOpen}
            keepMounted={phoneHasOpenSurfaceTabs}
            onBack={closePhoneSurfaces}
            controller={phoneTabsController}
            {...surfacesHostProps}
          />
        </View>
      )}
    </>
  );
}

/** Full pane width so DetailContentContainer maxWidth can center. */
const styles = StyleSheet.create({
  phoneRoot: {
    flex: 1,
    minHeight: 0,
  },
  phoneContent: {
    flex: 1,
    minHeight: 0,
  },
  headerToggle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
    borderRadius: 8,
  },
  padDetailChrome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  padDetailChromeSpacer: {
    flex: 1,
  },
  padDetailToggle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginRight: -6,
  },
  movedBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  movedBannerText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  movedBannerLink: {
    color: colors.foreground,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  agentApproveWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  agentApproveButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
  },
  agentApproveButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  agentApproveButtonLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
});
