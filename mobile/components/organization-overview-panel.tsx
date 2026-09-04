import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  pickAvatarImage,
  patchAvatarMetadataLocally,
  uploadAvatarFromUri,
} from "../lib/avatar-upload";
import { entityProfileStyles as profileStyles } from "../lib/entity-profile-styles";
import { patchEntityViaPowerSyncOrApi } from "../lib/entity-mutations";
import { formatMobileUserFacingError } from "../lib/probe-core-health";
import { useMobilePowerSync } from "../lib/powersync-context";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { TextInput } from "./app-text-input";
import { EntityProfileAvatar } from "./entity-profile-avatar";
import { EntityProfileDetails } from "./entity-profile-details";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";

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
  /** Keep the shell header title in sync when the name is saved. */
  onNameChange?: (name: string) => void;
};

const DETAIL_SQL = `SELECT
  id, number, key, name, phone, email, website,
  address, city, postal_code, country, summary, avatar_storage_key
 FROM organizations
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

type OrganizationFields = {
  name: string;
  summary: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};

/**
 * Organization overview — always-editable fields (desktop / journal parity).
 * Saves each field on blur.
 */
export function OrganizationOverviewPanel({
  organizationId,
  onNameChange,
}: Props) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const onNameChangeRef = useRef(onNameChange);
  onNameChangeRef.current = onNameChange;
  const hydratedIdRef = useRef<string | null>(null);

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<OrganizationOverviewRow>(DETAIL_SQL, [organizationId]);

  const [fields, setFields] = useState<OrganizationFields>({
    name: "",
    summary: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [avatarStorageKeyOverride, setAvatarStorageKeyOverride] = useState<
    string | null
  >(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useHideTabBar(pickingAvatar);

  useEffect(() => {
    hydratedIdRef.current = null;
    setAvatarOverride(null);
    setAvatarStorageKeyOverride(null);
    setAvatarError(null);
    setSaveError(null);
  }, [organizationId]);

  const organization = syncedRows?.[0] ?? null;

  useEffect(() => {
    if (!organization) return;
    if (hydratedIdRef.current === organizationId) return;
    hydratedIdRef.current = organizationId;
    const next: OrganizationFields = {
      name: organization.name?.trim() || "",
      summary: organization.summary ?? "",
      phone: organization.phone ?? "",
      email: organization.email ?? "",
      website: organization.website ?? "",
      address: organization.address ?? "",
      city: organization.city ?? "",
      postalCode: organization.postal_code ?? "",
      country: organization.country ?? "",
    };
    setFields(next);
    onNameChangeRef.current?.(next.name || "Untitled");
  }, [organization, organizationId]);

  const avatarStorageKey =
    avatarStorageKeyOverride ?? organization?.avatar_storage_key ?? null;

  const avatarSrcById = useEntityAvatarSrcMap(
    "organization",
    organization
      ? [{ id: organization.id, avatarStorageKey }]
      : [],
    client,
  );

  const persist = useCallback(
    async (patch: Partial<OrganizationFields>) => {
      setSaveError(null);
      const apiBody: Record<string, string | null> = {};
      const sqliteValues: Record<string, string | null> = {};

      const mapField = (
        apiKey: string,
        sqliteKey: string,
        value: string | undefined,
      ) => {
        if (value === undefined) return;
        const trimmed = value.trim() || null;
        apiBody[apiKey] = trimmed;
        sqliteValues[sqliteKey] = trimmed;
      };

      mapField("name", "name", patch.name);
      mapField("summary", "summary", patch.summary);
      mapField("phone", "phone", patch.phone);
      mapField("email", "email", patch.email);
      mapField("website", "website", patch.website);
      mapField("address", "address", patch.address);
      mapField("city", "city", patch.city);
      mapField("postalCode", "postal_code", patch.postalCode);
      mapField("country", "country", patch.country);

      if (Object.keys(apiBody).length === 0) return;

      try {
        await patchEntityViaPowerSyncOrApi(
          client,
          powerSync,
          "organizations",
          organizationId,
          apiBody,
          sqliteValues,
        );
        if (patch.name !== undefined) {
          onNameChangeRef.current?.(patch.name.trim() || "Untitled");
        }
      } catch (reason) {
        setSaveError(
          formatMobileUserFacingError(
            reason,
            "Could not save organization.",
          ),
        );
      }
    },
    [client, organizationId, powerSync],
  );

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
      await patchAvatarMetadataLocally(
        powerSync,
        "organization",
        organizationId,
        result.avatar,
      ).catch(() => {});
    } catch (reason) {
      setAvatarError(
        reason instanceof Error ? reason.message : "Could not update photo.",
      );
    } finally {
      setPickingAvatar(false);
      setUploadingAvatar(false);
    }
  }

  if (
    !organization &&
    powerSync.status !== "error" &&
    (syncLoading || !powerSync.ready)
  ) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!organization) {
    return (
      <Text style={ui.error}>
        {powerSync.status === "error"
          ? powerSync.message
          : "Organization not found."}
      </Text>
    );
  }

  const displayId =
    organization.number != null
      ? `O-${organization.number}`
      : organization.key?.trim() || null;
  const avatarSrc =
    avatarOverride ?? avatarSrcById[organization.id] ?? null;

  const profileFields = [
    {
      key: "phone",
      label: "Phone",
      value: fields.phone,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, phone: value })),
      onBlur: () => void persist({ phone: fields.phone }),
      placeholder: "+31 …",
      keyboardType: "phone-pad" as const,
    },
    {
      key: "email",
      label: "Email",
      value: fields.email,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, email: value })),
      onBlur: () => void persist({ email: fields.email }),
      placeholder: "name@example.com",
      keyboardType: "email-address" as const,
      autoCapitalize: "none" as const,
    },
    {
      key: "address",
      label: "Address",
      value: fields.address,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, address: value })),
      onBlur: () => void persist({ address: fields.address }),
      placeholder: "Street and number",
    },
    {
      key: "city",
      label: "City",
      value: fields.city,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, city: value })),
      onBlur: () => void persist({ city: fields.city }),
      placeholder: "City",
    },
    {
      key: "postalCode",
      label: "Postal code",
      value: fields.postalCode,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, postalCode: value })),
      onBlur: () => void persist({ postalCode: fields.postalCode }),
      placeholder: "Postal code",
    },
    {
      key: "country",
      label: "Country",
      value: fields.country,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, country: value })),
      onBlur: () => void persist({ country: fields.country }),
      placeholder: "Country",
    },
  ];

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      contentContainerStyle={{
        gap: 28,
        paddingTop: 8,
      }}
      keepEndVisibleWhileTyping
    >
      <View style={profileStyles.header}>
        <EntityProfileAvatar
          kind="organization"
          name={fields.name.trim() || "Untitled"}
          src={avatarSrc}
          onPressEdit={() => void onChangeAvatar()}
          uploading={uploadingAvatar || pickingAvatar}
        />
        {displayId ? (
          <Text style={profileStyles.displayId}>{displayId}</Text>
        ) : null}
        <TextInput
          value={fields.name}
          onChangeText={(value) =>
            setFields((prev) => ({ ...prev, name: value }))
          }
          onBlur={() => {
            const trimmed = fields.name.trim();
            if (!trimmed) {
              setFields((prev) => ({
                ...prev,
                name: organization.name?.trim() || "",
              }));
              return;
            }
            void persist({ name: trimmed });
          }}
          placeholder="Organization name"
          placeholderTextColor={colors.muted}
          style={profileStyles.nameInput}
        />
        <TextInput
          value={fields.website}
          onChangeText={(value) =>
            setFields((prev) => ({ ...prev, website: value }))
          }
          onBlur={() => void persist({ website: fields.website })}
          placeholder="Website"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="url"
          style={profileStyles.subtitleInput}
        />
      </View>

      <EntityProfileDetails fields={profileFields} />

      <View style={profileStyles.summaryBlock}>
        <Text style={profileStyles.summaryLabel}>Note</Text>
        <TextInput
          value={fields.summary}
          onChangeText={(value) =>
            setFields((prev) => ({ ...prev, summary: value }))
          }
          onBlur={() => void persist({ summary: fields.summary })}
          placeholder="Add a note…"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled={false}
          style={profileStyles.summaryInput}
        />
      </View>

      {avatarError ? <Text style={ui.error}>{avatarError}</Text> : null}
      {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
    </KeyboardAwareScrollView>
  );
}
