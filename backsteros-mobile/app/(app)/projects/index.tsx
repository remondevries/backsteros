import type { Project, Task } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { ListSearchField } from "../../../components/list-search-field";
import { ChevronRightIcon } from "../../../components/chevron-right-icon";
import { ProjectIcon } from "../../../components/project-icon";
import { ProjectProgressRing } from "../../../components/project-progress-ring";
import { ProjectsHeader } from "../../../components/projects-header";
import { projectDetailHref } from "../../../lib/detail-href";
import { getMobileEnvironment } from "../../../lib/env";
import { matchesListSearch } from "../../../lib/list-search";
import {
  aggregateTaskProgressByProjectId,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../../../lib/project-progress-ring";
import { useMobilePowerSync } from "../../../lib/powersync-context";
import {
  filterProjectsByArea,
  PROJECT_AREA_FILTER_ALL,
  type ProjectArea,
  type ProjectAreaFilter,
} from "../../../lib/project-areas";
import {
  groupProjectsByStatus,
  type ProjectStatus,
} from "../../../lib/project-status";
import {
  groupProjectsByType,
  projectTypeCollapseKey,
} from "../../../lib/project-type";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useLocalQuery } from "../../../lib/use-local-query";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";

type ProjectRow = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  area: ProjectArea | null;
  sort_order: number | null;
};

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type ProjectListRow =
  | {
      kind: "type-header";
      id: string;
      label: string;
      collapseKey: string;
      collapsed: boolean;
    }
  | { kind: "project"; id: string; project: ProjectRow };

type Section = {
  title: string;
  status: ProjectStatus;
  data: ProjectListRow[];
};

const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

function asProjectArea(value: string | null | undefined): ProjectArea | null {
  if (value === "personal" || value === "business" || value === "clients") {
    return value;
  }
  return null;
}

function buildProjectSections(
  projects: readonly ProjectRow[],
  collapsedTypes: ReadonlySet<string>,
): Section[] {
  return groupProjectsByStatus(projects).map((group) => ({
    title: group.label,
    status: group.status,
    data: groupProjectsByType(group.projects).flatMap((typeGroup) => {
      const rows: ProjectListRow[] = [];
      if (typeGroup.showHeader) {
        const collapseKey = projectTypeCollapseKey(
          group.status,
          typeGroup.type,
        );
        const collapsed = collapsedTypes.has(collapseKey);
        rows.push({
          kind: "type-header",
          id: `type:${collapseKey}`,
          label: typeGroup.label,
          collapseKey,
          collapsed,
        });
        if (collapsed) return rows;
      }
      for (const project of typeGroup.projects) {
        rows.push({ kind: "project", id: project.id, project });
      }
      return rows;
    }),
  }));
}

