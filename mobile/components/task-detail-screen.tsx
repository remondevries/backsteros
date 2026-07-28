import type { Task } from "@backsteros/contracts";
import { useUser } from "@clerk/clerk-expo";
import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { noteLocalTaskStatusPatch } from "../lib/agent-status-notifications";
import { isPadDevice } from "../lib/device";
import { projectDetailHref } from "../lib/detail-href";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
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
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useTaskDetail } from "../lib/use-task-detail";
import { CodebaseTaskAgentPane } from "./agent/codebase-task-agent-pane";
import { CodebaseTaskLayout } from "./codebase/codebase-task-layout";
import { ContactAvatarIcon } from "./contact-avatar-icon";
import { ContactPersonIcon } from "./contact-person-icon";
import { DetailContentContainer } from "./detail-content-container";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { DetailWithPropertiesLayout } from "./detail-with-properties-layout";
import { EntityPropertiesSection } from "./entity-properties-section";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { ProjectIcon } from "./project-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TaskActivityPanel } from "./task-activity-panel";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";
import { TextInput } from "./app-text-input";

type Props = {
  taskId: string | undefined;
};

type PickerKind =
  | "status"
  | "priority"
  | "due"
  | "assignee"
  | "project"
  | null;

type NamedOptionRow = { id: string; name: string | null };

type ContactOptionRow = NamedOptionRow & {
  avatar_storage_key?: string | null;
};

const PROJECTS_SQL = `SELECT id, name FROM projects
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const CONTACTS_SQL = `SELECT id, name, avatar_storage_key FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

