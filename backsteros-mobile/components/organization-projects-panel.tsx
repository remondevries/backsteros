import type { Project } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { projectDetailHref } from "../lib/detail-href";
import { getMobileEnvironment } from "../lib/env";
import {
  aggregateTaskProgressByProjectId,
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../lib/project-progress-ring";
import { groupProjectsByStatus } from "../lib/project-status";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
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
  title: string;
  status: string;
  data: ProjectRow[];
};

type Props = {
  organizationId: string;
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
export function OrganizationProjectsPanel({ organizationId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { apiUrl } = getMobileEnvironment();

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
    },
    [apiUrl],
  );

  const { rows, loading, error, useRest, restLoading, reload } =
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
        title: group.label,
        status: group.status,
        data: group.projects,
      })),
    [rows],
  );

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

  return (
    <SectionList
      style={ui.screen}
      sections={sections as SectionListData<ProjectRow, Section>[]}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      refreshing={useRest ? restLoading : false}
      onRefresh={() => {
        void reload();
      }}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
      ListEmptyComponent={
        <Text style={ui.empty}>No projects linked to this organization.</Text>
      }
      renderSectionHeader={({ section }) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
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
