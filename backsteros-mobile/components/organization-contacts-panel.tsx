import type { Contact } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";

import { EntityListAvatar } from "./entity-list-avatar";
import { contactDetailHref } from "../lib/detail-href";
import { getMobileEnvironment } from "../lib/env";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";

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
    <FlatList
      style={ui.screen}
      data={rows}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      refreshing={useRest ? restLoading : false}
      onRefresh={() => {
        void reload();
      }}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
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
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name}
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
