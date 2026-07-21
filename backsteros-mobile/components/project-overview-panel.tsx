import type { Organization, Project, Task } from "@backsteros/contracts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getProjectAreaFilterLabel,
  PROJECT_AREA_LABELS,
  PROJECT_AREAS,
  type ProjectArea,
} from "../lib/project-areas";
import {
  aggregateTaskProgressByProjectId,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../lib/project-progress-ring";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../lib/project-status";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  endOfLocalDayIso,
  formatTaskDueMetaLabel,
} from "../lib/task-due-date";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_LABELS,
} from "../lib/task-priority";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { OrganizationIcon } from "./organization-icon";
import { ProjectIcon } from "./project-icon";
import { ProjectProgressRing } from "./project-progress-ring";
import { ProjectStatusIcon } from "./project-status-icon";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";

type ProjectOverviewRow = {
  id: string;
  key: string | null;
  name: string | null;
  summary: string | null;
  description: string | null;
  status: string | null;
  priority: number | null;
  area: string | null;
  start_date: string | null;
  due_date: string | null;
  organization_id: string | null;
  organization_name: string | null;
};

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type Props = {
  projectId: string;
  editing?: boolean;
  draftName?: string;
  draftDescription?: string;
  onDraftNameChange?: (value: string) => void;
  onDraftDescriptionChange?: (value: string) => void;
  saveError?: string | null;
  onDescriptionLoaded?: (description: string) => void;
  descriptionOverride?: string | null;
};

type PropertyRow = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
  editable?: boolean;
};

type PickerKind =
  | "status"
  | "priority"
  | "organization"
  | "start"
  | "due"
  | "area"
  | null;

type NamedOptionRow = { id: string; name: string | null };

const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const DETAIL_SQL = `SELECT
         p.id,
         p.key,
         p.name,
         p.summary,
         p.description,
         p.status,
         p.priority,
         p.area,
         p.start_date,
         p.due_date,
         p.organization_id,
         o.name AS organization_name
       FROM projects p
       LEFT JOIN organizations o ON o.id = p.organization_id
       WHERE p.deleted_at IS NULL AND p.id = ?
       LIMIT 1`;

const TASK_PROGRESS_SQL = `SELECT project_id, status FROM tasks
       WHERE deleted_at IS NULL
         AND project_id = ?`;

function asProjectArea(value: string | null | undefined): ProjectArea | null {
  if (value === "personal" || value === "business" || value === "clients") {
    return value;
  }
  return null;
}

function dueIsoForOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return endOfLocalDayIso(date);
}