const PROJECTS_SQL = `SELECT id, key, name, status, type, area, sort_order FROM projects
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

const TASK_PROGRESS_SQL = `SELECT project_id, status FROM tasks
 WHERE deleted_at IS NULL
   AND project_id IS NOT NULL`;

export default function ProjectsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const [area, setArea] = useState<ProjectAreaFilter>(PROJECT_AREA_FILTER_ALL);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(
    () => new Set(),
  );
  const search = usePullToRevealSearch();

  const client = useMobileApiClient();

  const { data: syncedProjects, isLoading: syncLoading } =
    useLocalQuery<ProjectRow>(PROJECTS_SQL);
  const { data: syncedTaskRows } = useLocalQuery<TaskProgressRow>(
    TASK_PROGRESS_SQL,
  );

  const [restRows, setRestRows] = useState<ProjectRow[]>([]);
  const [restProgress, setRestProgress] = useState<
    Record<string, ProjectTaskProgress>
  >({});
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const useRest = !powerSync.ready;

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => <ProjectsHeader area={area} onAreaChange={setArea} />,
    });
  }, [area, navigation]);

  const reloadRest = useCallback(async () => {
    if (powerSync.ready) return;
    setRestLoading(true);
    setRestError(null);
    try {
      const [projectsBody, tasksBody] = await Promise.all([
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
        client
          .requestJson<{ tasks: Task[] }>("/api/v1/tasks")
          .catch(() => ({ tasks: [] as Task[] })),
      ]);
      setRestRows(
        (projectsBody.projects ?? []).map((project) => ({
          id: project.id,
          key: project.key,
          name: project.name,
          status: project.status,
          type: project.type ?? "general",
          area: asProjectArea(project.area),
          sort_order: project.sortOrder ?? 0,
        })),
      );
      setRestProgress(
        aggregateTaskProgressByProjectId(
          (tasksBody.tasks ?? []).map((task) => ({
            project_id: task.projectId,
            status: task.status,
          })),
        ),
      );
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
      setRestRows([]);
      setRestProgress({});
    } finally {
      setRestLoading(false);
    }
  }, [apiUrl, client, powerSync.ready]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const localRows = useMemo(
    () =>
      (syncedProjects ?? []).map((row) => ({
        ...row,
        area: asProjectArea(row.area),
        type: row.type ?? "general",
        sort_order: row.sort_order ?? 0,
      })),
    [syncedProjects],
  );
  // Keep REST until local rows arrive — avoid empty flash when sync becomes ready.
  const sourceRows = useMemo(() => {
    if (localRows.length > 0) return localRows;
    if (!powerSync.ready || syncLoading) return restRows;
    return localRows;
  }, [localRows, powerSync.ready, restRows, syncLoading]);
  const rows = useMemo(
    () =>
      filterProjectsByArea(sourceRows, area).filter((project) =>
        matchesListSearch(search.query, project.name, project.key),
      ),
    [area, search.query, sourceRows],
  );

  const sections = useMemo(
    () => buildProjectSections(rows, collapsedTypes),
    [collapsedTypes, rows],
  );

  const toggleTypeGroup = useCallback((collapseKey: string) => {
    setCollapsedTypes((current) => {
      const next = new Set(current);
      if (next.has(collapseKey)) next.delete(collapseKey);
      else next.add(collapseKey);
      return next;
    });
  }, []);
  const localProgress = useMemo(
    () => aggregateTaskProgressByProjectId(syncedTaskRows ?? []),
    [syncedTaskRows],
  );
  const progressByProjectId = useMemo(() => {
    if (Object.keys(localProgress).length > 0) return localProgress;
    if (!powerSync.ready || syncLoading) return restProgress;
    return localProgress;
  }, [localProgress, powerSync.ready, restProgress, syncLoading]);

  const loading =
    sourceRows.length === 0 && (useRest ? restLoading : syncLoading);
  const error = useRest && sourceRows.length === 0 ? restError : null;

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={ui.screen}>
      {search.visible ? (
        <ListSearchField
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onBlur={search.closeIfEmpty}
          autoFocus
          placeholder="Search projects"
        />
      ) : null}
      <SectionList
        style={ui.screen}
        sections={sections as SectionListData<ProjectListRow, Section>[]}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onScroll={search.onScroll}
        onScrollEndDrag={search.onScrollEndDrag}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={useRest ? restLoading : false}
            onRefresh={() => {
              search.open();
              if (useRest) void reloadRest();
              else void powerSync.retry();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        ListEmptyComponent={
          <Text style={ui.empty}>
            {search.query.trim()
              ? "No matching projects."
              : "No projects in this area."}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={ui.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if (item.kind === "type-header") {
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !item.collapsed }}
                accessibilityLabel={`${item.label}, ${item.collapsed ? "collapsed" : "expanded"}`}
                onPress={() => toggleTypeGroup(item.collapseKey)}
                style={({ pressed }) => [
                  ui.typeSubheaderRow,
                  pressed ? { opacity: 0.7 } : null,
                ]}
              >
                <View
                  style={{
                    transform: [{ rotate: item.collapsed ? "0deg" : "90deg" }],
                  }}
                >
                  <ChevronRightIcon
                    size={12}
                    color="rgba(255, 255, 255, 0.38)"
                  />
                </View>
                <Text style={ui.typeSubheaderLabel}>{item.label}</Text>
              </Pressable>
            );
          }

          const project = item.project;
          const title = project.name ?? "Untitled";
          const progress = progressByProjectId[project.id] ?? EMPTY_PROGRESS;
          const percentLabel = formatProjectTaskProgressPercent(progress);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${percentLabel} complete`}
              onPress={() => router.push(projectDetailHref(project.id))}
              style={({ pressed }) => [
                ui.row,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              <View style={ui.rowIcon}>
                <ProjectIcon size={18} color={colors.foreground} />
              </View>
              <View style={ui.rowBody}>
                <View style={[ui.rowTitleLine, { alignItems: "center" }]}>
                  <Text
                    style={ui.rowTitle}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {title}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Text style={ui.rowId}>{percentLabel}</Text>
                    <ProjectProgressRing progress={progress} size={14} />
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
