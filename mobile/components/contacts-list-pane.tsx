import type { Contact } from "@backsteros/contracts";
import type { FlashListRef } from "@shopify/flash-list";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { isPadDevice } from "../lib/device";
import { groupItemsByAlphaLetter } from "../lib/alpha-group";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
} from "../lib/lists/flatten-grouped-sections";
import { matchesListSearch } from "../lib/list-search";
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
import { BacksterGroupedList } from "./lists/index";

export type ContactListRow = {
  id: string;
  name: string;
  organization_name: string | null;
  avatar_storage_key: string | null;
};

type SyncedContactRow = {
  id: string;
  name: string | null;
  organization_name: string | null;
  avatar_storage_key: string | null;
};

type Section = {
  key: string;
  title: string;
  data: ContactListRow[];
};

const CONTACTS_SQL = `SELECT
  c.id,
  c.name,
  c.avatar_storage_key,
  o.name AS organization_name
 FROM contacts c
 LEFT JOIN organizations o ON o.id = c.organization_id
 WHERE c.deleted_at IS NULL
 ORDER BY c.name COLLATE NOCASE ASC`;

/** `/contacts/<id>` → id / null. */
export function contactsSelectedIdFromPathname(
  pathname: string,
): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/contacts\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1];
  if (!segment || segment === "new") return null;
  return segment;
}

type Props = {
  selectedId?: string | null;
  autoSelectFirst?: boolean;
  onPressRow?: (row: ContactListRow) => void;
  /** Phone: in-content scrolling title (not sticky stack header). */
  pageTitle?: string;
  /** Same row as `pageTitle` (e.g. create +). */
  pageTitleTrailing?: ReactNode;
  /** Pad page title for status bar when the native header is hidden. */
  pageTitleSafeArea?: boolean;
};

/**
 * Contacts list — shared by phone full-screen and iPad left pane.
 */
export function ContactsListPane({
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
    selectedId ?? contactsSelectedIdFromPathname(pathname);

  const {
    rows: sourceRows,
    loading,
    error,
    pullRefreshing,
    reload,
  } = useSyncedOrRest<SyncedContactRow, ContactListRow>({
    sql: CONTACTS_SQL,
    mapLocal: (syncedRows) =>
      syncedRows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled",
        organization_name: row.organization_name,
        avatar_storage_key: row.avatar_storage_key,
      })),
    fetchRest: async () => {
      const [contactsBody, orgsBody] = await Promise.all([
        client.requestJson<{ contacts: Contact[] }>("/api/v1/contacts"),
        client
          .requestJson<{
            organizations: { id: string; name: string }[];
          }>("/api/v1/organizations")
          .catch(() => ({
            organizations: [] as { id: string; name: string }[],
          })),
      ]);
      const orgNameById = new Map(
        (orgsBody.organizations ?? []).map((org) => [org.id, org.name]),
      );
      return (contactsBody.contacts ?? []).map((contact) => ({
        id: contact.id,
        name: contact.name?.trim() || "Untitled",
        organization_name: contact.organizationId
          ? (orgNameById.get(contact.organizationId) ?? null)
          : null,
        avatar_storage_key: contact.avatarStorageKey,
      }));
    },
  });
  const search = usePullToRevealSearch({ suppress: pullRefreshing });

  const rows = useMemo(
    () =>
      sourceRows.filter((contact) =>
        matchesListSearch(
          search.query,
          contact.name,
          contact.organization_name,
        ),
      ),
    [search.query, sourceRows],
  );

  const avatarEntities = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        avatarStorageKey: row.avatar_storage_key,
      })),
    [rows],
  );
  const avatarSrcById = useEntityAvatarSrcMap("contact", avatarEntities, client);

  const sections = useMemo<Section[]>(
    () =>
      groupItemsByAlphaLetter(rows).map(([letter, entries]) => ({
        key: letter,
        title: letter,
        data: entries,
      })),
    [rows],
  );

  const { rowIndexByItemId: flatMeta } = useMemo(
    () => flattenGroupedSections(sections),
    [sections],
  );

  useEffect(() => {
    if (!autoSelectFirst || !isPad) return;
    if (loading || error) return;
    if (pathSelectedId) return;
    const normalized = normalizePathname(pathname);
    if (!normalized.startsWith("/contacts")) return;
    if (
      normalized !== "/contacts" &&
      !normalized.match(/^\/contacts\/[^/]+$/)
    ) {
      return;
    }
    const first = rows[0];
    if (!first) return;
    router.replace(`/(app)/contacts/${first.id}`);
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
    (row: ContactListRow) => {
      if (onPressRowProp) {
        onPressRowProp(row);
        return;
      }
      if (isPad) {
        router.replace(`/(app)/contacts/${row.id}`);
        return;
      }
      router.push(`/(app)/contacts/${row.id}`);
    },
    [isPad, onPressRowProp, router],
  );

  const listRef = useRef<FlashListRef<FlatGroupedRow<ContactListRow>>>(null);
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
          placeholder="Search contacts"
        />
      ) : null}
      <BacksterGroupedList
        ref={listRef}
        sections={sections}
        stickySectionHeaders={isPad}
        highlightedId={highlightedId}
        estimatedItemSize={56}
        estimatedHeaderSize={32}
        keyboardDismissMode="on-drag"
        alwaysBounceVertical
        onScroll={search.onScroll}
        onScrollEndDrag={search.onScrollEndDrag}
        scrollEventThrottle={16}
        refreshing={pullRefreshing}
        onRefresh={() => {
          void reload();
        }}
        listHeader={
          pageTitle ? (
            <ContentPageTitle
              title={pageTitle}
              trailing={pageTitleTrailing}
              includeTopSafeArea={pageTitleSafeArea}
            />
          ) : null
        }
        emptyText={
          search.query.trim() ? "No matching contacts." : "No contacts yet."
        }
        renderSectionHeader={(section) => (
          <Text style={ui.sectionHeader}>{section.title}</Text>
        )}
        renderItem={(item, { highlighted }) => {
          const avatarSrc = avatarSrcById[item.id] ?? null;
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
                {item.organization_name?.trim() ? (
                  <Text style={ui.rowMeta} numberOfLines={1}>
                    {item.organization_name.trim()}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
