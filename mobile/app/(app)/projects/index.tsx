import type { Document, Project, Task } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  ProjectOverviewListHeader,
  ProjectOverviewListRow,
} from "../../../components/project-overview-list-row";
import { ProjectProgressRing } from "../../../components/project-progress-ring";
import { ProjectStatusIcon } from "../../../components/project-status-icon";
import { ProjectsHeader } from "../../../components/projects-header";
import { StatusGroupHeader } from "../../../components/status-group-header";
import { projectDetailHref } from "../../../lib/detail-href";
import { isPadDevice } from "../../../lib/device";
import { getMobileEnvironment } from "../../../lib/env";
import { findSectionListLocation } from "../../../lib/list-keyboard-nav";
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
  PROJECT_AREA_FILTERS,
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
import { getProjectStatusHeaderGradient } from "../../../lib/status-header-gradient";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useListJkNavigation } from "../../../lib/use-list-jk-navigation";
import { useLocalQuery } from "../../../lib/use-local-query";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { useRestFallbackGate } from "../../../lib/use-rest-fallback-gate";
import { useSectionTabShortcuts } from "../../../lib/use-section-tab-shortcuts";

type ProjectRow = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  icon: string | null;
  priority: number | null;
  start_date: string | null;
  due_date: string | null;
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
  collapsedStatuses: ReadonlySet<string>,
  collapsedTypes: ReadonlySet<string>,
): Section[] {
  return groupProjectsByStatus(projects).map((group) => {
    const statusCollapsed = collapsedStatuses.has(group.status);
    return {
      title: group.label,
      status: group.status,
      data: statusCollapsed
        ? []
        : groupProjectsByType(group.projects).flatMap((typeGroup) => {
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
    };
  });
}

const PROJECTS_SQL = `SELECT id, key, name, status, type, icon, priority, start_date, due_date, area, sort_order FROM projects
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
  const client = useMobileApiClient();
  const isPad = isPadDevice();
  const [area, setArea] = useState<ProjectAreaFilter>(PROJECT_AREA_FILTER_ALL);
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(
    () => new Set(),
  );
  const search = usePullToRevealSearch();

  const onAreaTabIndex = useCallback((index: number) => {
    const next = PROJECT_AREA_FILTERS[index];
    if (next) setArea(next);
  }, []);

  useSectionTabShortcuts({
    sectionCount: PROJECT_AREA_FILTERS.length,
    onSelectIndex: onAreaTabIndex,
  });

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

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => <ProjectsHeader area={area} onAreaChange={setArea} />,
    });
  }, [area, navigation]);

  const localRows = useMemo(
    () =>
      (syncedProjects ?? []).map((row) => ({
        ...row,
        area: asProjectArea(row.area),
        type: row.type ?? "general",
        icon: row.icon ?? null,
        priority: row.priority ?? 0,
        start_date: row.start_date ?? null,
        due_date: row.due_date ?? null,
        sort_order: row.sort_order ?? 0,
      })),
    [syncedProjects],
  );

  const useRest = useRestFallbackGate(localRows.length);

  const reloadRest = useCallback(async () => {
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
          icon: project.icon ?? null,
          priority: project.priority ?? 0,
          start_date: project.startDate ?? null,
          due_date: project.dueDate ?? null,
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
  }, [apiUrl, client]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const sourceRows = useMemo(() => {
    if (localRows.length > 0) return localRows;
    if (useRest) return restRows;
    return localRows;
  }, [localRows, restRows, useRest]);

  const rows = useMemo(
    () =>
      filterProjectsByArea(sourceRows, area).filter((project) =>
        matchesListSearch(search.query, project.name, project.key),
      ),
    [area, search.query, sourceRows],
  );

  const sections = useMemo(
    () => buildProjectSections(rows, collapsedStatuses, collapsedTypes),
    [collapsedStatuses, collapsedTypes, rows],
  );

  const navigableIds = useMemo(
    () =>
      sections.flatMap((section) =>
        section.data
          .filter((row): row is Extract<ProjectListRow, { kind: "project" }> =>
            row.kind === "project",
          )
          .map((row) => row.project.id),
      ),
    [sections],
  );

  const listRef = useRef<SectionList<ProjectListRow, Section>>(null);

  const openProject = useCallback(
    (id: string) => {
      router.push(projectDetailHref(id));
    },
    [router],
  );

  const { highlightedId } = useListJkNavigation({
    itemIds: navigableIds,
    enabled: true,
    onActivate: openProject,
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      // Section list rows use ProjectListRow ids (type-header vs project).
      const location = findSectionListLocation(
        sections.map((section) => ({
          data: section.data
            .filter(
              (row): row is Extract<ProjectListRow, { kind: "project" }> =>
                row.kind === "project",
            )
            .map((row) => ({ id: row.project.id })),
        })),
        id,
      );
      if (!location) return;
      // Remap to real section item index including type headers.
      const section = sections[location.sectionIndex];
      if (!section) return;
      const itemIndex = section.data.findIndex(
        (row) => row.kind === "project" && row.project.id === id,
      );
      if (itemIndex < 0) return;
      try {
        listRef.current.scrollToLocation({
          sectionIndex: location.sectionIndex,
          itemIndex,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  const toggleStatusGroup = useCallback((status: ProjectStatus) => {
    setCollapsedStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

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
    if (useRest) return restProgress;
    return localProgress;
  }, [localProgress, restProgress, useRest]);

  const loading =
    sourceRows.length === 0 &&
    (useRest
      ? restLoading
      : powerSync.status === "connecting" ||
        powerSync.status === "idle" ||
        syncLoading);
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
        ref={listRef}
        style={ui.screen}
        sections={sections as SectionListData<ProjectListRow, Section>[]}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={isPad}
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
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        ListHeaderComponent={isPad ? <ProjectOverviewListHeader /> : null}
        ListEmptyComponent={
          <Text style={ui.empty}>
            {search.query.trim()
              ? "No matching projects."
              : "No projects in this area."}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <StatusGroupHeader
            title={section.title}
            icon={<ProjectStatusIcon status={section.status} size={14} />}
            gradient={getProjectStatusHeaderGradient(section.status)}
            collapsed={collapsedStatuses.has(section.status)}
            onToggle={() => toggleStatusGroup(section.status)}
          />
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
          const progress = progressByProjectId[project.id] ?? EMPTY_PROGRESS;
          const highlighted = highlightedId === project.id;

          if (isPad) {
            return (
              <ProjectOverviewListRow
                project={project}
                progress={progress}
                highlighted={highlighted}
                onPress={() => router.push(projectDetailHref(project.id))}
              />
            );
          }

          const title = project.name ?? "Untitled";
          const percentLabel = formatProjectTaskProgressPercent(progress);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${percentLabel} complete`}
              onPress={() => router.push(projectDetailHref(project.id))}
              style={({ pressed }) => [
                ui.row,
                highlighted ? ui.keyboardNavHighlight : null,
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
