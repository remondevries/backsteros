import type { Organization, Project, Task } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  ProjectOverviewListHeader,
  ProjectOverviewListRow,
} from "../../../components/project-overview-list-row";
import { ProjectProgressRing } from "../../../components/project-progress-ring";
import { ProjectStatusIcon } from "../../../components/project-status-icon";
import { ProjectTypeGroupHeader } from "../../../components/project-type-group-header";
import { SectionListHeader } from "../../../components/section-list-header";
import {
  StatusGroupHeader,
  statusGroupEmptySectionFooter,
} from "../../../components/status-group-header";
import { TerminalConsoleIcon } from "../../../components/terminal-console-icon";
import { projectDetailHref } from "../../../lib/detail-href";
import { isPadDevice } from "../../../lib/device";
import { getMobileEnvironment } from "../../../lib/env";
import {
  groupProjectsByOrganization,
  projectOrganizationCollapseKey,
  type OrganizationRef,
} from "../../../lib/group-projects-by-organization";
import { findSectionListLocation } from "../../../lib/list-keyboard-nav";
import { matchesListSearch } from "../../../lib/list-search";
import {
  aggregateTaskProgressByProjectId,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../../../lib/project-progress-ring";
import {
  groupProjectsByStatus,
  type ProjectStatus,
} from "../../../lib/project-status";
import { useMobilePowerSync } from "../../../lib/powersync-context";
import { getProjectStatusHeaderGradient } from "../../../lib/status-header-gradient";
import { migrateLegacyProjectType } from "../../../lib/project-type";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useListJkNavigation } from "../../../lib/use-list-jk-navigation";
import { useLocalQuery } from "../../../lib/use-local-query";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { resolveSyncedOrRestRows } from "../../../lib/resolve-synced-or-rest-rows";
import { useRestListHydration } from "../../../lib/use-rest-list-hydration";
import { useRestReloadFlags } from "../../../lib/use-rest-reload-flags";

type SyncedProjectRow = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  icon: string | null;
  priority: number | null;
  start_date: string | null;
  due_date: string | null;
  organization_id: string | null;
  sort_order: number | null;
};

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
  organizationId: string | null;
  sortOrder: number | null;
};

type SyncedOrganizationRow = {
  id: string;
  name: string | null;
  sort_order: number | null;
};

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type ListRow =
  | {
      kind: "org-header";
      id: string;
      label: string;
      collapseKey: string;
      collapsed: boolean;
    }
  | { kind: "project"; id: string; project: ProjectRow };

type Section = {
  title: string;
  status: ProjectStatus;
  data: ListRow[];
};

const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

const PROJECTS_SQL = `SELECT id, key, name, status, type, icon, priority, start_date, due_date, organization_id, sort_order FROM projects
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

const ORGANIZATIONS_SQL = `SELECT id, name, sort_order FROM organizations
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

const TASK_PROGRESS_SQL = `SELECT project_id, status FROM tasks
 WHERE deleted_at IS NULL
   AND project_id IS NOT NULL`;

function isCodebaseProject(project: { type: string | null }): boolean {
  return migrateLegacyProjectType(project.type) === "codebase";
}

function buildSections(
  projects: readonly ProjectRow[],
  organizations: readonly OrganizationRef[],
  collapsedStatuses: ReadonlySet<string>,
  collapsedOrgs: ReadonlySet<string>,
): Section[] {
  return groupProjectsByStatus(projects).map((group) => {
    const statusCollapsed = collapsedStatuses.has(group.status);
    return {
      title: group.label,
      status: group.status,
      data: statusCollapsed
        ? []
        : groupProjectsByOrganization(group.projects, organizations).flatMap(
            (bucket) => {
              const rows: ListRow[] = [];
              if (
                bucket.showHeader &&
                bucket.organizationId &&
                bucket.name
              ) {
                const collapseKey = projectOrganizationCollapseKey(
                  group.status,
                  bucket.organizationId,
                );
                const collapsed = collapsedOrgs.has(collapseKey);
                rows.push({
                  kind: "org-header",
                  id: `org:${collapseKey}`,
                  label: bucket.name,
                  collapseKey,
                  collapsed,
                });
                if (collapsed) return rows;
              }
              for (const project of bucket.projects) {
                rows.push({ kind: "project", id: project.id, project });
              }
              return rows;
            },
          ),
    };
  });
}

