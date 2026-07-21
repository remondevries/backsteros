import type { Contact, Project, Task } from "@backsteros/contracts";
import { Stack, useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { getDefaultAssigneeId, syncDefaultAssigneeIdFromSettings } from "../lib/default-assignee";
import { useMobilePowerSync } from "../lib/powersync-context";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { formatTaskDueMetaLabel } from "../lib/task-due-date";
import {
  getDefaultDueDateIsoForTasksDueFilter,
  isTasksDueFilter,
} from "../lib/tasks-due-filters";
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

type PickerKind =
  | "status"
  | "priority"
  | "due"
  | "assignee"
  | "project"
  | null;

type EditableProperty = {
  key: "status" | "priority" | "due" | "assignee" | "project";
  label: string;
  value: string;
  icon: ReactNode;
};

type NamedOptionRow = {
  id: string;
  name: string | null;
};

const PROJECTS_SQL = `SELECT id, name FROM projects
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

const CONTACTS_SQL = `SELECT id, name FROM contacts
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

/** Compose a new inbox task — title, description, and editable properties. */
export function InboxCreateTaskScreen() {
  const router = useRouter();
  const segments = useSegments();
  const params = useLocalSearchParams<{
    dueFilter?: string | string[];
    projectId?: string | string[];
    contactId?: string | string[];
  }>();
  const dueFilterParam = Array.isArray(params.dueFilter)
    ? params.dueFilter[0]
    : params.dueFilter;
  const projectIdParam = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;
  const contactIdParam = Array.isArray(params.contactId)
    ? params.contactId[0]
    : params.contactId;
  const initialDueDate = useMemo(() => {
    if (!dueFilterParam || !isTasksDueFilter(dueFilterParam)) return null;
    return getDefaultDueDateIsoForTasksDueFilter(dueFilterParam);
  }, [dueFilterParam]);
  const openedFromTasks = (segments as string[]).includes("tasks");


  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const { data: syncedProjects } = useLocalQuery<NamedOptionRow>(PROJECTS_SQL);
  const { data: syncedContacts } = useLocalQuery<NamedOptionRow>(CONTACTS_SQL);
  const [restProjects, setRestProjects] = useState<NamedOptionRow[]>([]);
  const [restContacts, setRestContacts] = useState<NamedOptionRow[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(
    projectIdParam ? "ready_to_start" : "triage",
  );
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(initialDueDate);
  const [assigneeId, setAssigneeId] = useState<string | null>(
    contactIdParam ?? null,
  );
  const [projectId, setProjectId] = useState<string | null>(
    projectIdParam ?? null,
  );
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contactIdParam) {
      setAssigneeId(contactIdParam);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<{
          settings: Record<string, unknown>;
        }>("/api/v1/settings");
        if (cancelled) return;
        setAssigneeId(await syncDefaultAssigneeIdFromSettings(body.settings));
      } catch {
        if (cancelled) return;
        setAssigneeId(await getDefaultAssigneeId());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, contactIdParam]);

  useEffect(() => {
    if (powerSync.ready) return;
    let cancelled = false;
    void Promise.all([
      client
        .requestJson<{ projects: Project[] }>("/api/v1/projects")
        .catch(() => ({ projects: [] as Project[] })),
      client
        .requestJson<{ contacts: Contact[] }>("/api/v1/contacts")
        .catch(() => ({ contacts: [] as Contact[] })),
    ]).then(([projectsBody, contactsBody]) => {
      if (cancelled) return;
      setRestProjects(
        (projectsBody.projects ?? []).map((project) => ({
          id: project.id,
          name: project.name,
        })),
      );
      setRestContacts(
        (contactsBody.contacts ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [client, powerSync.ready]);

  const projects = useMemo(() => {
    if ((syncedProjects?.length ?? 0) > 0) return syncedProjects ?? [];
    return restProjects;
  }, [restProjects, syncedProjects]);

  const contacts = useMemo(() => {
    if ((syncedContacts?.length ?? 0) > 0) return syncedContacts ?? [];
    return restContacts;
  }, [restContacts, syncedContacts]);

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
      TASK_PRIORITY_LABELS.map((label, value) => ({
        value,
        label,
        icon: <TaskPriorityIcon priority={value} size={14} />,
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
  const properties: EditableProperty[] = [
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
      value: selectedAssignee?.name?.trim() || "No assignee",
      icon: <ContactPersonIcon size={14} />,
    },
    {
      key: "project",
      label: "Project",
      value: selectedProject?.name?.trim() || "No project",
      icon: <ProjectIcon size={14} />,
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
    ...(selectedAssignee
      ? [
          {
            key: "assignee",
            label: selectedAssignee.name?.trim() || "Assignee",
            icon: <ContactPersonIcon size={12} />,
          },
        ]
      : []),
    ...(selectedProject
      ? [
          {
            key: "project",
            label: selectedProject.name?.trim() || "Project",
            icon: <ProjectIcon size={12} />,
          },
        ]
      : []),
  ];

  const canCreate = title.trim().length > 0 && !saving;

  async function onCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await client.requestJson<Task>("/api/v1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || undefined,
          status,
          priority,
          dueDate,
          assigneeId,
          contactId: contactIdParam || null,
          projectId,
          inbox: !projectId && !contactIdParam,
          sortOrder: Date.now(),
        }),
      });
      if (projectId) {
        router.replace(`/task/${created.id}`);
      } else if (contactIdParam) {
        router.replace(`/task/${created.id}`);
      } else if (openedFromTasks) {
        router.replace(`/(app)/tasks/${created.id}`);
      } else {
        router.replace(`/(app)/inbox/${created.id}`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create task.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <Pressable
              onPress={() => {
                void onCreate();
              }}
              disabled={!canCreate}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Create task"
              style={({ pressed }) => ({
                minWidth: 64,
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: !canCreate ? 0.35 : pressed ? 0.55 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator
                  color={colors.foreground}
                  size="small"
                />
              ) : (
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 17,
                    fontWeight: "600",
                    lineHeight: 22,
                    textAlign: "center",
                  }}
                >
                  Create
                </Text>
              )}
            </Pressable>
          ),
        }}
      />

      <KeyboardAwareScrollView
        style={ui.screen}
        keepEndVisibleWhileTyping
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
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
        </View>

        <DetailPropertiesInlineShell
          modalTitle="Task properties"
          chips={propertyChips}
          overlay={
            <>
              <PropertyOptionSheet
                embedded
                visible={picker === "status"}
                title="Status"
                options={statusOptions}
                selected={status}
                onSelect={setStatus}
                onClose={() => setPicker(null)}
              />
              <PropertyOptionSheet
                embedded
                visible={picker === "priority"}
                title="Priority"
                options={priorityOptions}
                selected={priority}
                onSelect={setPriority}
                onClose={() => setPicker(null)}
              />
              <DueDatePropertySheet
                embedded
                visible={picker === "due"}
                title="Due date"
                selected={dueDate}
                onSelect={setDueDate}
                onClose={() => setPicker(null)}
              />
              <PropertyOptionSheet
                embedded
                visible={picker === "assignee"}
                title="Assignee"
                options={assigneeOptions}
                selected={assigneeId}
                onSelect={setAssigneeId}
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
                  if (value) setStatus("ready_to_start");
                  else setStatus("triage");
                }}
                onClose={() => setPicker(null)}
              />
            </>
          }
        >
          <DetailPropertyEditorRows
            rows={properties}
            onPressRow={(key) => setPicker(key as typeof picker)}
          />
        </DetailPropertiesInlineShell>

        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description…"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            style={{
              color: colors.foreground,
              fontSize: 15,
              lineHeight: 22,
              minHeight: 72,
              paddingVertical: 4,
            }}
          />
        </View>

        {error ? <Text style={ui.error}>{error}</Text> : null}
      </KeyboardAwareScrollView>
    </>
  );
}
