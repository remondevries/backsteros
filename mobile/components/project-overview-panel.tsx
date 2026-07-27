import type { Project } from "@backsteros/contracts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
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
import {
  getProjectTypeLabel,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "../lib/project-type";
import {
  isValidProjectKey,
  normalizeProjectKey,
} from "../lib/project-key";
import { useMobilePowerSync } from "../lib/powersync-context";
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
import { DetailContentContainer } from "./detail-content-container";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { DueDatePropertySheet } from "./due-date-property-sheet";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { OrganizationIcon } from "./organization-icon";
import { ProjectIcon } from "./project-icon";
import { ProjectOverviewIcon } from "./project-overview-icon";
import {
  ProjectOverviewMetaRows,
  type ProjectMetaField,
} from "./project-overview-meta-rows";
import { ProjectProgressRing } from "./project-progress-ring";
import { ProjectStatusIcon } from "./project-status-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { PropertyTextSheet } from "./property-text-sheet";
import { TaskDueDateIcon } from "./task-due-date-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TerminalConsoleIcon } from "./terminal-console-icon";
import { TextInput } from "./app-text-input";

type ProjectOverviewRow = {
  id: string;
  key: string | null;
  name: string | null;
  summary: string | null;
  description: string | null;
  status: string | null;
  priority: number | null;
  area: string | null;
  area_id: string | null;
  start_date: string | null;
  due_date: string | null;
  icon: string | null;
  type: string | null;
  organization_id: string | null;
  organization_name: string | null;
};

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type AreaRow = {
  id: string;
  name: string | null;
  parent: string | null;
  sort_order: number | null;
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
  /**
   * `stacked` — phone chips + sheet (default).
   * `wide` — iPad: desktop-style meta rows + constrained content measure.
   */
  layout?: "stacked" | "wide";
};

type PropertyRow = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
  editable?: boolean;
};

type PickerKind =
  | "key"
  | "status"
  | "priority"
  | "type"
  | "organization"
  | "start"
  | "due"
  | "area"
  | "areaId"
  | null;

type NamedOptionRow = { id: string; name: string | null };

const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const AREAS_SQL = `SELECT id, name, parent, sort_order FROM areas
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

const DETAIL_SQL = `SELECT
         p.id,
         p.key,
         p.name,
         p.summary,
         p.description,
         p.status,
         p.priority,
         p.area,
         p.area_id,
         p.start_date,
         p.due_date,
         p.icon,
         p.type,
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

function projectTypeIcon(type: ProjectType, size = 14) {
  if (type === "codebase") {
    return <TerminalConsoleIcon size={size} color={colors.foreground} />;
  }
  return <ProjectIcon size={size} color={colors.foreground} />;
}

function dueIsoForOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return endOfLocalDayIso(date);
}

