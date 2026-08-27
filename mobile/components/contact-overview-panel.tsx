import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  pickAvatarImage,
  patchAvatarMetadataLocally,
  uploadAvatarFromUri,
} from "../lib/avatar-upload";
import { organizationDetailHref } from "../lib/detail-href";
import { entityProfileStyles as profileStyles } from "../lib/entity-profile-styles";
import { patchEntityViaPowerSyncOrApi } from "../lib/entity-mutations";
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
import { OrganizationIcon } from "./organization-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

type ContactOverviewRow = {
  id: string;
  number: number | null;
  key: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  summary: string | null;
  avatar_storage_key: string | null;
  organization_id: string | null;
  organization_name: string | null;
};

type NamedOptionRow = { id: string; name: string | null };

type Props = {
  contactId: string;
  /** Keep the shell header title in sync when the name is saved. */
  onNameChange?: (name: string) => void;
};

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

const DETAIL_SQL = `SELECT
  c.id, c.number, c.key, c.name, c.email, c.phone, c.title,
  c.address, c.city, c.postal_code, c.country, c.summary,
  c.avatar_storage_key, c.organization_id, o.name AS organization_name
 FROM contacts c
 LEFT JOIN organizations o ON o.id = c.organization_id
 WHERE c.deleted_at IS NULL AND c.id = ?
 LIMIT 1`;

type ContactFields = {
  name: string;
  summary: string;
  email: string;
  phone: string;
  title: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};

/**
 * Contact overview — always-editable fields (desktop / journal parity).
 * Saves each field on blur.
 */
export function ContactOverviewPanel({ contactId, onNameChange }: Props) {
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const onNameChangeRef = useRef(onNameChange);
  onNameChangeRef.current = onNameChange;
  const hydratedIdRef = useRef<string | null>(null);

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<ContactOverviewRow>(DETAIL_SQL, [contactId]);
  const { data: organizationRows } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);

  const [fields, setFields] = useState<ContactFields>({
    name: "",
    summary: "",
    email: "",
    phone: "",
    title: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
  });
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
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
    setPropertyError(null);
  }, [contactId]);

  const contact = syncedRows?.[0] ?? null;
  const organizations = organizationRows ?? [];

  useEffect(() => {
    if (!contact) return;
    if (hydratedIdRef.current === contactId) return;
    hydratedIdRef.current = contactId;
    const next: ContactFields = {
      name: contact.name?.trim() || "",
      summary: contact.summary ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      title: contact.title ?? "",
      address: contact.address ?? "",
      city: contact.city ?? "",
      postalCode: contact.postal_code ?? "",
      country: contact.country ?? "",
    };
    setFields(next);
    setOrganizationId(contact.organization_id ?? null);
    onNameChangeRef.current?.(next.name || "Untitled");
  }, [contact, contactId]);

  const avatarStorageKey =
    avatarStorageKeyOverride ?? contact?.avatar_storage_key ?? null;

  const avatarSrcById = useEntityAvatarSrcMap(
    "contact",
    contact
      ? [{ id: contact.id, avatarStorageKey }]
      : [],
    client,
  );

  const persist = useCallback(
    async (
      patch: Partial<ContactFields> & { organizationId?: string | null },
    ) => {
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
      mapField("email", "email", patch.email);
      mapField("phone", "phone", patch.phone);
      mapField("title", "title", patch.title);
      mapField("address", "address", patch.address);
      mapField("city", "city", patch.city);
      mapField("postalCode", "postal_code", patch.postalCode);
      mapField("country", "country", patch.country);

      if (patch.organizationId !== undefined) {
        apiBody.organizationId = patch.organizationId;
        sqliteValues.organization_id = patch.organizationId;
      }

      if (Object.keys(apiBody).length === 0) return;

      try {
        await patchEntityViaPowerSyncOrApi(
          client,
          powerSync,
          "contacts",
          contactId,
          apiBody,
          sqliteValues,
        );
        if (patch.name !== undefined) {
          onNameChangeRef.current?.(patch.name.trim() || "Untitled");
        }
      } catch (reason) {
        setSaveError(
          reason instanceof Error ? reason.message : "Could not save contact.",
        );
      }
    },
    [client, contactId, powerSync],
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
        "contact",
        contactId,
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
        "contact",
        contactId,
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
    !contact &&
    powerSync.status !== "error" &&
    (syncLoading || !powerSync.ready)
  ) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!contact) {
    return (
      <Text style={ui.error}>
        {powerSync.status === "error" ? powerSync.message : "Contact not found."}
      </Text>
    );
  }

  const organizationOptions: PropertyOption<string | null>[] = [
    { value: null, label: "No organization" },
    ...organizations.map((organization) => ({
      value: organization.id as string | null,
      label: organization.name?.trim() || "Untitled",
    })),
  ];

  const organizationLabel =
    organizations.find((entry) => entry.id === organizationId)?.name?.trim() ||
    contact.organization_name?.trim() ||
    null;

  const displayId =
    contact.number != null
      ? `C-${contact.number}`
      : contact.key?.trim() || null;
  const avatarSrc = avatarOverride ?? avatarSrcById[contact.id] ?? null;

  const profileFields = [
    {
      key: "organization",
      label: "Organization",
      value: organizationLabel || "Add organization",
      empty: !organizationLabel,
      icon: organizationLabel ? (
        <OrganizationIcon size={16} color={colors.muted} />
      ) : undefined,
      onPress: () => setPickerOpen(true),
      navigateHref: organizationId
        ? organizationDetailHref(organizationId)
        : null,
      navigateLabel: "Open organization",
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
    <>
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
            kind="contact"
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
                  name: contact.name?.trim() || "",
                }));
                return;
              }
              void persist({ name: trimmed });
            }}
            placeholder="Contact name"
            placeholderTextColor={colors.muted}
            style={profileStyles.nameInput}
          />
          <TextInput
            value={fields.title}
            onChangeText={(value) =>
              setFields((prev) => ({ ...prev, title: value }))
            }
            onBlur={() => void persist({ title: fields.title })}
            placeholder="Title"
            placeholderTextColor={colors.muted}
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
        {propertyError ? <Text style={ui.error}>{propertyError}</Text> : null}
        {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
      </KeyboardAwareScrollView>

      <PropertyOptionSheet
        visible={pickerOpen}
        title="Organization"
        options={organizationOptions}
        selected={organizationId}
        onSelect={(value) => {
          setOrganizationId(value);
          setPickerOpen(false);
          setPropertyError(null);
          void (async () => {
            try {
              await persist({ organizationId: value });
            } catch {
              setPropertyError("Could not update organization.");
            }
          })();
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
