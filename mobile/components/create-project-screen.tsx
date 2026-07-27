import type { Project } from "@backsteros/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { isPadDevice } from "../lib/device";
import {
  getProjectAreaFilterLabel,
  isProjectArea,
  PROJECT_AREA_LABELS,
  PROJECT_AREAS,
  type ProjectArea,
} from "../lib/project-areas";
import {
  isValidProjectKey,
  normalizeProjectKey,
} from "../lib/project-key";
import {
  getProjectStatusLabel,
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
  endOfLocalDayIso,
  formatTaskDueMetaLabel,
} from "../lib/task-due-date";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_LABELS,
} from "../lib/task-priority";
import {
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { TextInput } from "./app-text-input";
import { DetailContentContainer } from "./detail-content-container";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { DueDatePropertySheet } from "./due-date-property-sheet";
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

type EditableProperty = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
  editable?: boolean;
};

type NamedOptionRow = { id: string; name: string | null };

type AreaRow = {
  id: string;
  name: string | null;
  parent: string | null;
  sort_order: number | null;
};

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const AREAS_SQL = `SELECT id, name, parent, sort_order FROM areas
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

const EMPTY_PROGRESS = { total: 0, completed: 0 };

/** Short unique key from a project name — mirrors desktop `entityKeyFromName`. */
function projectKeyFromName(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  return base.length >= 2 ? base : "PRJ";
}

function dueIsoForOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return endOfLocalDayIso(date);
}

function projectTypeIcon(type: ProjectType, size = 14) {
  if (type === "codebase") {
    return <TerminalConsoleIcon size={size} color={colors.foreground} />;
  }
  return <ProjectIcon size={size} color={colors.foreground} />;
}

/**
 * Compose a new project — same chrome as project overview (icon, properties,
 * description) so create and view don’t feel like different products.
 */
export function CreateProjectScreen() {
  const router = useRouter();
  const isPad = isPadDevice();
  const useWide = isPad;
  const params = useLocalSearchParams<{
    area?: string | string[];
    organizationId?: string | string[];
    type?: string | string[];
  }>();
  const areaParam = Array.isArray(params.area) ? params.area[0] : params.area;
  const organizationIdParam = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;
  const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
  const initialArea =
    areaParam && isProjectArea(areaParam) ? areaParam : null;
  const initialType = migrateLegacyProjectType(typeParam ?? "general");

  const client = useMobileApiClient();
  const { data: syncedOrganizations } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);
  const { data: syncedAreas } = useLocalQuery<AreaRow>(AREAS_SQL);
  const organizations = syncedOrganizations ?? [];

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("backlog");
  const [priority, setPriority] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType>(initialType);
  const [organizationId, setOrganizationId] = useState<string | null>(
    organizationIdParam || null,
  );
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [area, setArea] = useState<ProjectArea | null>(initialArea);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        .filter((entry) => {
          const parent = entry.parent;
          return (
            parent === area &&
            (parent === "personal" ||
              parent === "business" ||
              parent === "clients")
          );
        })
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

  const startLabel = formatTaskDueMetaLabel(startDate);
  const dueLabel = formatTaskDueMetaLabel(dueDate);
  const selectedOrganization = organizations.find(
    (entry) => entry.id === organizationId,
  );
  const organizationLabel = selectedOrganization?.name?.trim() || null;
  const resolvedKey = projectKey.trim() || projectKeyFromName(name);
  const percentLabel = "0%";

  const allPropertyRows: EditableProperty[] = [
    {
      key: "key",
      label: "Key",
      value: resolvedKey || "—",
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
      icon: <ProjectProgressRing progress={EMPTY_PROGRESS} size={14} />,
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
          } satisfies EditableProperty,
        ]
      : []),
  ];

  const propertyChips = [
    {
      key: "status",
      label: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={12} />,
    },
    ...(resolvedKey
      ? [
          {
            key: "key",
            label: resolvedKey,
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

  const metaProperties: ProjectMetaField[] = [
    {
      key: "key",
      label: resolvedKey ? `ID ${resolvedKey}` : "ID —",
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
      icon: <ProjectProgressRing progress={EMPTY_PROGRESS} size={14} />,
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

  const embedPropertySheets = !useWide;
  const canCreate = name.trim().length > 0 && !saving;

  async function onCreate() {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    setError(null);
    try {
      const key = projectKey.trim() || projectKeyFromName(trimmedName);
      const created = await client.requestJson<Project>("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          name: trimmedName,
          summary: summary.trim() || undefined,
          description: description.trim() || undefined,
          status,
          priority,
          area,
          areaId: areaId || null,
          organizationId: organizationId || null,
          startDate,
          dueDate,
          type: projectType,
          sortOrder: -Date.now(),
        }),
      });
      router.replace(`/(app)/projects/${created.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create project.",
      );
      setSaving(false);
    }
  }

  const propertySheets = (
    <>
      <PropertyTextSheet
        embedded={embedPropertySheets}
        visible={picker === "key"}
        title="Project ID"
        value={resolvedKey}
        placeholder="e.g. ACME"
        maxLength={3}
        autoCapitalize="characters"
        normalize={normalizeProjectKey}
        validate={(next) =>
          isValidProjectKey(next) ? null : "Use 2–3 letters or numbers."
        }
        onSave={async (next) => {
          setProjectKey(next);
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
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <TabStackHeaderTextButton
              label="Create"
              onPress={() => {
                void onCreate();
              }}
              loading={saving}
              disabled={!canCreate}
            />
          ),
        }}
      />

      <KeyboardAwareScrollView style={ui.screen} keepEndVisibleWhileTyping>
        <DetailContentContainer constrained={useWide}>
          <View style={styles.overviewHeader}>
            <ProjectOverviewIcon icon={null} type={projectType} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Project name"
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="next"
              style={styles.titleInput}
            />
            {useWide ? (
              <TextInput
                value={summary}
                onChangeText={setSummary}
                placeholder="Add a short summary…"
                placeholderTextColor="rgba(237, 237, 237, 0.35)"
                style={styles.summaryInput}
              />
            ) : null}
          </View>

          {useWide ? (
            <>
              <ProjectOverviewMetaRows
                properties={metaProperties}
                areas={metaAreas}
                onPressField={(key) => setPicker(key as PickerKind)}
              />
              {propertySheets}
            </>
          ) : (
            <DetailPropertiesInlineShell
              modalTitle="Project properties"
              chips={propertyChips}
              overlay={propertySheets}
            >
              <DetailPropertyEditorRows
                rows={allPropertyRows}
                onPressRow={(key) => {
                  if (key === "progress") return;
                  setPicker(key as PickerKind);
                }}
              />
            </DetailPropertiesInlineShell>
          )}

          <Text style={ui.sectionHeader}>Description</Text>
          <View
            style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}
          >
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description…"
              placeholderTextColor={colors.muted}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={styles.descriptionInput}
            />
          </View>

          {error ? (
            <Text
              style={[ui.error, { paddingHorizontal: 16, paddingBottom: 16 }]}
            >
              {error}
            </Text>
          ) : null}
        </DetailContentContainer>
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  overviewHeader: {
    width: "100%",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 0,
  },
  titleInput: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.02 * 22,
    lineHeight: 28,
    paddingVertical: 0,
  },
  summaryInput: {
    color: "rgba(237, 237, 237, 0.65)",
    fontSize: 15,
    lineHeight: 21,
    paddingVertical: 0,
  },
  descriptionInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 160,
    paddingVertical: 4,
  },
});
