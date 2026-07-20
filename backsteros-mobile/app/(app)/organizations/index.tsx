import type { Organization } from "@backsteros/contracts";
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
import { organizationDetailHref } from "../../../lib/detail-href";
import { matchesListSearch } from "../../../lib/list-search";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useEntityAvatarSrcMap } from "../../../lib/use-entity-avatar-src";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";
import { usePullToRevealSearch } from "../../../lib/use-pull-to-reveal-search";
import { useSyncedOrRest } from "../../../lib/use-synced-or-rest";

type OrganizationRow = {
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
  data: OrganizationRow[];
};

const ORGANIZATIONS_SQL = `SELECT id, name, avatar_storage_key FROM organizations
 WHERE deleted_at IS NULL
 ORDER BY name COLLATE NOCASE ASC`;

export default function OrganizationsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const client = useMobileApiClient();
  const search = usePullToRevealSearch();

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <SectionListHeader
          title="Organizations"
          plusAccessibilityLabel="Create organization"
          onPressPlus={() => router.push("/create/organization")}
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
  } = useSyncedOrRest<SyncedOrganizationRow, OrganizationRow>({
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
          placeholder="Search organizations"
        />
      ) : null}
      <SectionList
        style={ui.screen}
        sections={sections as SectionListData<OrganizationRow, Section>[]}
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
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => router.push(organizationDetailHref(item.id))}
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
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
