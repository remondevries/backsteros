import type { Organization } from "@backsteros/contracts";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { groupItemsByAlphaLetter } from "../lib/alpha-group";
import { isPadDevice } from "../lib/device";
import { findSectionListLocation } from "../lib/list-keyboard-nav";
import { matchesListSearch } from "../lib/list-search";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { normalizePathname } from "../lib/use-escape-back-navigation";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { EntityListAvatar } from "./entity-list-avatar";
import { ContentPageTitle } from "./content-page-title";
import { ListSearchField } from "./list-search-field";

export type OrganizationListRow = {
  id: string;
  name: string;
  avatar_storage_key: string | null;
};

type SyncedOrganizationRow = {
  id: string;
  name: string | null;
  avatar_storage_key: string | null;
};

type Section = {
  title: string;
  data: OrganizationListRow[];
};

const ORGANIZATIONS_SQL = `SELECT id, name, avatar_storage_key FROM organizations
 WHERE deleted_at IS NULL
 ORDER BY name COLLATE NOCASE ASC`;

/** `/organizations/<id>` → id / null. */
export function organizationsSelectedIdFromPathname(
  pathname: string,
): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/organizations\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1];
  if (!segment || segment === "new") return null;
  return segment;
}

type Props = {
  selectedId?: string | null;
  autoSelectFirst?: boolean;
  onPressRow?: (row: OrganizationListRow) => void;
  /** Phone: in-content scrolling title (not sticky stack header). */
  pageTitle?: string;
  pageTitleTrailing?: ReactNode;
  pageTitleSafeArea?: boolean;
};

/**
 * Organizations list — shared by phone full-screen and iPad left pane.
 */
export function OrganizationsListPane({
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

  const pathSelectedId =
    selectedId ?? organizationsSelectedIdFromPathname(pathname);

  const {
    rows: sourceRows,
    loading,
    error,
    pullRefreshing,
    reload,
  } = useSyncedOrRest<SyncedOrganizationRow, OrganizationListRow>({
    sql: ORGANIZATIONS_SQL,
    mapLocal: (syncedRows) =>
      syncedRows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled",
        avatar_storage_key: row.avatar_storage_key,
      })),
    fetchRest: async () => {
      const body = await client.requestJson<{ organizations: Organization[] }>(
        "/api/v1/organizations",
      );
      return (body.organizations ?? []).map((organization) => ({
        id: organization.id,
        name: organization.name?.trim() || "Untitled",
        avatar_storage_key: organization.avatarStorageKey,
      }));
    },
  });
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

  const rows = useMemo(
    () =>
      sourceRows.filter((organization) =>
        matchesListSearch(search.query, organization.name),
      ),
    [search.query, sourceRows],
  );

  const avatarSrcById = useEntityAvatarSrcMap(
    "organization",
    rows.map((row) => ({
      id: row.id,
      avatarStorageKey: row.avatar_storage_key,
    })),
    client,
  );

  const sections = useMemo<Section[]>(
    () =>
      groupItemsByAlphaLetter(rows).map(([letter, entries]) => ({
        title: letter,
        data: entries,
      })),
    [rows],
  );

  useEffect(() => {
    if (!autoSelectFirst || !isPad) return;
    if (loading || error) return;
    if (pathSelectedId) return;
    const normalized = normalizePathname(pathname);
    if (!normalized.startsWith("/organizations")) return;
    if (
      normalized !== "/organizations" &&
      !normalized.match(/^\/organizations\/[^/]+$/)
    ) {
      return;
    }
    const first = rows[0];
    if (!first) return;
    router.replace(`/(app)/organizations/${first.id}`);
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
    (row: OrganizationListRow) => {
      if (onPressRowProp) {
        onPressRowProp(row);
        return;
      }
      if (isPad) {
        router.replace(`/(app)/organizations/${row.id}`);
        return;
      }
      router.push(`/(app)/organizations/${row.id}`);
    },
    [isPad, onPressRowProp, router],
  );

  const listRef = useRef<SectionList<OrganizationListRow, Section>>(null);
  const itemIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: (id) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) onPressRow(row);
    },
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
          placeholder="Search organizations"
        />
      ) : null}
      <SectionList
        ref={listRef}
        style={ui.screen}
        sections={
          sections as SectionListData<OrganizationListRow, Section>[]
        }
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
              ? "No matching organizations."
              : "No organizations yet."}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={ui.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const avatarSrc = avatarSrcById[item.id] ?? null;
          const highlighted = highlightedId === item.id;
          const selected = pathSelectedId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ selected }}
              onPress={() => onPressRow(item)}
              style={({ pressed }) => [
                ui.row,
                selected ? ui.listRowSelected : null,
                highlighted ? ui.keyboardNavHighlight : null,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              {avatarSrc ? (
                <View style={ui.rowIcon}>
                  <EntityListAvatar src={avatarSrc} size={18} />
                </View>
              ) : null}
              <View style={ui.rowBody}>
                <Text style={ui.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
