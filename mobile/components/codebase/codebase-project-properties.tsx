import type { Project } from "@backsteros/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  PROJECT_AREA_LABELS,
  PROJECT_AREAS,
  type ProjectArea,
} from "../../lib/project-areas";
import {
  aggregateTaskProgressByProjectId,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../../lib/project-progress-ring";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../../lib/project-status";
import {
  getProjectTypeLabel,
  migrateLegacyProjectType,
  PROJECT_TYPE_ORDER,
  type ProjectType,
} from "../../lib/project-type";
import {
  isValidProjectKey,
  normalizeProjectKey,
} from "../../lib/project-key";
import { useMobilePowerSync } from "../../lib/powersync-context";
import { formatTaskDueMetaLabel } from "../../lib/task-due-date";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_LABELS,
} from "../../lib/task-priority";
import { colors } from "../../lib/theme";
import { useLocalQuery } from "../../lib/use-local-query";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { TextInput } from "../app-text-input";
import { ChevronRightIcon } from "../chevron-right-icon";
import { DueDatePropertySheet } from "../due-date-property-sheet";
import { JournalMarkdownBody } from "../journal-markdown-body";
import { OrganizationIcon } from "../organization-icon";
import { ProjectIcon } from "../project-icon";
import { ProjectProgressRing } from "../project-progress-ring";
import { ProjectStatusIcon } from "../project-status-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "../property-option-sheet";
import { PropertyTextSheet } from "../property-text-sheet";
import { TaskDueDateIcon } from "../task-due-date-icon";
import { TaskPriorityIcon } from "../task-priority-icon";
import { TerminalConsoleIcon } from "../terminal-console-icon";

type ProjectRow = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  priority: number | null;
  type: string | null;
  area: string | null;
  area_id: string | null;
  start_date: string | null;
  due_date: string | null;
  organization_id: string | null;
  organization_name: string | null;
  github_repository: string | null;
  description: string | null;
};

type NamedOptionRow = { id: string; name: string | null };

type AreaRow = {
  id: string;
  name: string | null;
  parent: string | null;
  sort_order: number | null;
};

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type GithubRepoRow = {
  id: number;
  fullName: string;
};