export default function DevelopmentScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const isPad = isPadDevice();
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(
    () => new Set(),
  );
  const {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  } = useRestReloadFlags();
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

  const { data: syncedProjects, isLoading: syncLoading } =
    useLocalQuery<SyncedProjectRow>(PROJECTS_SQL);
  const { data: syncedOrganizations } =
    useLocalQuery<SyncedOrganizationRow>(ORGANIZATIONS_SQL);
  const { data: syncedTaskRows } = useLocalQuery<TaskProgressRow>(
    TASK_PROGRESS_SQL,
  );

  const [restRows, setRestRows] = useState<ProjectRow[] | null>(null);
  const [restOrganizations, setRestOrganizations] = useState<
    OrganizationRef[] | null
  >(null);
  const [restProgress, setRestProgress] = useState<
    Record<string, ProjectTaskProgress>
  >({});
  const [restError, setRestError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <SectionListHeader
          title="Development"
          plusAccessibilityLabel="Create project"
          onPressPlus={() =>
            router.push({
              pathname: "/(app)/projects/new",
              params: { type: "codebase" },
            })
          }
        />
      ),
    });
  }, [navigation, router]);

  const localRows = useMemo(
    () =>
      (syncedProjects ?? [])
        .filter(isCodebaseProject)
        .map((row) => ({
          id: row.id,
          key: row.key,
          name: row.name,
          status: row.status,
          type: row.type ?? "codebase",
          icon: row.icon ?? null,
          priority: row.priority ?? 0,
          start_date: row.start_date ?? null,
          due_date: row.due_date ?? null,
          organizationId: row.organization_id ?? null,
          sortOrder: row.sort_order ?? 0,
        })),
    [syncedProjects],
  );

  const localOrganizations = useMemo<OrganizationRef[]>(
    () =>
      (syncedOrganizations ?? []).map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled",
        sortOrder: row.sort_order ?? 0,
      })),
    [syncedOrganizations],
  );

  const reloadRest = useCallback(async (opts?: { userPull?: boolean }) => {
    const userPull = beginReload(opts);
    setRestError(null);
    try {
      const [projectsBody, orgsBody, tasksBody] = await Promise.all([
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
        client
          .requestJson<{ organizations: Organization[] }>(
            "/api/v1/organizations",
          )
          .catch(() => ({ organizations: [] as Organization[] })),
        client
          .requestJson<{ tasks: Task[] }>("/api/v1/tasks")
          .catch(() => ({ tasks: [] as Task[] })),
      ]);
      setRestRows(
        (projectsBody.projects ?? [])
          .filter((project) =>
            isCodebaseProject({ type: project.type ?? null }),
          )
          .map((project) => ({
            id: project.id,
            key: project.key,
            name: project.name,
            status: project.status,
            type: project.type ?? "codebase",
            icon: project.icon ?? null,
            priority: project.priority ?? 0,
            start_date: project.startDate ?? null,
            due_date: project.dueDate ?? null,
            organizationId: project.organizationId ?? null,
            sortOrder: project.sortOrder ?? 0,
          })),
      );
      setRestOrganizations(
        (orgsBody.organizations ?? []).map((org) => ({
          id: org.id,
          name: org.name,
          sortOrder: org.sortOrder ?? 0,
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
      markHydrated();
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
    } finally {
      endReload(userPull);
    }
  }, [apiUrl, beginReload, client, endReload, markHydrated]);

  useRestListHydration(reloadRest);

  const sourceRows = resolveSyncedOrRestRows({
    localRows,
    restRows,
    connected: powerSync.connected,
  });

  const organizations = resolveSyncedOrRestRows({
    localRows: localOrganizations,
    restRows: restOrganizations,
    connected: powerSync.connected,
  });

  const rows = useMemo(
    () =>
      sourceRows.filter((project) =>
        matchesListSearch(search.query, project.name, project.key),
      ),
    [search.query, sourceRows],
  );

  const sections = useMemo(
    () =>
      buildSections(rows, organizations, collapsedStatuses, collapsedOrgs),
    [collapsedOrgs, collapsedStatuses, organizations, rows],
  );

  const navigableIds = useMemo(
    () =>
      sections.flatMap((section) =>
        section.data
          .filter((row): row is Extract<ListRow, { kind: "project" }> =>
            row.kind === "project",
          )
          .map((row) => row.id),
      ),
    [sections],
  );

  const listRef = useRef<SectionList<ListRow, Section>>(null);
  const openProject = useCallback(
    (id: string) => {
      router.push(projectDetailHref(id));
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds: navigableIds,
    onActivate: openProject,
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const location = findSectionListLocation(sections, id);
      if (!location) return;
      try {
        listRef.current.scrollToLocation({
          ...location,
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

  const toggleOrg = useCallback((collapseKey: string) => {
    setCollapsedOrgs((current) => {
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
    if (restRows != null) return restProgress;
    return localProgress;
  }, [localProgress, restProgress, restRows]);

  const hasShownDataRef = useRef(false);
  if (sourceRows.length > 0) hasShownDataRef.current = true;

  // Full-screen spinner only on first load — keep the list mounted so
  // remounts / brief empty sync windows cannot jump layout or re-arm search.
  const loading =
    !hasShownDataRef.current &&
    sourceRows.length === 0 &&
    (restLoading ||
      (restRows == null &&
        (powerSync.status === "connecting" ||
          powerSync.status === "idle" ||
          syncLoading)));
  const error =
    sourceRows.length === 0 && restError && !powerSync.connected
      ? restError
      : null;

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
          placeholder="Search development"
        />
      ) : null}
      <SectionList
        ref={listRef}
        style={ui.screen}
        sections={sections as SectionListData<ListRow, Section>[]}
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
            refreshing={pullRefreshing}
            onRefresh={() => {
              void reloadRest({ userPull: true });
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{
          paddingTop: isPad ? 0 : 8,
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        ListHeaderComponent={isPad ? <ProjectOverviewListHeader /> : null}
        ListEmptyComponent={
          <Text style={ui.empty}>
            {search.query.trim()
              ? "No matching projects."
              : "No codebase projects yet."}
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
        renderSectionFooter={({ section }) =>
          statusGroupEmptySectionFooter(sections, section)
        }
        renderItem={({ item }) => {
          if (item.kind === "org-header") {
            return (
              <ProjectTypeGroupHeader
                title={item.label}
                collapsed={item.collapsed}
                onToggle={() => toggleOrg(item.collapseKey)}
                spaced
              />
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
                <TerminalConsoleIcon size={18} color={colors.foreground} />
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
