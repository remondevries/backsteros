import type { Letter } from "@backsteros/contracts";
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

import { letterDetailHref } from "../lib/detail-href";
import { getMobileEnvironment } from "../lib/env";
import { formatLetterDisplayId } from "../lib/letter-display-id";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { groupTasksByStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { TaskStatusIcon } from "./task-status-icon";

type LetterRow = {
  id: string;
  title: string | null;
  number: number | null;
  status: string | null;
  sort_order: number | null;
  contact_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
};

type Section = {
  title: string;
  status: string;
  data: LetterRow[];
};

type Scope =
  | { kind: "project"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "organization"; id: string };

type Props = {
  scope: Scope;
  emptyText: string;
};

function scopeColumn(kind: Scope["kind"]): string {
  if (kind === "project") return "project_id";
  if (kind === "contact") return "contact_id";
  return "organization_id";
}

/** Status-grouped letters list scoped to a project, contact, or organization. */
export function ScopedLettersPanel({ scope, emptyText }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const { apiUrl } = getMobileEnvironment();

  const column = scopeColumn(scope.kind);
  const lettersSql = useMemo(
    () =>
      `SELECT id, title, number, status, sort_order, contact_id, organization_id, project_id
       FROM letters
       WHERE deleted_at IS NULL
         AND ${column} = ?
       ORDER BY sort_order ASC, number ASC, title ASC`,
    [column],
  );

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
    useSyncedOrRest<LetterRow, LetterRow>({
      sql: lettersSql,
      params: [scope.id],
      mapLocal: (synced) => synced,
      fetchRest: async () => {
        try {
          const query =
            scope.kind === "project"
              ? `?projectId=${encodeURIComponent(scope.id)}`
              : "";
          const body = await client.requestJson<{ letters: Letter[] }>(
            `/api/v1/letters${query}`,
          );
          return (body.letters ?? [])
            .filter((letter) => {
              if (scope.kind === "project") return letter.projectId === scope.id;
              if (scope.kind === "contact") return letter.contactId === scope.id;
              return letter.organizationId === scope.id;
            })
            .map((letter) => ({
              id: letter.id,
              title: letter.title,
              number: letter.number,
              status: letter.status,
              sort_order: letter.sortOrder,
              contact_id: letter.contactId,
              organization_id: letter.organizationId,
              project_id: letter.projectId,
            }));
        } catch (reason) {
          return mapNetworkError(reason);
        }
      },
    });

  const sections = useMemo<Section[]>(
    () =>
      groupTasksByStatus(rows).map((group) => ({
        title: group.label,
        status: group.status,
        data: group.tasks,
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
      sections={sections as SectionListData<LetterRow, Section>[]}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      refreshing={useRest ? restLoading : false}
      onRefresh={() => {
        void reload();
      }}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
      ListEmptyComponent={<Text style={ui.empty}>{emptyText}</Text>}
      renderSectionHeader={({ section }) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
        const title = item.title?.trim() || "Untitled";
        const displayId =
          item.number != null ? formatLetterDisplayId(item.number) : null;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={() => router.push(letterDetailHref(item.id))}
            style={({ pressed }) => [
              ui.row,
              pressed ? { backgroundColor: colors.rowPressed } : null,
            ]}
          >
            <View style={ui.rowIcon}>
              <TaskStatusIcon status={item.status} size={20} />
            </View>
            <View style={ui.rowBody}>
              <View style={ui.rowTitleLine}>
                <Text style={ui.rowTitle} numberOfLines={1}>
                  {title}
                </Text>
                {displayId ? (
                  <Text style={ui.rowId}>{displayId}</Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