const DETAIL_SQL = `SELECT
         p.id,
         p.key,
         p.name,
         p.status,
         p.priority,
         p.type,
         p.area,
         p.area_id,
         p.start_date,
         p.due_date,
         p.organization_id,
         o.name AS organization_name,
         p.github_repository,
         p.description
       FROM projects p
       LEFT JOIN organizations o ON o.id = p.organization_id
       WHERE p.deleted_at IS NULL AND p.id = ?
       LIMIT 1`;

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const AREAS_SQL = `SELECT id, name, parent, sort_order FROM areas
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

const TASK_PROGRESS_SQL = `SELECT project_id, status FROM tasks
       WHERE deleted_at IS NULL
         AND project_id = ?`;

const NONE_REPO = "__none__";
const NONE_ORG = "__none_org__";
const NONE_AREA = "__none_area__";
const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

type Props = {
  projectId: string;
  onNameChange?: (name: string) => void;
};

type PickerKind =
  | "key"
  | "status"
  | "priority"
  | "type"
  | "organization"
  | "github"
  | "start"
  | "due"
  | "area"
  | "areaId"
  | null;

function asProjectArea(value: string | null | undefined): ProjectArea | null {
  if (value === "personal" || value === "business" || value === "clients") {
    return value;
  }
  return null;
}

/**
 * Desktop-parity left pane for codebase Tasks tab —
 * description fills the column; dense property chips stick to the bottom
 * (`ProjectPanelDetailView` / `.project-panel-tab-body`).
 */
export function CodebaseProjectProperties({
  projectId,
  onNameChange,
}: Props) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const { data: syncedRows, isLoading } = useLocalQuery<ProjectRow>(
    DETAIL_SQL,
    [projectId],
  );
  const { data: syncedOrganizations } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);
  const { data: syncedAreas } = useLocalQuery<AreaRow>(AREAS_SQL);
  const { data: syncedTaskRows } = useLocalQuery<TaskProgressRow>(
    TASK_PROGRESS_SQL,
    [projectId],
  );

  const project = syncedRows?.[0] ?? null;
  const [status, setStatus] = useState<ProjectStatus>("backlog");
  const [priority, setPriority] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType>("codebase");
  const [projectKey, setProjectKey] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [githubRepository, setGithubRepository] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [area, setArea] = useState<ProjectArea | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [propertiesExpanded, setPropertiesExpanded] = useState(false);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GithubRepoRow[]>([]);

  useEffect(() => {
    if (!project) return;
    setStatus(migrateLegacyProjectStatus(project.status));
    setPriority(project.priority ?? 0);
    setProjectType(migrateLegacyProjectType(project.type));
    setProjectKey(project.key?.trim() ?? "");
    setOrganizationId(project.organization_id);
    setGithubRepository(project.github_repository);
    setStartDate(project.start_date);
    setDueDate(project.due_date);
    setArea(asProjectArea(project.area));
    setAreaId(project.area_id);
    if (!editingDescription) {
      setDraftDescription(project.description ?? "");
    }
    onNameChange?.(project.name?.trim() || "Untitled");
  }, [editingDescription, onNameChange, project]);

  useEffect(() => {
    let cancelled = false;
    void client
      .requestJson<{ repositories: { id: number; fullName: string }[] }>(
        "/api/v1/github/repositories",
      )
      .then((body) => {
        if (!cancelled) {
          setRepositories(
            (body.repositories ?? []).map((repo) => ({
              id: repo.id,
              fullName: repo.fullName,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setRepositories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const progress = useMemo(() => {
    const map = aggregateTaskProgressByProjectId(syncedTaskRows ?? []);
    return map[projectId] ?? EMPTY_PROGRESS;
  }, [projectId, syncedTaskRows]);

  async function patchProperty(
    values: Record<string, unknown>,
  ): Promise<boolean> {
    setError(null);
    const sqliteValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key === "startDate") sqliteValues.start_date = value;
      else if (key === "dueDate") sqliteValues.due_date = value;
      else if (key === "organizationId") sqliteValues.organization_id = value;
      else if (key === "areaId") sqliteValues.area_id = value;
      else if (key === "githubRepository")
        sqliteValues.github_repository = value;
      else sqliteValues[key] = value;
    }
    try {
      if (powerSync.ready) {
        await powerSync.patchProject(projectId, sqliteValues);
        void client
          .requestJson<Project>(
            `/api/v1/projects/${encodeURIComponent(projectId)}`,
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
          `/api/v1/projects/${encodeURIComponent(projectId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(values),
          },
        );
      }
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update property.",
      );
      return false;
    }
  }

  async function saveDescription() {
    const next = draftDescription.trim() ? draftDescription : "";
    const current = project?.description ?? "";
    setEditingDescription(false);
    if (next === (current ?? "")) return;
    const ok = await patchProperty({
      description: next.trim() ? next : null,
    });
    if (!ok) setDraftDescription(current ?? "");
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
        icon:
          value === "codebase" ? (
            <TerminalConsoleIcon size={14} />
          ) : (
            <ProjectIcon size={14} />
          ),
      })),
    [],
  );

  const orgOptions = useMemo<PropertyOption<string>[]>(
    () => [
      { value: NONE_ORG, label: "No organization", icon: <OrganizationIcon size={14} /> },
      ...(syncedOrganizations ?? []).map((org) => ({
        value: org.id,
        label: org.name?.trim() || "Untitled",
        icon: <OrganizationIcon size={14} />,
      })),
    ],
    [syncedOrganizations],
  );

  const repoOptions = useMemo<PropertyOption<string>[]>(
    () => [
      { value: NONE_REPO, label: "No repository" },
      ...repositories.map((repo) => ({
        value: repo.fullName,
        label: repo.fullName,
      })),
    ],
    [repositories],
  );

  const areaOptions = useMemo<PropertyOption<string>[]>(
    () => [
      { value: NONE_AREA, label: "No area" },
      ...PROJECT_AREAS.map((value) => ({
        value,
        label: PROJECT_AREA_LABELS[value],
      })),
    ],
    [],
  );

  const subAreas = useMemo(
    () =>
      (syncedAreas ?? []).filter(
        (entry) => area != null && entry.parent === area,
      ),
    [area, syncedAreas],
  );

  const subAreaOptions = useMemo<PropertyOption<string>[]>(
    () => [
      { value: NONE_AREA, label: "No sub-area" },
      ...subAreas.map((entry) => ({
        value: entry.id,
        label: entry.name?.trim() || "Untitled",
      })),
    ],
    [subAreas],
  );

  if (isLoading && !project) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Project not found.</Text>
      </View>
    );
  }

  const orgName =
    (syncedOrganizations ?? []).find((org) => org.id === organizationId)
      ?.name ??
    project.organization_name ??
    null;
  const selectedSubArea = subAreas.find((entry) => entry.id === areaId);
  const percentLabel = formatProjectTaskProgressPercent(progress);
  const startLabel = formatTaskDueMetaLabel(startDate) ?? "No start date";
  const dueLabel = formatTaskDueMetaLabel(dueDate) ?? "No due date";

  return (
    <View style={styles.root} accessibilityLabel="Project details">
      <View style={styles.descriptionColumn}>
        {editingDescription ? (
          <TextInput
            value={draftDescription}
            onChangeText={setDraftDescription}
            placeholder="Add a project description…"
            placeholderTextColor={colors.muted}
            multiline
            autoFocus
            textAlignVertical="top"
            onBlur={() => {
              void saveDescription();
            }}
            style={styles.descriptionInput}
          />
        ) : (
          <ScrollView
            style={styles.descriptionScroll}
            contentContainerStyle={styles.descriptionScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit project description"
              onPress={() => {
                setDraftDescription(project.description ?? "");
                setEditingDescription(true);
              }}
              style={styles.descriptionPressable}
            >
              {draftDescription.trim() ? (
                <JournalMarkdownBody body={draftDescription} />
              ) : (
                <Text style={styles.descriptionEmpty}>
                  Add a project description…
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.properties}>
        <View style={styles.primaryRow}>
          <View style={styles.fields}>
            <PropertyChip
              label={getProjectStatusLabel(status)}
              icon={<ProjectStatusIcon status={status} size={14} />}
              onPress={() => setPicker("status")}
            />
            <PropertyChip
              label={orgName?.trim() || "No organization"}
              icon={<OrganizationIcon size={14} />}
              muted={!orgName}
              onPress={() => setPicker("organization")}
            />
            <View style={styles.progressChip}>
              <Text style={styles.progressLabel}>{percentLabel}</Text>
              <ProjectProgressRing progress={progress} size={16} />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: propertiesExpanded }}
            accessibilityLabel={
              propertiesExpanded
                ? "Hide more properties"
                : "Show more properties"
            }
            hitSlop={8}
            onPress={() => setPropertiesExpanded((current) => !current)}
            style={({ pressed }) => [
              styles.moreButton,
              pressed ? styles.chipPressed : null,
            ]}
          >
            <View
              style={{
                transform: [
                  { rotate: propertiesExpanded ? "90deg" : "180deg" },
                ],
              }}
            >
              <ChevronRightIcon size={14} color={colors.muted} />
            </View>
          </Pressable>
        </View>

        {propertiesExpanded ? (
          <View style={styles.fields}>
            <PropertyChip
              label={projectKey || "Key"}
              onPress={() => setPicker("key")}
            />
            <PropertyChip
              label={getTaskPriorityLabel(priority)}
              icon={<TaskPriorityIcon priority={priority} size={14} />}
              onPress={() => setPicker("priority")}
            />
            <PropertyChip
              label={getProjectTypeLabel(projectType)}
              icon={
                projectType === "codebase" ? (
                  <TerminalConsoleIcon size={14} />
                ) : (
                  <ProjectIcon size={14} />
                )
              }
              onPress={() => setPicker("type")}
            />
            <View style={styles.datesRow}>
              <PropertyChip
                label={startLabel}
                icon={<TaskDueDateIcon active={Boolean(startDate)} size={14} />}
                muted={!startDate}
                onPress={() => setPicker("start")}
              />
              <Text style={styles.datesSep}>›</Text>
              <PropertyChip
                label={dueLabel}
                icon={<TaskDueDateIcon active={Boolean(dueDate)} size={14} />}
                muted={!dueDate}
                onPress={() => setPicker("due")}
              />
            </View>
            <PropertyChip
              label={githubRepository ?? "No repository"}
              muted={!githubRepository}
              onPress={() => setPicker("github")}
            />
          </View>
        ) : null}

        <View style={styles.areasRow}>
          <Text style={styles.areasLabel}>Areas</Text>
          <View style={styles.areaFields}>
            <PropertyChip
              label={area ? PROJECT_AREA_LABELS[area] : "No area"}
              muted={!area}
              onPress={() => setPicker("area")}
            />
            {subAreas.length > 0 ? (
              <>
                <Text style={styles.datesSep}>/</Text>
                <PropertyChip
                  label={selectedSubArea?.name?.trim() || "No sub-area"}
                  muted={!selectedSubArea}
                  onPress={() => setPicker("areaId")}
                />
              </>
            ) : null}
          </View>
        </View>
      </View>

      <PropertyOptionSheet
        visible={picker === "status"}
        title="Status"
        options={statusOptions}
        selected={status}
        onSelect={(value) => {
          if (!value) return;
          setStatus(value);
          void patchProperty({ status: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "priority"}
        title="Priority"
        options={priorityOptions}
        selected={priority}
        onSelect={(value) => {
          if (value == null) return;
          setPriority(value);
          void patchProperty({ priority: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "type"}
        title="Type"
        options={typeOptions}
        selected={projectType}
        onSelect={(value) => {
          if (!value) return;
          setProjectType(value);
          void patchProperty({ type: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "organization"}
        title="Organization"
        options={orgOptions}
        selected={organizationId ?? NONE_ORG}
        onSelect={(value) => {
          const next = value === NONE_ORG ? null : value;
          setOrganizationId(next);
          void patchProperty({ organizationId: next });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "github"}
        title="GitHub repository"
        options={repoOptions}
        selected={githubRepository ?? NONE_REPO}
        onSelect={(value) => {
          const next = value === NONE_REPO ? null : value;
          setGithubRepository(next);
          void patchProperty({ githubRepository: next });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "area"}
        title="Area"
        options={areaOptions}
        selected={area ?? NONE_AREA}
        onSelect={(value) => {
          const next =
            value === NONE_AREA ? null : asProjectArea(value);
          setArea(next);
          setAreaId(null);
          void patchProperty({ area: next, areaId: null });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "areaId"}
        title="Sub-area"
        options={subAreaOptions}
        selected={areaId ?? NONE_AREA}
        onSelect={(value) => {
          const next = value === NONE_AREA ? null : value;
          setAreaId(next);
          void patchProperty({ areaId: next });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyTextSheet
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
      <DueDatePropertySheet
        visible={picker === "start"}
        title="Start date"
        selected={startDate}
        emptyLabel="No start date"
        onSelect={(value) => {
          setStartDate(value);
          void patchProperty({ startDate: value });
        }}
        onClose={() => setPicker(null)}
      />
      <DueDatePropertySheet
        visible={picker === "due"}
        title="Due date"
        selected={dueDate}
        onSelect={(value) => {
          setDueDate(value);
          void patchProperty({ dueDate: value });
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function PropertyChip({
  label,
  icon,
  muted,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        pressed ? styles.chipPressed : null,
      ]}
    >
      {icon ? <View style={styles.chipIcon}>{icon}</View> : null}
      <Text
        style={[styles.chipLabel, muted ? styles.chipLabelMuted : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
  descriptionColumn: {
    flex: 1,
    minHeight: 120,
  },
  descriptionPressable: {
    flexGrow: 1,
    minHeight: 120,
  },
  descriptionScroll: {
    flex: 1,
  },
  descriptionScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    flexGrow: 1,
  },
  descriptionInput: {
    flex: 1,
    minHeight: 120,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionEmpty: {
    color: "rgba(237, 237, 237, 0.35)",
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  properties: {
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fields: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  moreButton: {
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.faint,
  },
  chipPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  chipIcon: {
    width: 14,
    alignItems: "center",
  },
  chipLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
    flexShrink: 1,
  },
  chipLabelMuted: {
    color: "rgba(237, 237, 237, 0.5)",
  },
  progressChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 4,
  },
  progressLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  datesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  datesSep: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 2,
  },
  areasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
  },
  areasLabel: {
    flexShrink: 0,
    minWidth: 48,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 16,
  },
  areaFields: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
});
