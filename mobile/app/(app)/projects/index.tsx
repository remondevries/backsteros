import type { FlashListRef } from "@shopify/flash-list";
import { useNavigation } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";

import { AreasHeader } from "../../../components/areas-header";
import { ListSearchField } from "../../../components/list-search-field";
import { BacksterGroupedList } from "../../../components/lists/index";
import { ProjectOcticon } from "../../../components/project-octicon";
import {
  ProjectOverviewListHeader,
  ProjectOverviewListRow,
} from "../../../components/project-overview-list-row";
import { ProjectProgressRing } from "../../../components/project-progress-ring";
import { ProjectStatusIcon } from "../../../components/project-status-icon";
import { ProjectTypeGroupHeader } from "../../../components/project-type-group-header";
import { PropertyTextSheet } from "../../../components/property-text-sheet";
import {
  StatusGroupHeader,
  statusGroupEmptySectionFooter,
} from "../../../components/status-group-header";
import { projectDetailHref } from "../../../lib/detail-href";
import { isPadDevice } from "../../../lib/device";
import {
  groupProjectsByNestedArea,
  projectNestedAreaCollapseKey,
  type NestedAreaRef,
} from "../../../lib/group-projects-by-area";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
} from "../../../lib/lists/flatten-grouped-sections";
import { matchesListSearch } from "../../../lib/list-search";
import {
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_FILTERS,
  PROJECT_AREA_LABELS,
  type ProjectArea,
} from "../../../lib/project-areas";
import {
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../../../lib/project-progress-ring";
import {
  groupProjectsByStatus,
  type ProjectStatus,
} from "../../../lib/project-status";
import { getProjectStatusHeaderGradient } from "../../../lib/status-header-gradient";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useListJkNavigation } from "../../../lib/use-list-jk-navigation";
import { useAreaActions } from "../../../lib/use-area-actions";
import {
  useProjectAreaListScreen,
  type ProjectListRow as ProjectRow,
} from "../../../lib/use-project-area-list-screen";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { useSectionTabShortcuts } from "../../../lib/use-section-tab-shortcuts";

type ListRow =
  | {
      kind: "nested-header";
      id: string;
      label: string;
      collapseKey: string;
      collapsed: boolean;
      areaId: string;
      parent: ProjectArea | null;
    }
  | { kind: "project"; id: string; project: ProjectRow };

type Section = {
  key: string;
  title: string;
  status: ProjectStatus;
  data: ListRow[];
};

const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

const PROJECTS_SQL = `SELECT id, key, name, status, type, icon, priority, start_date, due_date, area, area_id, sort_order FROM projects
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name ASC`;

