import type { Contact } from "@backsteros/contracts";
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

import { EntityListAvatar } from "../../../components/entity-list-avatar";
import { ListSearchField } from "../../../components/list-search-field";
import { SectionListHeader } from "../../../components/section-list-header";
import { groupItemsByAlphaLetter } from "../../../lib/alpha-group";
import { contactDetailHref } from "../../../lib/detail-href";
import { matchesListSearch } from "../../../lib/list-search";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useEntityAvatarSrcMap } from "../../../lib/use-entity-avatar-src";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../../../lib/use-synced-or-rest";

type ContactRow = {
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
  title: string;
  data: ContactRow[];
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

export default function ContactsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const search = usePullToRevealSearch();

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <SectionListHeader
          title="Contacts"
          plusAccessibilityLabel="Create contact"
          onPressPlus={() => router.push("/create/contact")}
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
  } = useSyncedOrRest<SyncedContactRow, ContactRow>({
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

  const avatarSrcById = useEntityAvatarSrcMap(
    "contact",
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
          placeholder="Search contacts"
        />
      ) : null}
      <SectionList
        style={ui.screen}
        sections={sections as SectionListData<ContactRow, Section>[]}
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
            {search.query.trim() ? "No matching contacts." : "No contacts yet."}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={ui.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const avatarSrc = avatarSrcById[item.id] ?? null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => router.push(contactDetailHref(item.id))}
              style={({ pressed }) => [
                ui.row,
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
