import type { Organization } from "@backsteros/contracts";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  pickAvatarImage,
  uploadAvatarFromUri,
} from "../lib/avatar-upload";
import { entityProfileStyles as profileStyles } from "../lib/entity-profile-styles";
import { formatAddress } from "../lib/format-address";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { EntityProfileAvatar } from "./entity-profile-avatar";
import { EntityProfileDetails } from "./entity-profile-details";

type OrganizationOverviewRow = {
  id: string;
  number: number | null;
  key: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  summary: string | null;
  avatar_storage_key: string | null;
};

type Props = {
  organizationId: string;
  editing?: boolean;
  draftName?: string;
  draftSummary?: string;
  draftPhone?: string;
  draftEmail?: string;
  draftWebsite?: string;
  draftAddress?: string;
  draftCity?: string;
  draftPostalCode?: string;
  draftCountry?: string;
  onDraftNameChange?: (value: string) => void;
  onDraftSummaryChange?: (value: string) => void;
  onDraftPhoneChange?: (value: string) => void;
  onDraftEmailChange?: (value: string) => void;
  onDraftWebsiteChange?: (value: string) => void;
  onDraftAddressChange?: (value: string) => void;
  onDraftCityChange?: (value: string) => void;
  onDraftPostalCodeChange?: (value: string) => void;
  onDraftCountryChange?: (value: string) => void;
  saveError?: string | null;
  onDetailsLoaded?: (details: {
    name: string;
    summary: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  }) => void;
};