function buildSections(
  projects: readonly ProjectRow[],
  nestedAreas: readonly NestedAreaRef[],
  collapsedStatuses: ReadonlySet<string>,
  collapsedNested: ReadonlySet<string>,
): Section[] {
  const nestedAreaById = new Map(nestedAreas.map((entry) => [entry.id, entry]));

  return groupProjectsByStatus(projects).map((group) => {
    const statusCollapsed = collapsedStatuses.has(group.status);
    return {
      key: group.status,
      title: group.label,
      status: group.status,
      data: statusCollapsed
        ? []
        : groupProjectsByNestedArea(group.projects, nestedAreas).flatMap(
            (bucket) => {
              const rows: ListRow[] = [];
              if (bucket.showHeader && bucket.areaId && bucket.name) {
                const collapseKey = projectNestedAreaCollapseKey(
                  group.status,
                  bucket.areaId,
                );
                const collapsed = collapsedNested.has(collapseKey);
                rows.push({
                  kind: "nested-header",
                  id: `nested:${collapseKey}`,
                  label: bucket.name,
                  collapseKey,
                  collapsed,
                  areaId: bucket.areaId,
                  parent: nestedAreaById.get(bucket.areaId)?.parent ?? null,
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

export default function ProjectsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const isPad = isPadDevice();
  const {
    area,
    setArea,
    sourceRows,
    rows: areaRows,
    nestedAreas,
    progressByProjectId,
    syncLoading,
    restLoading,
    pullRefreshing,
    restLoaded,
    error: restError,
    reloadRest,
    powerSyncConnected,
    powerSyncStatus,
  } = useProjectAreaListScreen({
    projectsSql: PROJECTS_SQL,
    projectTypeFilter: "all",
    includeNestedAreas: true,
  });
  const [renameArea, setRenameArea] = useState<{
    areaId: string;
    name: string;
  } | null>(null);

  const reloadAfterAreaWrite = useCallback(
    () => reloadRest({ userPull: false }),
    [reloadRest],
  );
  const { renameArea: saveAreaRename, deleteArea } =
    useAreaActions(reloadAfterAreaWrite);

  const projectCountByAreaId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of areaRows) {
      if (project.areaId) {
        counts.set(
          project.areaId,
          (counts.get(project.areaId) ?? 0) + 1,
        );
      }
    }
    return counts;
  }, [areaRows]);

  const confirmDeleteArea = useCallback(
    (input: {
      areaId: string;
      name: string;
      parent: ProjectArea | null;
    }) => {
      if (!input.parent) return;
      const projectCount = projectCountByAreaId.get(input.areaId) ?? 0;
      const message =
        projectCount > 0
          ? `Are you sure you want to delete this area? ${projectCount} project${projectCount === 1 ? "" : "s"} will move to ${PROJECT_AREA_LABELS[input.parent]}.`
          : "Are you sure you want to delete this area? This action cannot be undone.";
      Alert.alert(`Delete ${input.name}?`, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteArea(input.areaId).catch((reason) => {
              Alert.alert(
                "Could not delete area",
                reason instanceof Error ? reason.message : String(reason),
              );
            });
          },
        },
      ]);
    },
    [deleteArea, projectCountByAreaId],
  );

  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedNested, setCollapsedNested] = useState<Set<string>>(
    () => new Set(),
  );
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

  const onAreaTabIndex = useCallback(
    (index: number) => {
      const next = PROJECT_AREA_FILTERS[index];
      if (next) setArea(next);
    },
    [setArea],
  );

  useSectionTabShortcuts({
    sectionCount: PROJECT_AREA_FILTERS.length,
    onSelectIndex: onAreaTabIndex,
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <AreasHeader
          area={area}
          onAreaChange={setArea}
        />
      ),
    });
  }, [area, navigation, setArea]);

  const rows = useMemo(
    () =>
      areaRows.filter((project) =>
        matchesListSearch(search.query, project.name, project.key),
      ),
    [areaRows, search.query],
  );

  const sections = useMemo(
    () =>
      buildSections(rows, nestedAreas, collapsedStatuses, collapsedNested),
    [collapsedNested, collapsedStatuses, nestedAreas, rows],
  );

  const { rowIndexByItemId: flatMeta } = useMemo(
    () =>
      flattenGroupedSections(sections, {
        includeEmptyFooter: (section) => section.data.length === 0,
      }),
    [sections],
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

  const listRef = useRef<FlashListRef<FlatGroupedRow<ListRow>>>(null);
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
      const index = findFlatGroupedRowIndex(flatMeta, id);
      if (index == null) return;
      try {
        listRef.current.scrollToIndex({
          index,
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

  const toggleNested = useCallback((collapseKey: string) => {
    setCollapsedNested((current) => {
      const next = new Set(current);
      if (next.has(collapseKey)) next.delete(collapseKey);
      else next.add(collapseKey);
      return next;
    });
  }, []);

  const hasShownDataRef = useRef(false);
  if (sourceRows.length > 0) hasShownDataRef.current = true;

  const loading =
    !hasShownDataRef.current &&
    sourceRows.length === 0 &&
    (restLoading ||
      (!restLoaded &&
        (powerSyncStatus === "connecting" ||
          powerSyncStatus === "idle" ||
          syncLoading)));
  const error =
    sourceRows.length === 0 && restError && !powerSyncConnected
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
          placeholder="Search projects"
        />
      ) : null}
      <BacksterGroupedList
        ref={listRef}
        sections={sections}
        stickySectionHeaders={isPad}
        highlightedId={highlightedId}
        estimatedItemSize={isPad ? 88 : 56}
        estimatedHeaderSize={44}
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onScroll={search.onScroll}
        onScrollEndDrag={search.onScrollEndDrag}
        scrollEventThrottle={16}
        refreshing={pullRefreshing}
        onRefresh={() => {
          void reloadRest({ userPull: true });
        }}
        contentContainerStyle={{
          paddingTop: isPad ? 0 : 8,
        }}
        listHeader={isPad ? <ProjectOverviewListHeader /> : null}
        emptyText={
          search.query.trim()
            ? "No matching projects."
            : area === PROJECT_AREA_FILTER_ALL
              ? "No projects."
              : "No projects in this area."
        }
        renderSectionHeader={(section) => (
          <StatusGroupHeader
            title={section.title}
            icon={<ProjectStatusIcon status={section.key} size={14} />}
            gradient={getProjectStatusHeaderGradient(section.key as ProjectStatus)}
            collapsed={collapsedStatuses.has(section.key)}
            onToggle={() => toggleStatusGroup(section.key as ProjectStatus)}
          />
        )}
        renderSectionFooter={(section) =>
          statusGroupEmptySectionFooter(sections, {
            ...section,
            status: section.key,
          })
        }
        renderItem={(item, { highlighted }) => {
          if (item.kind === "nested-header") {
            return (
              <ProjectTypeGroupHeader
                title={item.label}
                collapsed={item.collapsed}
                onToggle={() => toggleNested(item.collapseKey)}
                onRename={() =>
                  setRenameArea({ areaId: item.areaId, name: item.label })
                }
                onDelete={() =>
                  confirmDeleteArea({
                    areaId: item.areaId,
                    name: item.label,
                    parent: item.parent,
                  })
                }
                spaced
              />
            );
          }

          const project = item.project;
          const progress = progressByProjectId[project.id] ?? EMPTY_PROGRESS;

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
                <ProjectOcticon
                  icon={project.icon}
                  type={project.type}
                  size={18}
                  color={colors.foreground}
                />
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
      {renameArea ? (
        <PropertyTextSheet
          visible
          title="Rename area"
          value={renameArea.name}
          placeholder="Area name"
          autoCapitalize="words"
          validate={(value) =>
            value.trim().length > 0 ? null : "Area name is required."
          }
          onClose={() => setRenameArea(null)}
          onSave={async (value) => {
            await saveAreaRename(renameArea.areaId, value);
            setRenameArea(null);
          }}
        />
      ) : null}
    </View>
  );
}
