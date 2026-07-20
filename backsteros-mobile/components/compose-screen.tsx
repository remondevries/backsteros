import type { Contact, Document, Project, Task } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  documentPathFromTitle,
  isComposeKnowledgeBaseValue,
  type ComposeKind,
} from "../lib/compose";
import { getDefaultAssigneeId } from "../lib/default-assignee";
import { documentDetailHref, taskDetailHref } from "../lib/detail-href";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  endOfLocalDayIso,
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
import { ContactPersonIcon } from "./contact-person-icon";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { ProjectIcon } from "./project-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { SegmentedPillToggle } from "./segmented-pill-toggle";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

type PickerKind =
  | "status"
  | "priority"
  | "due"
  | "assignee"
  | "project"
  | "documentTarget"
  | null;

type NamedOptionRow = {
  id: string;
  name: string | null;
};

type EditableProperty = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
};

const PROJECTS_SQL = `SELECT id, name FROM projects
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

const CONTACTS_SQL = `SELECT id, name FROM contacts
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

function dueIsoForOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return endOfLocalDayIso(date);
}

/** Global compose tab — Task / Document toggle (desktop create modal parity). */
export function ComposeScreen() {
  const router = useRouter();

  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const { data: syncedProjects } = useLocalQuery<NamedOptionRow>(PROJECTS_SQL);
  const { data: syncedContacts } = useLocalQuery<NamedOptionRow>(CONTACTS_SQL);
  const [restProjects, setRestProjects] = useState<NamedOptionRow[]>([]);
  const [restContacts, setRestContacts] = useState<NamedOptionRow[]>([]);

  const [kind, setKind] = useState<ComposeKind>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documentTarget, setDocumentTarget] = useState<string>(
    COMPOSE_KNOWLEDGE_BASE_VALUE,
  );
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getDefaultAssigneeId().then(setAssigneeId);
  }, []);

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

  const projects = powerSync.ready
    ? (syncedProjects ?? [])
    : restProjects;
  const contacts = powerSync.ready
    ? (syncedContacts ?? [])
    : restContacts;

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

  const dueOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No due date",
        icon: <TaskDueDateIcon active={false} size={14} />,
      },
      {
        value: dueIsoForOffset(0),
        label: "Today",
        icon: <TaskDueDateIcon active size={14} />,
      },
      {
        value: dueIsoForOffset(1),
        label: "Tomorrow",
        icon: <TaskDueDateIcon active size={14} />,
      },
      {
        value: dueIsoForOffset(7),
        label: "In 7 days",
        icon: <TaskDueDateIcon active size={14} />,
      },
    ],
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

  const taskProjectOptions = useMemo<PropertyOption<string | null>[]>(
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

  const documentTargetOptions = useMemo<PropertyOption<string>[]>(
    () => [
      {
        value: COMPOSE_KNOWLEDGE_BASE_VALUE,
        label: "Knowledge Base",
        icon: <ProjectIcon size={14} color={colors.foreground} />,
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
  const selectedDocumentTarget = isComposeKnowledgeBaseValue(documentTarget)
    ? "Knowledge Base"
    : projects.find((entry) => entry.id === documentTarget)?.name?.trim() ||
      "Knowledge Base";

  const taskProperties: EditableProperty[] = [
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

  const documentProperties: EditableProperty[] = [
    {
      key: "documentTarget",
      label: "Project",
      value: selectedDocumentTarget,
      icon: <ProjectIcon size={14} />,
    },
  ];

  const isTask = kind === "task";
  const propertyRows = isTask ? taskProperties : documentProperties;

  const propertyChips = isTask
    ? [
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
      ]
    : [
        {
          key: "documentTarget",
          label: selectedDocumentTarget,
          icon: <ProjectIcon size={12} />,
        },
      ];

  const canCreate = title.trim().length > 0 && !saving;

  function onKindChange(next: ComposeKind) {
    setKind(next);
    setError(null);
    setPicker(null);
  }

  async function onCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (isTask) {
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
            projectId,
            inbox: !projectId,
            sortOrder: Date.now(),
          }),
        });
        router.replace(taskDetailHref(created.id));
        return;
      }

      const isKnowledge = isComposeKnowledgeBaseValue(documentTarget);
      const created = await client.requestJson<Document>("/api/v1/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isKnowledge
            ? {
                type: "knowledge",
                title: trimmedTitle,
                path: documentPathFromTitle(trimmedTitle),
                content: documentContent,
              }
            : {
                type: "project",
                projectId: documentTarget,
                title: trimmedTitle,
                path: documentPathFromTitle(trimmedTitle),
                content: documentContent,
              },
        ),
      });
      router.replace(documentDetailHref(created.id));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : isTask
            ? "Could not create task."
            : "Could not create document.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerTitle: () => null,
          headerTitleAlign: "left",
          headerBackVisible: false,
          headerLeft: () => (
            <SegmentedPillToggle
              value={kind}
              onChange={onKindChange}
              accessibilityLabel="Create type"
              disabled={saving}
              options={[
                { value: "task", label: "Task" },
                { value: "document", label: "Document" },
              ]}
            />
          ),
          headerRight: () => (
            <Pressable
              onPress={() => {
                void onCreate();
              }}
              disabled={!canCreate}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={isTask ? "Create task" : "Create document"}
              style={({ pressed }) => ({
                minWidth: 56,
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: !canCreate ? 0.35 : pressed ? 0.55 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color={colors.foreground} size="small" />
              ) : (
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 17,
                    fontWeight: "600",
                    lineHeight: 22,
                  }}
                >
                  Create
                </Text>
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={ui.screen}
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={isTask ? "Task title" : "Document title"}
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
          modalTitle={isTask ? "Task properties" : "Document properties"}
          chips={propertyChips}
          overlay={
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
                }}
                onClose={() => setPicker(null)}
              />
              <PropertyOptionSheet
                embedded
                visible={picker === "due"}
                title="Due date"
                options={dueOptions}
                selected={dueDate}
                onSelect={(value) => {
                  setDueDate(value);
                  setPicker(null);
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
                }}
                onClose={() => setPicker(null)}
              />
              <PropertyOptionSheet
                embedded
                visible={picker === "project"}
                title="Project"
                options={taskProjectOptions}
                selected={projectId}
                onSelect={(value) => {
                  setProjectId(value);
                  if (value) setStatus("ready_to_start");
                  else setStatus("triage");
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
              <PropertyOptionSheet
                embedded
                visible={picker === "documentTarget"}
                title="Project"
                options={documentTargetOptions}
                selected={documentTarget}
                onSelect={(value) => {
                  setDocumentTarget(value);
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            </>
          }
        >
          <DetailPropertyEditorRows
            rows={propertyRows}
            onPressRow={(key) =>
              setPicker(
                key === "documentTarget"
                  ? "documentTarget"
                  : (key as PickerKind),
              )
            }
          />
        </DetailPropertiesInlineShell>

        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          {isTask ? (
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description…"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 72,
                paddingVertical: 4,
              }}
            />
          ) : (
            <TextInput
              value={documentContent}
              onChangeText={setDocumentContent}
              placeholder="Write something…"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 200,
                paddingVertical: 4,
              }}
            />
          )}
        </View>

        {error ? (
          <Text style={[ui.error, { paddingHorizontal: 16, paddingTop: 16 }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