/** Project overview — properties + description; edit mode keeps the same chrome. */
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
  layout = "stacked",
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
  const { data: syncedAreas } = useLocalQuery<AreaRow>(AREAS_SQL);

  const [status, setStatus] = useState<ProjectStatus>("backlog");
  const [priority, setPriority] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType>("general");
  const [projectKey, setProjectKey] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [area, setArea] = useState<ProjectArea | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const local = syncedRows?.[0] ?? null;

  useEffect(() => {
    setPicker(null);
    setPropertyError(null);
  }, [projectId]);

  const project = local;
  const organizations = syncedOrganizations ?? [];
  const progress = useMemo(() => {
    const map = aggregateTaskProgressByProjectId(syncedTaskRows ?? []);
    return map[projectId] ?? EMPTY_PROGRESS;
  }, [projectId, syncedTaskRows]);

  useEffect(() => {
    if (!project) return;
    onDescriptionLoadedRef.current?.(project.description ?? "");
  }, [project]);

  useEffect(() => {
    if (!project) return;
    setStatus(migrateLegacyProjectStatus(project.status));
    setPriority(project.priority ?? 0);
    setProjectType(migrateLegacyProjectType(project.type));
    setProjectKey(project.key?.trim() ?? "");
    setOrganizationId(project.organization_id);
    setStartDate(project.start_date);
    setDueDate(project.due_date);
    setArea(asProjectArea(project.area));
    setAreaId(project.area_id);
  }, [project]);

  async function patchProperty(values: Record<string, unknown>): Promise<boolean> {
    if (!project) return false;
    setPropertyError(null);
    const sqliteValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key === "startDate") sqliteValues.start_date = value;
      else if (key === "dueDate") sqliteValues.due_date = value;
      else if (key === "organizationId") sqliteValues.organization_id = value;
      else if (key === "areaId") sqliteValues.area_id = value;
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
      }
      return true;
    } catch (reason) {
      setPropertyError(
        reason instanceof Error
          ? reason.message
          : "Could not update property.",
      );
      return false;
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

  const typeOptions = useMemo<PropertyOption<ProjectType>[]>(
    () =>
      PROJECT_TYPE_ORDER.map((value) => ({
        value,
        label: getProjectTypeLabel(value),
        icon: projectTypeIcon(value, 14),
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

  const nestedAreasForParent = useMemo(
    () =>
      (syncedAreas ?? [])
        .filter((entry) => asProjectArea(entry.parent) === area)
        .map((entry) => ({
          id: entry.id,
          name: entry.name?.trim() || "Untitled",
        })),
    [area, syncedAreas],
  );

  const subAreaOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      {
        value: null,
        label: "No sub-area",
        icon: <ProjectIcon size={14} />,
      },
      ...nestedAreasForParent.map((entry) => ({
        value: entry.id,
        label: entry.name,
        icon: <ProjectIcon size={14} color={colors.foreground} />,
      })),
    ],
    [nestedAreasForParent],
  );

  const selectedSubArea = useMemo(
    () =>
      areaId
        ? nestedAreasForParent.find((entry) => entry.id === areaId) ?? null
        : null,
    [areaId, nestedAreasForParent],
  );

  const loading =
    !project &&
    powerSync.status !== "error" &&
    (syncLoading || !powerSync.ready);

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
        <Text style={ui.error}>
          {powerSync.status === "error"
            ? powerSync.message
            : "Project not found."}
        </Text>
      </View>
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
      value: projectKey.trim() || "—",
      icon: <ProjectIcon size={14} />,
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
      key: "type",
      label: "Type",
      value: getProjectTypeLabel(projectType),
      icon: projectTypeIcon(projectType, 14),
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
    ...(nestedAreasForParent.length > 0
      ? [
          {
            key: "areaId",
            label: "Sub-area",
            value: selectedSubArea?.name ?? "No sub-area",
            icon: <ProjectIcon size={14} />,
          } satisfies PropertyRow,
        ]
      : []),
  ];

  const propertyChips = [
    {
      key: "status",
      label: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={12} />,
    },
    ...(projectKey.trim()
      ? [
          {
            key: "key",
            label: projectKey.trim(),
            icon: <ProjectIcon size={12} />,
          },
        ]
      : []),
    ...(projectType !== "general"
      ? [
          {
            key: "type",
            label: getProjectTypeLabel(projectType),
            icon: projectTypeIcon(projectType, 12),
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
    ...(selectedSubArea
      ? [
          {
            key: "areaId",
            label: selectedSubArea.name,
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

  const useWide = layout === "wide";
  /** Nested Modals only when phone chips sheet hosts pickers. */
  const embedPropertySheets = !useWide;

  const metaProperties: ProjectMetaField[] = [
    {
      key: "key",
      label: projectKey.trim() ? `ID ${projectKey.trim()}` : "ID —",
      icon: <ProjectIcon size={12} />,
    },
    {
      key: "status",
      label: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={14} />,
    },
    {
      key: "priority",
      label: getTaskPriorityLabel(priority),
      icon: <TaskPriorityIcon priority={priority} size={12} />,
    },
    {
      key: "type",
      label: getProjectTypeLabel(projectType),
      icon: projectTypeIcon(projectType, 12),
    },
    {
      key: "organization",
      label: organizationLabel || "No organization",
      icon: <OrganizationIcon size={12} />,
    },
    {
      key: "start",
      label: startLabel ?? "No start date",
      icon: <TaskDueDateIcon active={Boolean(startLabel)} size={12} />,
    },
    {
      key: "due",
      label: dueLabel ?? "No due date",
      icon: <TaskDueDateIcon active={Boolean(dueLabel)} size={12} />,
    },
    {
      key: "progress",
      label: percentLabel,
      icon: <ProjectProgressRing progress={progress} size={14} />,
      editable: false,
    },
  ];

  const metaAreas: ProjectMetaField[] = [
    {
      key: "area",
      label: area ? PROJECT_AREA_LABELS[area] : "No area",
      icon: <ProjectIcon size={12} />,
    },
    ...(nestedAreasForParent.length > 0
      ? [
          {
            key: "areaId",
            label: selectedSubArea?.name ?? "No sub-area",
            icon: <ProjectIcon size={12} />,
          } satisfies ProjectMetaField,
        ]
      : []),
  ];

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

  const propertySheets = (
    <>
      <PropertyTextSheet
        embedded={embedPropertySheets}
        visible={picker === "key"}
        title="Project ID"
        value={projectKey}
        placeholder="e.g. ACME"
        maxLength={3}
        autoCapitalize="characters"
        normalize={normalizeProjectKey}
        validate={(next) =>
          isValidProjectKey(next) ? null : "Use 2–3 letters or numbers."
        }
        onSave={async (next) => {
          const previous = projectKey;
          setProjectKey(next);
          const ok = await patchProperty({ key: next });
          if (!ok) {
            setProjectKey(previous);
            throw new Error("Could not update project ID.");
          }
        }}
        onClose={() => setPicker(null)}
      />
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
      <PropertyOptionSheet
        embedded={embedPropertySheets}
        visible={picker === "type"}
        title="Type"
        options={typeOptions}
        selected={projectType}
        onSelect={(value) => {
          setProjectType(value);
          setPicker(null);
          void patchProperty({ type: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded={embedPropertySheets}
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
        embedded={embedPropertySheets}
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
        visible={picker === "area"}
        title="Area"
        options={areaOptions}
        selected={area}
        onSelect={(value) => {
          setArea(value);
          setAreaId(null);
          setPicker(null);
          void patchProperty({ area: value, areaId: null });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded={embedPropertySheets}
        visible={picker === "areaId"}
        title="Sub-area"
        options={subAreaOptions}
        selected={areaId}
        onSelect={(value) => {
          setAreaId(value);
          setPicker(null);
          void patchProperty({ areaId: value });
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  const overviewBody = (
    <>
      <View style={styles.overviewHeader}>
        <ProjectOverviewIcon icon={project.icon} type={projectType} />
        {editing ? (
          <TextInput
            value={draftName}
            onChangeText={onDraftNameChange}
            placeholder="Project name"
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="next"
            style={styles.titleInput}
          />
        ) : (
          <Text style={styles.title} accessibilityRole="header">
            {project.name?.trim() || "Untitled"}
          </Text>
        )}
        {editing ? null : summary ? (
          <Text style={styles.summary}>{summary}</Text>
        ) : useWide ? (
          <Text style={styles.summaryEmpty}>Add a short summary…</Text>
        ) : null}
      </View>

      {useWide ? (
        <>
          <ProjectOverviewMetaRows
            properties={metaProperties}
            areas={metaAreas}
            onPressField={(key) => setPicker(key as PickerKind)}
          />
          {propertyError ? (
            <Text style={[ui.error, { paddingHorizontal: 16, paddingTop: 8 }]}>
              {propertyError}
            </Text>
          ) : null}
          {propertySheets}
        </>
      ) : (
        <DetailPropertiesInlineShell
          modalTitle="Project properties"
          chips={propertyChips}
          overlay={propertySheets}
        >
          {propertyEditor}
        </DetailPropertiesInlineShell>
      )}

      <Text style={ui.sectionHeader}>Description</Text>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {editing ? (
          <TextInput
            value={draftDescription}
            onChangeText={onDraftDescriptionChange}
            placeholder="Add a description…"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            style={styles.descriptionInput}
          />
        ) : description ? (
          <JournalMarkdownBody body={description} />
        ) : (
          <Text style={ui.rowMeta}>No description yet.</Text>
        )}
      </View>

      {saveError ? (
        <Text style={[ui.error, { paddingHorizontal: 16, paddingBottom: 16 }]}>
          {saveError}
        </Text>
      ) : null}
    </>
  );

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      keepEndVisibleWhileTyping={editing}
    >
      <DetailContentContainer constrained={useWide}>
        {overviewBody}
      </DetailContentContainer>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  /** Parity with desktop `.project-detail__header`. */
  overviewHeader: {
    width: "100%",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 0,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.02 * 22,
    lineHeight: 28,
  },
  titleInput: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.02 * 22,
    lineHeight: 28,
    paddingVertical: 0,
  },
  summary: {
    color: "rgba(237, 237, 237, 0.65)",
    fontSize: 15,
    lineHeight: 21,
  },
  summaryEmpty: {
    color: "rgba(237, 237, 237, 0.35)",
    fontSize: 15,
    lineHeight: 21,
  },
  descriptionInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 160,
    paddingVertical: 4,
  },
});