/** Stable style ref — avoid rebuilding native header mid interactive pop. */
const DETAIL_HEADER_TITLE_STYLE = {
  color: colors.muted,
  fontSize: 13,
  fontFamily: "Menlo",
  fontWeight: "400" as const,
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
  const powerSync = useMobilePowerSync();
  const { user } = useUser();

  const client = useMobileApiClient();
  const inPadInboxSplit =
    isPadDevice() && (segments as string[]).includes("inbox");

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  const currentUser = useMemo(
    () => ({
      email:
        user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null,
      imageUrl: user?.imageUrl?.trim() || null,
    }),
    [user?.imageUrl, user?.primaryEmailAddress?.emailAddress],
  );

  const { task, loading, error, retry, isCodebaseTask } = useTaskDetail(taskId);

  /** Codebase iPad layout is full-bleed (agent TUI) — hide floating tabs. */
  useHideTabBar(isPadDevice() && isCodebaseTask);

  const { data: syncedProjects } = useLocalQuery<NamedOptionRow>(PROJECTS_SQL);
  const { data: syncedContacts } = useLocalQuery<ContactOptionRow>(CONTACTS_SQL);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [localDescription, setLocalDescription] = useState<string | null>(null);
  const [localAgentChatId, setLocalAgentChatId] = useState<string | null>(null);

  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [activityFeedRevision, setActivityFeedRevision] = useState(0);
  const [movedToProject, setMovedToProject] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
  }, [taskId]);

  useEffect(() => {
    if (!task) return;
    setStatus(asTaskStatus(task.status));
    setPriority(task.priority);
    setDueDate(task.due_date);
    setAssigneeId(task.assignee_id);
    setProjectId(task.project_id);
  }, [task]);

  const projects = syncedProjects ?? [];
  const contacts = syncedContacts ?? [];

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

  /** Title/description stay inline-editable — no Edit button. Seed once per open. */
  useEffect(() => {
    if (!task) return;
    setDraftTitle(task.title);
    setDraftDescription(task.description ?? "");
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed keys only
  }, [taskId, taskReady]);

  async function saveEditing() {
    if (!task || saving) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    const nextDescription = draftDescription;
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
      if (powerSync.ready) {
        await powerSync.patchTask(task.id, {
          title: trimmedTitle,
          description: nextDescription,
        });
      }
      void client
        .requestJson<Task>(`/api/v1/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patchBody),
        })
        .catch(() => {
          /* optimistic UI already updated */
        });
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save task.",
      );
    } finally {
      setSaving(false);
    }
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
      else if (key === "assigneeId") sqliteValues.assignee_id = value;
      else if (key === "projectId") sqliteValues.project_id = value;
      else if (key === "inbox") sqliteValues.inbox = value ? 1 : 0;
      else sqliteValues[key] = value;
    }
    applyTaskRowOverride(task.id, {
      ...taskPatchToRowFields(values),
      ...taskPatchToRowFields(rowExtras ?? {}),
    });
    try {
      if (powerSync.ready) {
        await powerSync.patchTask(task.id, sqliteValues);
      }
      void client
        .requestJson<Task>(`/api/v1/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        })
        .then(() => {
          setActivityFeedRevision((current) => current + 1);
        })
        .catch(() => {
          /* optimistic UI already updated */
        });
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
      if (powerSync.ready) {
        await powerSync.patchTask(task.id, { agent_chat_id: chatId });
      }
      await client.requestJson<Task>(
        `/api/v1/tasks/${encodeURIComponent(task.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agentChatId: chatId,
            activityActor: "agent",
            ...(chatId ? { status: "in_progress" } : {}),
          }),
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
      key: "assignee",
      label: "Assignee",
      value: assigneeLabel || "No assignee",
      icon: <ContactAvatarIcon src={assigneeAvatarSrc} size={14} />,
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

  const detailScreenOptions = useMemo(
    () => ({
      ...tabDetailScreenOptions(),
      // Native back chevron + task id as left-aligned title (no custom headerLeft).
      title: task?.display_id ?? "",
      headerTitleAlign: "left" as const,
      headerTitleStyle: DETAIL_HEADER_TITLE_STYLE,
      // Always keep the native header — property sheets must not leave it hidden.
      headerShown: true,
      ...(inPadInboxSplit ? { headerBackVisible: false } : null),
    }),
    // Only re-apply when the visible header chrome actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task?.display_id
    [inPadInboxSplit, task?.display_id],
  );

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

  const useSideProperties = isPadDevice() && !isCodebaseTask;
  const useCodebasePadLayout = isPadDevice() && isCodebaseTask;
  const scrollBottomClearance = useCodebasePadLayout
    ? 0
    : FLOATING_TAB_BAR_CLEARANCE;
  /** Nested Modals only when phone chips sheet hosts pickers. */
  const embedPropertySheets = !useSideProperties;

  const propertyEditor = useSideProperties ? (
    <>
      <EntityPropertiesSection title="Properties">
        <DetailPropertyEditorRows
          rows={propertyRows}
          onPressRow={(key) => setPicker(key as PickerKind)}
          variant="card"
        />
      </EntityPropertiesSection>
      <EntityPropertiesSection title="Project">
        <DetailPropertyEditorRows
          rows={projectRows}
          onPressRow={(key) => setPicker(key as PickerKind)}
          variant="card"
        />
      </EntityPropertiesSection>
      {propertyError ? (
        <Text style={[ui.error, { paddingTop: 4 }]}>{propertyError}</Text>
      ) : null}
    </>
  ) : (
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
  const titleDescriptionEditors = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
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
      {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
    </View>
  );

  const alwaysEditMain = (
    <KeyboardAwareScrollView
      style={ui.screen}
      bottomClearance={scrollBottomClearance}
      keepEndVisibleWhileTyping
    >
      {titleDescriptionEditors}

      {useSideProperties ? null : (
        <DetailPropertiesInlineShell
          modalTitle="Task properties"
          chips={propertyChips}
          overlay={propertySheets}
        >
          {propertyEditor}
        </DetailPropertiesInlineShell>
      )}

      <TaskActivityPanel
        taskId={task.id}
        feedRevision={activityFeedRevision}
        requestJson={requestJson}
        currentUser={currentUser}
      />
    </KeyboardAwareScrollView>
  );

  const alwaysEditMainPad = (
    <KeyboardAwareScrollView
      style={ui.screen}
      contentContainerStyle={styles.detailScrollContent}
      bottomClearance={scrollBottomClearance}
      keepEndVisibleWhileTyping
    >
      <DetailContentContainer constrained>
        {titleDescriptionEditors}
        <TaskActivityPanel
          taskId={task.id}
          feedRevision={activityFeedRevision}
          requestJson={requestJson}
          currentUser={currentUser}
        />
      </DetailContentContainer>
    </KeyboardAwareScrollView>
  );

  return (
    <>
      <Stack.Screen options={detailScreenOptions} />
      {useCodebasePadLayout ? (
        <CodebaseTaskLayout
          detail={alwaysEditMain}
          agent={
            <CodebaseTaskAgentPane
              taskId={task.id}
              taskNumber={task.number}
              taskTitle={task.title}
              taskDescription={task.description}
              taskDisplayId={task.display_id}
              projectId={task.project_id!}
              projectKey={task.project_key}
              projectLabel={task.project_name ?? "Task"}
              cwd={task.project_local_working_directory}
              agentChatId={localAgentChatId ?? task.agent_chat_id}
              onAgentChatIdChange={onAgentChatIdChange}
            />
          }
        />
      ) : useSideProperties ? (
        <>
          <DetailWithPropertiesLayout
            main={alwaysEditMainPad}
            properties={propertyEditor}
          />
          {propertySheets}
        </>
      ) : (
        alwaysEditMain
      )}
    </>
  );
}

/** Full pane width so DetailContentContainer maxWidth can center. */
const styles = StyleSheet.create({
  detailScrollContent: {
    width: "100%",
    flexGrow: 1,
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
});
