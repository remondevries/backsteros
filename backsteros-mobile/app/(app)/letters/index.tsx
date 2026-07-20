import type { Letter } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useLayoutEffect, useMemo } from "react";
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
import { SectionListHeader } from "../../../components/section-list-header";
import { TaskStatusIcon } from "../../../components/task-status-icon";
import { letterDetailHref } from "../../../lib/detail-href";
import { formatLetterDisplayId } from "../../../lib/letter-display-id";
import { matchesListSearch } from "../../../lib/list-search";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import { groupTasksByStatus } from "../../../lib/task-status";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../../../lib/use-synced-or-rest";

type LetterRow = {
  id: string;
  title: string | null;
  number: number | null;
  status: string | null;
  sort_order: number | null;
};

type Section = {
  title: string;
  status: string;
  data: LetterRow[];
};

const LETTERS_SQL = `SELECT id, title, number, status, sort_order FROM letters
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, number ASC, title ASC`;

export default function LettersScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const search = usePullToRevealSearch();

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <SectionListHeader
          title="Letters"
          plusAccessibilityLabel="Create letter"
          onPressPlus={() => router.push("/create/letter")}
        />
      ),
    });
  }, [navigation, router]);

  const {
    rows: sourceRows,
    loading,
    error,
    useRest,
    restLoading,
    reload,
  } = useSyncedOrRest<LetterRow, LetterRow>({
    sql: LETTERS_SQL,
    mapLocal: (rows) => rows,
    fetchRest: async () => {
      const body = await client.requestJson<{ letters: Letter[] }>(
        "/api/v1/letters",
      );
      return (body.letters ?? []).map((letter) => ({
        id: letter.id,
        title: letter.title,
        number: letter.number,
        status: letter.status,
        sort_order: letter.sortOrder,
      }));
    },
  });

  const rows = useMemo(
    () =>
      sourceRows.filter((letter) =>
        matchesListSearch(
          search.query,
          letter.title,
          letter.number != null ? formatLetterDisplayId(letter.number) : null,
        ),
      ),
    [search.query, sourceRows],
  );

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
    <View style={ui.screen}>
      {search.visible ? (
        <ListSearchField
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onBlur={search.closeIfEmpty}
          autoFocus
          placeholder="Search letters"
        />
      ) : null}
      <SectionList
        style={ui.screen}
        sections={sections as SectionListData<LetterRow, Section>[]}
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
              void reload();
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
            {search.query.trim() ? "No matching letters." : "No letters yet."}
          </Text>
        }
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
    </View>
  );
}
