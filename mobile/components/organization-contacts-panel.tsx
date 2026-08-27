import type { Contact } from "@backsteros/contracts";
import type { FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { EntityListAvatar } from "./entity-list-avatar";
import { contactDetailHref } from "../lib/detail-href";
import { useMobileCoreApiUrl } from "../lib/api-url-context";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { BacksterFlashList } from "./lists/index";

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  avatar_storage_key: string | null;
};

type Props = {
  organizationId: string;
};

const CONTACTS_SQL = `SELECT id, name, email, title, avatar_storage_key
 FROM contacts
 WHERE deleted_at IS NULL
   AND organization_id = ?
 ORDER BY name COLLATE NOCASE ASC`;

/** Contacts belonging to an organization. */
export function OrganizationContactsPanel({ organizationId }: Props) {
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

  const { rows, loading, error, pullRefreshing, reload } =
    useSyncedOrRest<ContactRow, ContactRow>({
      sql: CONTACTS_SQL,
      params: [organizationId],
      mapLocal: (synced) => synced,
      fetchRest: async () => {
        try {
          const body = await client.requestJson<{ contacts: Contact[] }>(
            "/api/v1/contacts",
          );
          return (body.contacts ?? [])
            .filter((contact) => contact.organizationId === organizationId)
            .map((contact) => ({
              id: contact.id,
              name: contact.name,
              email: contact.email,
              title: contact.title,
              avatar_storage_key: contact.avatarStorageKey,
            }));
        } catch (reason) {
          return mapNetworkError(reason);
        }
      },
    });

  const avatarSrcById = useEntityAvatarSrcMap(
    "contact",
    rows.map((row) => ({
      id: row.id,
      avatarStorageKey: row.avatar_storage_key,
    })),
    client,
  );

  const listRef = useRef<FlashListRef<ContactRow>>(null);
  const itemIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const openContact = useCallback(
    (id: string) => {
      router.push(contactDetailHref(id));
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: openContact,
    onHighlightChange: (_id, index) => {
      if (index < 0 || !listRef.current) return;
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
    <BacksterFlashList
      ref={listRef}
      data={rows}
      estimatedItemSize={56}
      keyExtractor={(item) => item.id}
      refreshing={pullRefreshing}
      onRefresh={() => {
        void reload();
      }}
      ListEmptyComponent={
        <Text style={ui.empty}>
          No contacts linked to this organization yet.
        </Text>
      }
      renderItem={({ item }) => {
        const name = item.name?.trim() || "Untitled";
        const subtitle = [item.title?.trim(), item.email?.trim()]
          .filter(Boolean)
          .join(" · ");
        const avatarSrc = avatarSrcById[item.id] ?? null;
        const highlighted = highlightedId === item.id;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name}
            onPress={() => router.push(contactDetailHref(item.id))}
            style={({ pressed }) => [
              ui.row,
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
                {name}
              </Text>
              {subtitle ? (
                <Text style={ui.rowMeta} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}
