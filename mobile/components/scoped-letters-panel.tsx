import type { Letter } from "@backsteros/contracts";
import type { FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { letterDetailHref } from "../lib/detail-href";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
import { formatLetterDisplayId } from "../lib/letter-display-id";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
} from "../lib/lists/flatten-grouped-sections";
import { groupTasksByStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { BacksterGroupedList } from "./lists/index";
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
  key: string;
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

  const { rows, loading, error, pullRefreshing, reload } =
    useSyncedOrRest<LetterRow, LetterRow>({
      sql: lettersSql,
      params: [scope.id],
      mapLocal: (synced) => synced,
      fetchRest: async () => {
        try {
          const body = await client.requestJson<{ letters: Letter[] }>(
            "/api/v1/letters",
          );
          return (body.letters ?? [])
            .filter((letter) => {
              if (scope.kind === "project")
                return letter.projectId === scope.id;
              if (scope.kind === "contact")
                return letter.contactId === scope.id;
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
        key: group.status,
        title: group.label,
        status: group.status,
        data: group.tasks,
      })),
    [rows],
  );

  const { rowIndexByItemId: flatMeta } = useMemo(
    () => flattenGroupedSections(sections),
    [sections],
  );

  const listRef = useRef<FlashListRef<FlatGroupedRow<LetterRow>>>(null);
  const itemIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );
  const openLetter = useCallback(
    (id: string) => {
      router.push(letterDetailHref(id));
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: openLetter,
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
      emptyText={emptyText}
      renderSectionHeader={(section) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={(item, { highlighted }) => {
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
              highlighted ? ui.keyboardNavHighlight : null,
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