const DETAIL_SQL = `SELECT
  id, number, key, name, phone, email, website,
  address, city, postal_code, country, summary, avatar_storage_key
 FROM organizations
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

/** Organization overview — profile layout; edit keeps the same structure. */
export function OrganizationOverviewPanel({
  organizationId,
  editing = false,
  draftName = "",
  draftSummary = "",
  draftPhone = "",
  draftEmail = "",
  draftWebsite = "",
  draftAddress = "",
  draftCity = "",
  draftPostalCode = "",
  draftCountry = "",
  onDraftNameChange,
  onDraftSummaryChange,
  onDraftPhoneChange,
  onDraftEmailChange,
  onDraftWebsiteChange,
  onDraftAddressChange,
  onDraftCityChange,
  onDraftPostalCodeChange,
  onDraftCountryChange,
  saveError = null,
  onDetailsLoaded,
}: Props) {
  const powerSync = useMobilePowerSync();
  const onDetailsLoadedRef = useRef(onDetailsLoaded);
  onDetailsLoadedRef.current = onDetailsLoaded;

  const client = useMobileApiClient();

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<OrganizationOverviewRow>(DETAIL_SQL, [organizationId]);

  const [restRow, setRestRow] = useState<OrganizationOverviewRow | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [avatarStorageKeyOverride, setAvatarStorageKeyOverride] = useState<
    string | null
  >(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useHideTabBar(pickingAvatar);

  const useRest = !powerSync.ready;

  useEffect(() => {
    setAvatarOverride(null);
    setAvatarStorageKeyOverride(null);
    setAvatarError(null);
  }, [organizationId]);

  useEffect(() => {
    if (powerSync.ready) return;
    let cancelled = false;
    setRestLoading(true);
    void (async () => {
      try {
        const body = await client.requestJson<{
          organizations: Organization[];
        }>("/api/v1/organizations");
        if (cancelled) return;
        const organization = (body.organizations ?? []).find(
          (entry) => entry.id === organizationId,
        );
        setRestRow(
          organization
            ? {
                id: organization.id,
                number: organization.number,
                key: organization.key,
                name: organization.name,
                phone: organization.phone,
                email: organization.email,
                website: organization.website,
                address: organization.address,
                city: organization.city,
                postal_code: organization.postalCode,
                country: organization.country,
                summary: organization.summary,
                avatar_storage_key: organization.avatarStorageKey,
              }
            : null,
        );
      } catch {
        if (!cancelled) setRestRow(null);
      } finally {
        if (!cancelled) setRestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, organizationId, powerSync.ready]);

  const organization =
    syncedRows?.[0] ?? (!powerSync.ready ? restRow : null);

  const avatarStorageKey =
    avatarStorageKeyOverride ?? organization?.avatar_storage_key ?? null;

  const avatarSrcById = useEntityAvatarSrcMap(
    "organization",
    organization
      ? [
          {
            id: organization.id,
            avatarStorageKey,
          },
        ]
      : [],
    client,
  );

  useEffect(() => {
    if (!organization || !onDetailsLoadedRef.current) return;
    onDetailsLoadedRef.current({
      name: organization.name?.trim() || "",
      summary: organization.summary ?? "",
      phone: organization.phone ?? "",
      email: organization.email ?? "",
      website: organization.website ?? "",
      address: organization.address ?? "",
      city: organization.city ?? "",
      postalCode: organization.postal_code ?? "",
      country: organization.country ?? "",
    });
  }, [organization]);

  async function onChangeAvatar() {
    if (pickingAvatar || uploadingAvatar) return;
    setPickingAvatar(true);
    setAvatarError(null);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const picked = await pickAvatarImage();
      if (!picked) return;
      setUploadingAvatar(true);
      const result = await uploadAvatarFromUri(
        client,
        "organization",
        organizationId,
        picked.uri,
        picked.mimeType,
      );
      if (!result.ok) {
        setAvatarError(result.error);
        return;
      }
      setAvatarOverride(picked.uri);
      setAvatarStorageKeyOverride(result.avatar.storageKey);
      if (powerSync.ready) {
        void powerSync
          .patchOrganization(organizationId, {
            avatar_storage_key: result.avatar.storageKey,
            avatar_content_type: result.avatar.contentType,
          })
          .catch(() => {});
      } else {
        setRestRow((prev) =>
          prev
            ? {
                ...prev,
                avatar_storage_key: result.avatar.storageKey,
              }
            : prev,
        );
      }
    } catch (reason) {
      setAvatarError(
        reason instanceof Error ? reason.message : "Could not update photo.",
      );
    } finally {
      setPickingAvatar(false);
      setUploadingAvatar(false);
    }
  }

  if (!organization && (useRest ? restLoading : syncLoading)) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!organization) {
    return <Text style={ui.error}>Organization not found.</Text>;
  }

  const name = editing
    ? draftName
    : organization.name?.trim() || "Untitled";
  const website = editing
    ? draftWebsite
    : organization.website?.trim() || "";
  const summary = editing
    ? draftSummary
    : organization.summary?.trim() || "";
  const displayId =
    organization.number != null
      ? `O-${organization.number}`
      : organization.key?.trim() || null;
  const address = formatAddress({
    address: editing ? draftAddress : organization.address,
    city: editing ? draftCity : organization.city,
    postalCode: editing ? draftPostalCode : organization.postal_code,
    country: editing ? draftCountry : organization.country,
  });
  const avatarSrc = avatarOverride ?? avatarSrcById[organization.id] ?? null;

  const profileFields = editing
    ? [
        {
          key: "phone",
          label: "Phone",
          value: draftPhone,
          onChangeText: onDraftPhoneChange,
          placeholder: "Phone",
          keyboardType: "phone-pad" as const,
        },
        {
          key: "email",
          label: "Email",
          value: draftEmail,
          onChangeText: onDraftEmailChange,
          placeholder: "Email",
          keyboardType: "email-address" as const,
          autoCapitalize: "none" as const,
        },
        {
          key: "address",
          label: "Address",
          value: draftAddress,
          onChangeText: onDraftAddressChange,
          placeholder: "Street and number",
        },
        {
          key: "city",
          label: "City",
          value: draftCity,
          onChangeText: onDraftCityChange,
          placeholder: "City",
        },
        {
          key: "postalCode",
          label: "Postal code",
          value: draftPostalCode,
          onChangeText: onDraftPostalCodeChange,
          placeholder: "Postal code",
        },
        {
          key: "country",
          label: "Country",
          value: draftCountry,
          onChangeText: onDraftCountryChange,
          placeholder: "Country",
        },
      ]
    : [
        {
          key: "phone",
          label: "Phone",
          value: organization.phone?.trim() || "—",
          empty: !organization.phone?.trim(),
        },
        {
          key: "email",
          label: "Email",
          value: organization.email?.trim() || "—",
          empty: !organization.email?.trim(),
        },
        {
          key: "address",
          label: "Address",
          value: address || "—",
          empty: !address,
        },
      ];

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{
        paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        gap: 28,
        paddingTop: 8,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={profileStyles.header}>
        <EntityProfileAvatar
          kind="organization"
          name={name.trim() || "Untitled"}
          src={avatarSrc}
          onPressEdit={editing ? () => void onChangeAvatar() : undefined}
          uploading={uploadingAvatar || pickingAvatar}
        />
        {displayId ? (
          <Text style={profileStyles.displayId}>{displayId}</Text>
        ) : null}
        {editing ? (
          <TextInput
            value={draftName}
            onChangeText={onDraftNameChange}
            placeholder="Organization name"
            placeholderTextColor={colors.muted}
            autoFocus
            style={profileStyles.nameInput}
          />
        ) : (
          <Text style={profileStyles.name}>{name}</Text>
        )}
        {editing ? (
          <TextInput
            value={draftWebsite}
            onChangeText={onDraftWebsiteChange}
            placeholder="Website"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="url"
            style={profileStyles.subtitleInput}
          />
        ) : website ? (
          <Text style={profileStyles.subtitle}>{website}</Text>
        ) : null}
      </View>

      <EntityProfileDetails fields={profileFields} editing={editing} />

      <View style={profileStyles.summaryBlock}>
        <Text style={profileStyles.summaryLabel}>Note</Text>
        {editing ? (
          <TextInput
            value={draftSummary}
            onChangeText={onDraftSummaryChange}
            placeholder="Add a note…"
            placeholderTextColor={colors.muted}
            multiline
            style={profileStyles.summaryInput}
          />
        ) : summary ? (
          <Text style={profileStyles.summary}>{summary}</Text>
        ) : (
          <Text style={profileStyles.summaryEmpty}>No note yet.</Text>
        )}
      </View>

      {avatarError ? <Text style={ui.error}>{avatarError}</Text> : null}
      {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
    </ScrollView>
  );
}
