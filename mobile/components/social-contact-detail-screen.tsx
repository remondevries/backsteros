import { Stack, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isPadDevice } from "../lib/device";
import {
  formatSocialAddressLine,
  normalizeContactSocialAccounts,
} from "../lib/social-contacts";
import {
  formatSocialHandleInput,
  socialPlatformLabel,
} from "../lib/social-platforms";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { ContactPersonIcon } from "./contact-person-icon";
import { EntityListAvatar } from "./entity-list-avatar";
import { OrganizationIcon } from "./organization-icon";
import { SocialPlatformIcon } from "./social-platform-icon";

type SyncedRow = {
  id: string;
  name: string | null;
  title: string | null;
  summary: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  country: string | null;
  social_accounts: string | null;
  avatar_storage_key: string | null;
  organization_name: string | null;
};

const DETAIL_SQL = `SELECT
  c.id,
  c.name,
  c.title,
  c.summary,
  c.address,
  c.city,
  c.postal_code,
  c.region,
  c.country,
  c.social_accounts,
  c.avatar_storage_key,
  o.name AS organization_name
 FROM contacts c
 LEFT JOIN organizations o ON o.id = c.organization_id
 WHERE c.deleted_at IS NULL AND c.id = ?
 LIMIT 1`;

const EMPTY_SQL = `SELECT
  c.id, c.name, c.title, c.summary, c.address, c.city, c.postal_code,
  c.region, c.country, c.social_accounts, c.avatar_storage_key,
  o.name AS organization_name
 FROM contacts c
 LEFT JOIN organizations o ON o.id = c.organization_id
 WHERE 0`;

type Props = {
  contactId: string;
};

/**
 * Read-focused social contact detail (desktop SocialContactDetailView parity).
 * Full CRM editing lives under Contacts.
 */
export function SocialContactDetailScreen({ contactId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const isPad = isPadDevice();

  const { data, isLoading } = useLocalQuery<SyncedRow>(
    contactId ? DETAIL_SQL : EMPTY_SQL,
    contactId ? [contactId] : [],
  );

  const row = data?.[0] ?? null;
  const socialAccounts = useMemo(
    () => normalizeContactSocialAccounts(row?.social_accounts),
    [row?.social_accounts],
  );

  const avatarSrcById = useEntityAvatarSrcMap(
    "contact",
    row
      ? [{ id: row.id, avatarStorageKey: row.avatar_storage_key }]
      : [],
    client,
  );
  const avatarSrc = row ? (avatarSrcById[row.id] ?? null) : null;

  const name = row?.name?.trim() || "Untitled";
  const title = row?.title?.trim() || null;
  const summary = row?.summary?.trim() || null;
  const organizationName = row?.organization_name?.trim() || null;
  const addressLine = row
    ? formatSocialAddressLine({
        address: row.address,
        city: row.city,
        postalCode: row.postal_code,
        region: row.region,
        country: row.country,
      })
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPad }),
          title: name,
        }}
      />
      {isLoading && !row ? (
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : !row ? (
        <View style={ui.centered}>
          <Text style={ui.empty}>Contact not found.</Text>
        </View>
      ) : (
        <ScrollView
          style={ui.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatar}>
            {avatarSrc ? (
              <EntityListAvatar src={avatarSrc} size={72} />
            ) : (
              <View style={styles.avatarFallback}>
                <ContactPersonIcon size={40} color={colors.muted} />
              </View>
            )}
          </View>

          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {title ? <Text style={styles.title}>{title}</Text> : null}

          {socialAccounts.length > 0 ? (
            <View
              style={styles.links}
              accessibilityRole="list"
              accessibilityLabel="Social links"
            >
              {socialAccounts.map((account) => {
                const handle = formatSocialHandleInput(
                  account.platform,
                  account.url,
                );
                return (
                  <Pressable
                    key={`${account.platform}-${account.url}`}
                    accessibilityRole="link"
                    accessibilityLabel={`${socialPlatformLabel(account.platform)}${handle ? `: ${handle}` : ""}`}
                    onPress={() => {
                      void Linking.openURL(account.url).catch(() => undefined);
                    }}
                    style={({ pressed }) => [
                      styles.linkRow,
                      pressed ? { opacity: 0.7 } : null,
                    ]}
                  >
                    <SocialPlatformIcon
                      platform={account.platform}
                      size={18}
                      color={colors.foreground}
                    />
                    <View style={styles.linkBody}>
                      <Text style={styles.linkPlatform}>
                        {socialPlatformLabel(account.platform)}
                      </Text>
                      {handle ? (
                        <Text style={styles.linkHandle} numberOfLines={1}>
                          {handle}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {summary ? <Text style={styles.summary}>{summary}</Text> : null}

          {addressLine || organizationName ? (
            <View style={styles.meta}>
              {addressLine ? (
                <Text style={styles.metaRow}>{addressLine}</Text>
              ) : null}
              {organizationName ? (
                <View style={styles.orgRow}>
                  <OrganizationIcon size={14} color={colors.muted} />
                  <Text style={styles.metaRow}>{organizationName}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open full contact"
            onPress={() => router.push(`/(app)/contacts/${contactId}`)}
            style={({ pressed }) => [
              styles.openContact,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={styles.openContactLabel}>Open in Contacts</Text>
          </Pressable>
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    alignItems: "center",
  },
  avatar: {
    marginBottom: 16,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  name: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    color: colors.muted,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  links: {
    width: "100%",
    gap: 8,
    marginBottom: 20,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  linkBody: {
    flex: 1,
    minWidth: 0,
  },
  linkPlatform: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  linkHandle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  summary: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 16,
    width: "100%",
  },
  meta: {
    width: "100%",
    gap: 8,
    marginBottom: 24,
  },
  metaRow: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  openContact: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  openContactLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
});
