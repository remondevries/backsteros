import type { Letter } from "@backsteros/contracts";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { isPadDevice } from "../lib/device";
import { formatLetterDisplayId } from "../lib/letter-display-id";
import { findSectionListLocation } from "../lib/list-keyboard-nav";
import { matchesListSearch } from "../lib/list-search";
import { getTaskStatusHeaderGradient } from "../lib/status-header-gradient";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { groupTasksByStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { normalizePathname } from "../lib/use-escape-back-navigation";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { LetterIcon } from "./letter-icon";
import { ContentPageTitle } from "./content-page-title";
import { ListSearchField } from "./list-search-field";
import {
  StatusGroupHeader,
  statusGroupEmptySectionFooter,
} from "./status-group-header";
import { TaskStatusIcon } from "./task-status-icon";

export type LetterListRow = {
  id: string;
  title: string | null;
  number: number | null;
  status: string | null;
  sort_order: number | null;
};

type Section = {
  title: string;
  status: string;
  data: LetterListRow[];
};

const LETTERS_SQL = `SELECT id, title, number, status, sort_order FROM letters
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, number ASC, title ASC`;

/** `/letters/<id>` → id / null. */
export function lettersSelectedIdFromPathname(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/letters\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1];
  if (!segment || segment === "new") return null;
  return segment;
}

type Props = {
  /** Master-detail selection highlight (iPad). */
  selectedId?: string | null;
  /**
   * When true (iPad split), open the first letter if none is selected —
   * desktop letters side-panel parity.
   */
  autoSelectFirst?: boolean;
  /** Override row press (defaults to letters detail navigation). */
  onPressRow?: (row: LetterListRow) => void;
  /** Phone: in-content scrolling title (not sticky stack header). */
  pageTitle?: string;
  pageTitleTrailing?: ReactNode;
  pageTitleSafeArea?: boolean;
};

/**
 * Letters list — shared by phone full-screen and iPad left pane.
 * Grouped by status like desktop `LettersSidePanelView`.
 */
export function LettersListPane({
  selectedId = null,
  autoSelectFirst = false,
  onPressRow: onPressRowProp,
  pageTitle,
  pageTitleTrailing,
  pageTitleSafeArea = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useMobileApiClient();
  const isPad = isPadDevice();

  const pathSelectedId = selectedId ?? lettersSelectedIdFromPathname(pathname);

  const {
    rows: sourceRows,
    loading,
    error,
    pullRefreshing,
    reload,
  } = useSyncedOrRest<LetterListRow, LetterListRow>({
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
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

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

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleStatus = useCallback((status: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const visibleSections = useMemo(
    () =>
      sections.map((section) =>
        collapsed.has(section.status)
          ? { ...section, data: [] as LetterListRow[] }
          : section,
      ),
    [collapsed, sections],
  );

  useEffect(() => {
    if (!autoSelectFirst || !isPad) return;
    if (loading || error) return;
    if (pathSelectedId) return;
    const normalized = normalizePathname(pathname);
    if (!normalized.startsWith("/letters")) return;
    if (normalized !== "/letters" && !normalized.match(/^\/letters\/[^/]+$/)) {
      return;
    }
    const first = rows[0];
    if (!first) return;
    router.replace(`/(app)/letters/${first.id}`);
  }, [
    autoSelectFirst,
    error,
    isPad,
    loading,
    pathSelectedId,
    pathname,
    router,
    rows,
  ]);

  const onPressRow = useCallback(
    (row: LetterListRow) => {
      if (onPressRowProp) {
        onPressRowProp(row);
        return;
      }
      if (isPad) {
        router.replace(`/(app)/letters/${row.id}`);
        return;
      }
      router.push(`/(app)/letters/${row.id}`);
    },
    [isPad, onPressRowProp, router],
  );

  const listRef = useRef<SectionList<LetterListRow, Section>>(null);
  const itemIds = useMemo(
    () =>
      visibleSections.flatMap((section) => section.data.map((row) => row.id)),
    [visibleSections],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: (id) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) onPressRow(row);
    },
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const location = findSectionListLocation(visibleSections, id);
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
          placeholder="Search letters"
        />
      ) : null}
      <SectionList
        ref={listRef}
        style={ui.screen}
        sections={visibleSections as SectionListData<LetterListRow, Section>[]}
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
              void reload();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        ListHeaderComponent={
          pageTitle ? (
            <ContentPageTitle
              title={pageTitle}
              trailing={pageTitleTrailing}
              includeTopSafeArea={pageTitleSafeArea}
            />
          ) : null
        }
        ListEmptyComponent={
          <Text style={ui.empty}>
            {search.query.trim()
              ? "No matching letters."
              : "No letters yet. Use the plus button to upload one."}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <StatusGroupHeader
            title={section.title}
            icon={
              <TaskStatusIcon
                status={
                  section.status === "overdue" ? "on_hold" : section.status
                }
                size={14}
              />
            }
            gradient={getTaskStatusHeaderGradient(section.status)}
            collapsed={collapsed.has(section.status)}
            onToggle={() => toggleStatus(section.status)}
          />
        )}
        renderSectionFooter={({ section }) =>
          statusGroupEmptySectionFooter(visibleSections, section)
        }
        renderItem={({ item }) => {
          const title = item.title?.trim() || "Untitled";
          const displayId =
            item.number != null ? formatLetterDisplayId(item.number) : null;
          const highlighted = highlightedId === item.id;
          const selected = pathSelectedId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityState={{ selected }}
              onPress={() => onPressRow(item)}
              style={({ pressed }) => [
                ui.row,
                selected ? ui.listRowSelected : null,
                highlighted ? ui.keyboardNavHighlight : null,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              <View style={ui.rowIcon}>
                <LetterIcon size={16} />
              </View>
              <View style={ui.rowBody}>
                <View style={ui.rowTitleLine}>
                  {displayId ? (
                    <Text style={ui.rowId}>{displayId}</Text>
                  ) : null}
                  <Text style={ui.rowTitle} numberOfLines={1}>
                    {title}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
