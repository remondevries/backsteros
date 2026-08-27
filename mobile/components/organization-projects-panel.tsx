import type { Project } from "@backsteros/contracts";
import type { FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { projectDetailHref } from "../lib/detail-href";
import type { ListBoardView } from "../lib/list-board-view";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
} from "../lib/lists/flatten-grouped-sections";
import {
  aggregateTaskProgressByProjectId,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../lib/project-progress-ring";
import { groupProjectsByStatus } from "../lib/project-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { BacksterGroupedList } from "./lists/index";
import { ProjectBoardPane } from "./list-board/project-board-pane";
import { ProjectProgressRing } from "./project-progress-ring";
import { ProjectStatusIcon } from "./project-status-icon";

type ProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  sort_order: number | null;
};

type TaskProgressRow = {
  project_id: string | null;
  status: string | null;
};

type Section = {
  key: string;
  title: string;
  status: string;
  data: ProjectRow[];
};

type Props = {
  organizationId: string;
  boardView?: ListBoardView;
};

const EMPTY_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

const PROJECTS_SQL = `SELECT id, name, status, sort_order FROM projects
 WHERE deleted_at IS NULL
   AND organization_id = ?
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

const PROGRESS_SQL = `SELECT t.project_id, t.status
 FROM tasks t
 INNER JOIN projects p ON p.id = t.project_id
 WHERE t.deleted_at IS NULL
   AND p.deleted_at IS NULL
   AND p.organization_id = ?`;

/** Projects linked to an organization — grouped by project status. */
export function OrganizationProjectsPanel({
  organizationId,
  boardView = "list",
}: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        isNetworkError(detail) ? formatNetworkError() : detail,
      );
    },
    [formatNetworkError, isNetworkError],
  );

  const { rows, loading, error, useRest, pullRefreshing, reload } =
    useSyncedOrRest<ProjectRow, ProjectRow>({
      sql: PROJECTS_SQL,
      params: [organizationId],
      mapLocal: (synced) => synced,
      fetchRest: async () => {
        try {
          const body = await client.requestJson<{ projects: Project[] }>(
            `/api/v1/projects?organizationId=${encodeURIComponent(organizationId)}`,
          );
          return (body.projects ?? [])
            .filter((project) => project.organizationId === organizationId)
            .map((project) => ({
              id: project.id,
              name: project.name,
              status: project.status,
              sort_order: project.sortOrder,
            }));
        } catch (reason) {
          return mapNetworkError(reason);
        }
      },
    });

  const { data: progressRows } = useLocalQuery<TaskProgressRow>(PROGRESS_SQL, [
    organizationId,
  ]);

  const progressByProjectId = useMemo(() => {
    if (useRest) return {} as Record<string, ProjectTaskProgress>;
    return aggregateTaskProgressByProjectId(progressRows ?? []);
  }, [progressRows, useRest]);

  const sections = useMemo<Section[]>(
    () =>
      groupProjectsByStatus(rows).map((group) => ({
        key: group.status,
        title: group.label,
        status: group.status,
        data: group.projects,
      })),
    [rows],
  );

  const { rowIndexByItemId: flatMeta } = useMemo(
    () => flattenGroupedSections(sections),
    [sections],
  );

  const listRef = useRef<FlashListRef<FlatGroupedRow<ProjectRow>>>(null);
  const itemIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );
  const openProject = useCallback(
    (id: string) => {
      router.push(projectDetailHref(id));
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
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

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return <Text style={ui.error}>{error}</Text>;
  }

  if (boardView === "board") {
    return (
      <ProjectBoardPane
        rows={rows}
        onPressRow={(row) => router.push(projectDetailHref(row.id))}
      />
    );
  }

  return (
    <BacksterGroupedList
      ref={listRef}
      sections={sections}
      highlightedId={highlightedId}
      estimatedItemSize={56}
      estimatedHeaderSize={32}
      refreshing={pullRefreshing}
      onRefresh={() => {
        void reload();
      }}
      emptyText="No projects linked to this organization."
      renderSectionHeader={(section) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={(item, { highlighted }) => {
        const title = item.name?.trim() || "Untitled";
        const progress = progressByProjectId[item.id] ?? EMPTY_PROGRESS;
        const percentLabel = formatProjectTaskProgressPercent(progress);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${percentLabel} complete`}
            onPress={() => router.push(projectDetailHref(item.id))}
            style={({ pressed }) => [
              ui.row,
              highlighted ? ui.keyboardNavHighlight : null,
              pressed ? { backgroundColor: colors.rowPressed } : null,
            ]}
          >
            <View style={ui.rowIcon}>
              <ProjectStatusIcon status={item.status} size={18} />
            </View>
            <View style={ui.rowBody}>
              <View style={[ui.rowTitleLine, { alignItems: "center" }]}>
                <Text style={ui.rowTitle} numberOfLines={1}>
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
  );
}
