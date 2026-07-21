import type { Contact, Project, Task } from "@backsteros/contracts";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";

import { projectDetailHref } from "../lib/detail-href";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeaderTextButton,
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
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useTaskDetail } from "../lib/use-task-detail";
import { ContactPersonIcon } from "./contact-person-icon";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { ProjectIcon } from "./project-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
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

const PROJECTS_SQL = `SELECT id, name FROM projects
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const CONTACTS_SQL = `SELECT id, name FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

function asTaskStatus(value: string | null | undefined): TaskStatus {
  if (value && (TASK_STATUS_ORDER as readonly string[]).includes(value)) {
    return value as TaskStatus;
  }
  return "triage";
}

export function TaskDetailScreen({ taskId }: Props) {
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const { task, loading, error, retry } = useTaskDetail(taskId);

  const { data: syncedProjects } = useLocalQuery<NamedOptionRow>(PROJECTS_SQL);
  const { data: syncedContacts } = useLocalQuery<NamedOptionRow>(CONTACTS_SQL);
  const [restProjects, setRestProjects] = useState<NamedOptionRow[]>([]);
  const [restContacts, setRestContacts] = useState<NamedOptionRow[]>([]);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [localDescription, setLocalDescription] = useState<string | null>(null);

  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  useEffect(() => {
    setLocalTitle(null);
    setLocalDescription(null);
    setEditing(false);
    setSaveError(null);
    setDraftTitle("");
    setDraftDescription("");
    setPicker(null);
    setPropertyError(null);
  }, [taskId]);

  useEffect(() => {
    if (!task) return;
    setStatus(asTaskStatus(task.status));
    setPriority(task.priority);
    setDueDate(task.due_date);
    setAssigneeId(task.assignee_id);
    setProjectId(task.project_id);
  }, [task]);

  useEffect(() => {
    if (powerSync.ready) return;
    let cancelled = false;
    void Promise.all([
      client
        .requestJson<{ projects: Project[] }>("/api/v1/projects")
        .then((body) =>
          (body.projects ?? []).map((project) => ({
            id: project.id,
            name: project.name,
          })),
        )
        .catch(() => [] as NamedOptionRow[]),
      client
        .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
        .then((body) =>
          (body.contacts ?? []).map((contact) => ({
            id: contact.id,
            name: contact.name,
          })),
        )
        .catch(() => [] as NamedOptionRow[]),
    ]).then(([projects, contacts]) => {
      if (cancelled) return;
      setRestProjects(projects);
      setRestContacts(contacts);
    });
    return () => {
      cancelled = true;
    };
  }, [client, powerSync.ready]);

  const projects = powerSync.ready ? (syncedProjects ?? []) : restProjects;
  const contacts = powerSync.ready ? (syncedContacts ?? []) : restContacts;

  const displayTitle = localTitle ?? task?.title ?? "";
  const displayDescription =
    localDescription !== null
      ? localDescription
      : (task?.description ?? "");

  const startEditing = useCallback(() => {
    if (!task) return;
    setDraftTitle(displayTitle);
    setDraftDescription(displayDescription);
    setSaveError(null);
    setEditing(true);
  }, [displayDescription, displayTitle, task]);

  async function saveEditing() {
    if (!task || saving) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const nextDescription = draftDescription;
    const patchBody = {
      title: trimmedTitle,
      description: nextDescription,
    };
    try {
      await powerSync.patchTask(task.id, {
        title: trimmedTitle,
        description: nextDescription,
      });
      setLocalTitle(trimmedTitle);
      setLocalDescription(nextDescription);
      void client
        .requestJson<Task>(`/api/v1/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patchBody),
        })
        .catch(() => {
          /* local already updated */
        });
      setEditing(false);
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function patchProperty(values: Record<string, unknown>) {
    if (!task) return;
    setPropertyError(null);
    const sqliteValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key === "dueDate") sqliteValues.due_date = value;
      else if (key === "assigneeId") sqliteValues.assignee_id = value;
      else if (key === "projectId") sqliteValues.project_id = value;
      else if (key === "inbox") sqliteValues.inbox = value ? 1 : 0;
      else sqliteValues[key] = value;
    }
    try {
      await powerSync.patchTask(task.id, sqliteValues);
      void client
        .requestJson<Task>(`/api/v1/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        })
        .catch(() => {
          /* local already updated */
        });
    } catch (reason) {
      setPropertyError(
        reason instanceof Error
          ? reason.message
          : "Could not update property.",
      );
    }
  }

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
        icon: <ContactPersonIcon size={14} color={colors.foreground} />,
      })),
    ],
    [contacts],
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
  const projectLabel =
    selectedProject?.name?.trim() || task?.project_name?.trim() || null;

  const propertyRows = [
    {
      key: "status",
      label: "Status",
      value: getTaskStatusLabel(status),
      icon: <TaskStatusIcon status={status} size={16} />,
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
      icon: <ContactPersonIcon size={14} />,
    },
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
            icon: <ContactPersonIcon size={12} />,
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

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{error ?? "Task not found."}</Text>
        <Text style={ui.hint} onPress={() => void retry()}>
          Tap to retry
        </Text>
      </View>
    );
  }

  const propertySheets = (
    <>
      <PropertyOptionSheet
        embedded
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
        embedded
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
        embedded
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
        embedded
        visible={picker === "assignee"}
        title="Assignee"
        options={assigneeOptions}
        selected={assigneeId}
        onSelect={(value) => {
          setAssigneeId(value);
          setPicker(null);
          void patchProperty({ assigneeId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "project"}
        title="Project"
        options={projectOptions}
        selected={projectId}
        onSelect={(value) => {
          setProjectId(value);
          const nextStatus = value ? "ready_to_start" : "triage";
          setStatus(nextStatus);
          setPicker(null);
          void patchProperty({
            projectId: value,
            inbox: !value,
            status: nextStatus,
          });
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  if (editing) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            headerRight: () => (
              <TabStackHeaderTextButton
                label="Save"
                onPress={() => {
                  void saveEditing();
                }}
                loading={saving}
                disabled={saving || !draftTitle.trim()}
              />
            ),
          }}
        />
        <KeyboardAwareScrollView
          style={ui.screen}
          keepEndVisibleWhileTyping
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {task.display_id ? (
              <Text style={ui.detailId}>{task.display_id}</Text>
            ) : null}
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Task title"
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="next"
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
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 160,
                paddingVertical: 4,
              }}
            />
          </View>
          {saveError ? (
            <Text style={[ui.error, { paddingHorizontal: 16 }]}>
              {saveError}
            </Text>
          ) : null}
        </KeyboardAwareScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <TabStackHeaderTextButton label="Edit" onPress={startEditing} />
          ),
        }}
      />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 6 }}>
          {task.display_id ? (
            <Text style={ui.detailId}>{task.display_id}</Text>
          ) : null}
          <Text style={ui.detailTitle}>{displayTitle}</Text>
        </View>

        <DetailPropertiesInlineShell
          modalTitle="Task properties"
          chips={propertyChips}
          overlay={propertySheets}
        >
          <DetailPropertyEditorRows
            rows={propertyRows}
            onPressRow={(key) => setPicker(key as PickerKind)}
          />
          {propertyError ? (
            <Text style={[ui.error, { paddingTop: 8 }]}>{propertyError}</Text>
          ) : null}
        </DetailPropertiesInlineShell>

        <Text style={ui.sectionHeader}>Description</Text>
        {displayDescription.trim() ? (
          <Text style={ui.detailDescription}>{displayDescription.trim()}</Text>
        ) : (
          <Text style={[ui.detailDescription, { color: colors.muted }]}>
            No description yet.
          </Text>
        )}
      </ScrollView>
    </>
  );
}