/** Project overview — editable properties, area, description; edit mode hides properties. */
export function ProjectOverviewPanel({
  projectId,
  editing = false,
  draftName = "",
  draftDescription = "",
  onDraftNameChange,
  onDraftDescriptionChange,
  saveError = null,
  onDescriptionLoaded,
  descriptionOverride = null,
}: Props) {
  const powerSync = useMobilePowerSync();
  const onDescriptionLoadedRef = useRef(onDescriptionLoaded);
  onDescriptionLoadedRef.current = onDescriptionLoaded;

  const client = useMobileApiClient();

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<ProjectOverviewRow>(DETAIL_SQL, [projectId]);
  const { data: syncedTaskRows } = useLocalQuery<TaskProgressRow>(
    TASK_PROGRESS_SQL,
    [projectId],
  );
  const { data: syncedOrganizations } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);

  const [restRow, setRestRow] = useState<ProjectOverviewRow | null>(null);
  const [restProgress, setRestProgress] =
    useState<ProjectTaskProgress>(EMPTY_PROGRESS);
  const [restLoading, setRestLoading] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);
  const [restOrganizations, setRestOrganizations] = useState<NamedOptionRow[]>(
    [],
  );

  const [status, setStatus] = useState<ProjectStatus>("backlog");
  const [priority, setPriority] = useState(0);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [area, setArea] = useState<ProjectArea | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const local = syncedRows?.[0] ?? null;

  useEffect(() => {
    setPicker(null);
    setPropertyError(null);
  }, [projectId]);

  useEffect(() => {
    if (local) return;
    if (powerSync.ready && syncLoading) return;

    let cancelled = false;
    setRestLoading(true);
    setRestError(null);
    void client
      .requestJson<Project>(`/api/v1/projects/${encodeURIComponent(projectId)}`)
      .then(async (project) => {
        if (cancelled) return;
        const [orgs, tasksBody] = await Promise.all([
          project.organizationId
            ? client
                .requestJson<{ organizations: Organization[] }>(
                  "/api/v1/organizations",
                )
                .catch(() => ({ organizations: [] as Organization[] }))
            : Promise.resolve({ organizations: [] as Organization[] }),
          client
            .requestJson<{ tasks: Task[] }>(
              `/api/v1/tasks?projectId=${encodeURIComponent(projectId)}`,
            )
            .catch(() => ({ tasks: [] as Task[] })),
        ]);
        if (cancelled) return;
        const organization = (orgs.organizations ?? []).find(
          (entry) => entry.id === project.organizationId,
        );
        setRestRow({
          id: project.id,
          key: project.key,
          name: project.name,
          summary: project.summary,
          description: project.description,
          status: project.status,
          priority: project.priority,
          area: project.area,
          start_date: project.startDate,
          due_date: project.dueDate,
          organization_id: project.organizationId,
          organization_name: organization?.name ?? null,
        });
        const progressMap = aggregateTaskProgressByProjectId(
          (tasksBody.tasks ?? []).map((task) => ({
            project_id: task.projectId,
            status: task.status,
          })),
        );
        setRestProgress(progressMap[projectId] ?? EMPTY_PROGRESS);
      })
      .catch((reason) => {
        if (cancelled) return;
        setRestRow(null);
        setRestError(
          reason instanceof Error ? reason.message : String(reason),
        );
      })
      .finally(() => {
        if (!cancelled) setRestLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, local, powerSync.ready, projectId, syncLoading]);

  useEffect(() => {
    if (powerSync.ready) return;
    let cancelled = false;
    void client
      .requestJson<{ organizations: Organization[] }>("/api/v1/organizations")
      .then((body) =>
        (body.organizations ?? []).map((organization) => ({
          id: organization.id,
          name: organization.name,
        })),
      )
      .catch(() => [] as NamedOptionRow[])
      .then((organizations) => {
        if (!cancelled) setRestOrganizations(organizations);
      });
    return () => {
      cancelled = true;
    };
  }, [client, powerSync.ready]);

  const project = local ?? restRow;
  const organizations = powerSync.ready
    ? (syncedOrganizations ?? [])
    : restOrganizations;
  const localProgress = useMemo(() => {
    const map = aggregateTaskProgressByProjectId(syncedTaskRows ?? []);
    return map[projectId] ?? EMPTY_PROGRESS;
  }, [projectId, syncedTaskRows]);
  const progress =
    (syncedTaskRows?.length ?? 0) > 0 || powerSync.ready
      ? localProgress
      : restProgress;

  useEffect(() => {
    if (!project) return;
    onDescriptionLoadedRef.current?.(project.description ?? "");
  }, [project]);

  useEffect(() => {
    if (!project) return;
    setStatus(migrateLegacyProjectStatus(project.status));
    setPriority(project.priority ?? 0);
    setOrganizationId(project.organization_id);
    setStartDate(project.start_date);
    setDueDate(project.due_date);
    setArea(asProjectArea(project.area));
  }, [project]);

  async function patchProperty(values: Record<string, unknown>) {
    if (!project) return;
    setPropertyError(null);
    const sqliteValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key === "startDate") sqliteValues.start_date = value;
      else if (key === "dueDate") sqliteValues.due_date = value;
      else if (key === "organizationId") sqliteValues.organization_id = value;
      else sqliteValues[key] = value;
    }
    try {
      if (powerSync.ready) {
        await powerSync.patchProject(project.id, sqliteValues);
        void client
          .requestJson<Project>(
            `/api/v1/projects/${encodeURIComponent(project.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(values),
            },
          )
          .catch(() => {
            /* local already updated */
          });
      } else {
        await client.requestJson<Project>(
          `/api/v1/projects/${encodeURIComponent(project.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(values),
          },
        );
        setRestRow((prev) =>
          prev
            ? {
                ...prev,
                ...(sqliteValues.status !== undefined
                  ? { status: String(sqliteValues.status) }
                  : {}),
                ...(sqliteValues.priority !== undefined
                  ? { priority: Number(sqliteValues.priority) }
                  : {}),
                ...(sqliteValues.area !== undefined
                  ? { area: sqliteValues.area as string | null }
                  : {}),
                ...(sqliteValues.start_date !== undefined
                  ? { start_date: sqliteValues.start_date as string | null }
                  : {}),
                ...(sqliteValues.due_date !== undefined
                  ? { due_date: sqliteValues.due_date as string | null }
                  : {}),
                ...(sqliteValues.organization_id !== undefined
                  ? {
                      organization_id: sqliteValues.organization_id as
                        | string
                        | null,
                      organization_name:
                        sqliteValues.organization_id == null
                          ? null
                          : (organizations.find(
                              (entry) =>
                                entry.id === sqliteValues.organization_id,
                            )?.name ?? prev.organization_name),
                    }
                  : {}),
              }
            : prev,
        );
      }
    } catch (reason) {
      setPropertyError(
        reason instanceof Error
          ? reason.message
          : "Could not update property.",
      );
    }
  }

  const statusOptions = useMemo<PropertyOption<ProjectStatus>[]>(
    () =>
      PROJECT_STATUSES.map((value) => ({
        value,
        label: getProjectStatusLabel(value),
        icon: <ProjectStatusIcon status={value} size={14} />,
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

  const dateOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No date",
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

  const organizationOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No organization",
        icon: <OrganizationIcon size={14} />,
      },
      ...organizations.map((organization) => ({
        value: organization.id,
        label: organization.name?.trim() || "Untitled",
        icon: <OrganizationIcon size={14} color={colors.foreground} />,
      })),
    ],
    [organizations],
  );

  const areaOptions = useMemo<PropertyOption<ProjectArea | null>[]>(
    () => [
      {
        value: null,
        label: "No area",
        icon: <ProjectIcon size={14} />,
      },
      ...PROJECT_AREAS.map((value) => ({
        value,
        label: getProjectAreaFilterLabel(value),
        icon: <ProjectIcon size={14} color={colors.foreground} />,
      })),
    ],
    [],
  );

  const loading =
    !project && (powerSync.ready ? syncLoading : restLoading);

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{restError ?? "Project not found."}</Text>
      </View>
    );
  }

  if (editing) {
    return (
      <ScrollView
        style={ui.screen}
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TextInput
            value={draftName}
            onChangeText={onDraftNameChange}
            placeholder="Project name"
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
            onChangeText={onDraftDescriptionChange}
            placeholder="Add a description…"
            placeholderTextColor={colors.muted}
            multiline
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
          <Text style={[ui.error, { paddingHorizontal: 16 }]}>{saveError}</Text>
        ) : null}
      </ScrollView>
    );
  }

  const startLabel = formatTaskDueMetaLabel(startDate);
  const dueLabel = formatTaskDueMetaLabel(dueDate);
  const summary = project.summary?.trim() ?? "";
  const description =
    (descriptionOverride !== null
      ? descriptionOverride
      : (project.description ?? "")
    ).trim();
  const percentLabel = formatProjectTaskProgressPercent(progress);
  const selectedOrganization = organizations.find(
    (entry) => entry.id === organizationId,
  );
  const organizationLabel =
    selectedOrganization?.name?.trim() ||
    project.organization_name?.trim() ||
    null;

  const allPropertyRows: PropertyRow[] = [
    {
      key: "key",
      label: "Key",
      value: project.key?.trim() || "—",
      icon: <ProjectIcon size={14} />,
      editable: false,
    },
    {
      key: "status",
      label: "Status",
      value: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={14} />,
    },
    {
      key: "priority",
      label: "Priority",
      value: getTaskPriorityLabel(priority),
      icon: <TaskPriorityIcon priority={priority} size={14} />,
    },
    {
      key: "organization",
      label: "Organization",
      value: organizationLabel || "No organization",
      icon: <OrganizationIcon size={14} />,
    },
    {
      key: "start",
      label: "Start date",
      value: startLabel ?? "No start date",
      icon: <TaskDueDateIcon active={Boolean(startLabel)} size={14} />,
    },
    {
      key: "due",
      label: "Due date",
      value: dueLabel ?? "No due date",
      icon: <TaskDueDateIcon active={Boolean(dueLabel)} size={14} />,
    },
    {
      key: "progress",
      label: "Progress",
      value: percentLabel,
      icon: <ProjectProgressRing progress={progress} size={14} />,
      editable: false,
    },
    {
      key: "area",
      label: "Area",
      value: area ? PROJECT_AREA_LABELS[area] : "No area",
      icon: <ProjectIcon size={14} />,
    },
  ];

  const propertyChips = [
    {
      key: "status",
      label: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={12} />,
    },
    ...(project.key?.trim()
      ? [
          {
            key: "key",
            label: project.key.trim(),
            icon: <ProjectIcon size={12} />,
          },
        ]
      : []),
    ...(organizationLabel
      ? [
          {
            key: "organization",
            label: organizationLabel,
            icon: <OrganizationIcon size={12} />,
          },
        ]
      : []),
    ...(area
      ? [
          {
            key: "area",
            label: PROJECT_AREA_LABELS[area],
            icon: <ProjectIcon size={12} />,
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
  ];

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
      <PropertyOptionSheet
        embedded
        visible={picker === "organization"}
        title="Organization"
        options={organizationOptions}
        selected={organizationId}
        onSelect={(value) => {
          setOrganizationId(value);
          setPicker(null);
          void patchProperty({ organizationId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "start"}
        title="Start date"
        options={dateOptions}
        selected={startDate}
        onSelect={(value) => {
          setStartDate(value);
          setPicker(null);
          void patchProperty({ startDate: value });
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
        visible={picker === "area"}
        title="Area"
        options={areaOptions}
        selected={area}
        onSelect={(value) => {
          setArea(value);
          setPicker(null);
          void patchProperty({ area: value });
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
    >
      {summary ? (
        <Text style={[ui.detailDescription, { color: colors.muted }]}>
          {summary}
        </Text>
      ) : null}

      <DetailPropertiesInlineShell
        modalTitle="Project properties"
        chips={propertyChips}
        overlay={propertySheets}
      >
        <DetailPropertyEditorRows
          rows={allPropertyRows}
          onPressRow={(key) => setPicker(key as PickerKind)}
        />
        {propertyError ? (
          <Text style={[ui.error, { paddingTop: 8 }]}>{propertyError}</Text>
        ) : null}
      </DetailPropertiesInlineShell>

      <Text style={ui.sectionHeader}>Description</Text>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        {description ? (
          <JournalMarkdownBody body={description} />
        ) : (
          <Text style={ui.rowMeta}>No description yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}
