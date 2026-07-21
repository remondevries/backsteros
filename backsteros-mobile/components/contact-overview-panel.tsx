import type { Contact, Organization } from "@backsteros/contracts";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  View,
} from "react-native";

import {
  pickAvatarImage,
  uploadAvatarFromUri,
} from "../lib/avatar-upload";
import { organizationDetailHref } from "../lib/detail-href";
import { entityProfileStyles as profileStyles } from "../lib/entity-profile-styles";
import { formatAddress } from "../lib/format-address";
import { useMobilePowerSync } from "../lib/powersync-context";
import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntityAvatarSrcMap } from "../lib/use-entity-avatar-src";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { EntityProfileAvatar } from "./entity-profile-avatar";
import { EntityProfileDetails } from "./entity-profile-details";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { OrganizationIcon } from "./organization-icon";
import { TextInput } from "./app-text-input";
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
  editing?: boolean;
  draftName?: string;
  draftSummary?: string;
  draftEmail?: string;
  draftPhone?: string;
  draftTitle?: string;
  draftAddress?: string;
  draftCity?: string;
  draftPostalCode?: string;
  draftCountry?: string;
  onDraftNameChange?: (value: string) => void;
  onDraftSummaryChange?: (value: string) => void;
  onDraftEmailChange?: (value: string) => void;
  onDraftPhoneChange?: (value: string) => void;
  onDraftTitleChange?: (value: string) => void;
  onDraftAddressChange?: (value: string) => void;
  onDraftCityChange?: (value: string) => void;
  onDraftPostalCodeChange?: (value: string) => void;
  onDraftCountryChange?: (value: string) => void;
  saveError?: string | null;
  onDetailsLoaded?: (details: {
    name: string;
    summary: string;
    email: string;
    phone: string;
    title: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  }) => void;
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

/** Contact overview — same profile edit pattern as organizations. */
export function ContactOverviewPanel({
  contactId,
  editing = false,
  draftName = "",
  draftSummary = "",
  draftEmail = "",
  draftPhone = "",
  draftTitle = "",
  draftAddress = "",
  draftCity = "",
  draftPostalCode = "",
  draftCountry = "",
  onDraftNameChange,
  onDraftSummaryChange,
  onDraftEmailChange,
  onDraftPhoneChange,
  onDraftTitleChange,
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
    useLocalQuery<ContactOverviewRow>(DETAIL_SQL, [contactId]);
  const { data: organizationRows } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);

  const [restRow, setRestRow] = useState<ContactOverviewRow | null>(null);
  const [restOrgs, setRestOrgs] = useState<NamedOptionRow[]>([]);
  const [restLoading, setRestLoading] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);
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
  }, [contactId]);

  useEffect(() => {
    if (powerSync.ready) return;
    let cancelled = false;
    setRestLoading(true);
    void (async () => {
      try {
        const [contactsBody, orgsBody] = await Promise.all([
          client.requestJson<{ contacts: Contact[] }>("/api/v1/contacts"),
          client
            .requestJson<{ organizations: Organization[] }>(
              "/api/v1/organizations",
            )
            .catch(() => ({ organizations: [] as Organization[] })),
        ]);
        if (cancelled) return;
        const contact = (contactsBody.contacts ?? []).find(
          (entry) => entry.id === contactId,
        );
        const orgNameById = new Map(
          (orgsBody.organizations ?? []).map((org) => [org.id, org.name]),
        );
        setRestOrgs(
          (orgsBody.organizations ?? []).map((org) => ({
            id: org.id,
            name: org.name,
          })),
        );
        setRestRow(
          contact
            ? {
                id: contact.id,
                number: contact.number,
                key: contact.key,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                title: contact.title,
                address: contact.address,
                city: contact.city,
                postal_code: contact.postalCode,
                country: contact.country,
                summary: contact.summary,
                avatar_storage_key: contact.avatarStorageKey,
                organization_id: contact.organizationId,
                organization_name: contact.organizationId
                  ? (orgNameById.get(contact.organizationId) ?? null)
                  : null,
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
  }, [client, contactId, powerSync.ready]);

  const contact = syncedRows?.[0] ?? (!powerSync.ready ? restRow : null);
  const organizations = organizationRows?.length
    ? organizationRows
    : restOrgs;

  const avatarStorageKey =
    avatarStorageKeyOverride ?? contact?.avatar_storage_key ?? null;

  const avatarSrcById = useEntityAvatarSrcMap(
    "contact",
    contact
      ? [
          {
            id: contact.id,
            avatarStorageKey,
          },
        ]
      : [],
    client,
  );

  useEffect(() => {
    setOrganizationId(contact?.organization_id ?? null);
  }, [contact?.organization_id, contactId]);

  useEffect(() => {
    if (!contact || !onDetailsLoadedRef.current) return;
    onDetailsLoadedRef.current({
      name: contact.name?.trim() || "",
      summary: contact.summary ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      title: contact.title ?? "",
      address: contact.address ?? "",
      city: contact.city ?? "",
      postalCode: contact.postal_code ?? "",
      country: contact.country ?? "",
    });
  }, [contact]);

  async function patchOrganization(nextId: string | null) {
    setPropertyError(null);
    try {
      const sqliteValues = { organization_id: nextId };
      const apiValues = { organizationId: nextId };
      if (powerSync.ready) {
        await powerSync.patchContact(contactId, sqliteValues);
        void client
          .requestJson<Contact>(
            `/api/v1/contacts/${encodeURIComponent(contactId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(apiValues),
            },
          )
          .catch(() => {});
      } else {
        await client.requestJson<Contact>(
          `/api/v1/contacts/${encodeURIComponent(contactId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(apiValues),
          },
        );
        setRestRow((prev) =>
          prev
            ? {
                ...prev,
                organization_id: nextId,
                organization_name:
                  nextId == null
                    ? null
                    : (organizations.find((entry) => entry.id === nextId)
                        ?.name ?? prev.organization_name),
              }
            : prev,
        );
      }
    } catch (reason) {
      setPropertyError(
        reason instanceof Error
          ? reason.message
          : "Could not update organization.",
      );
    }
  }

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
      if (powerSync.ready) {
        void powerSync
          .patchContact(contactId, {
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

  if (!contact && (useRest ? restLoading : syncLoading)) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!contact) {
    return <Text style={ui.error}>Contact not found.</Text>;
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

  const name = editing ? draftName : contact.name?.trim() || "Untitled";
  const title = editing ? draftTitle : contact.title?.trim() || "";
  const summary = editing
    ? draftSummary
    : contact.summary?.trim() || "";
  const displayId =
    contact.number != null
      ? `C-${contact.number}`
      : contact.key?.trim() || null;
  const address = formatAddress({
    address: editing ? draftAddress : contact.address,
    city: editing ? draftCity : contact.city,
    postalCode: editing ? draftPostalCode : contact.postal_code,
    country: editing ? draftCountry : contact.country,
  });
  const avatarSrc = avatarOverride ?? avatarSrcById[contact.id] ?? null;

  const profileFields = editing
    ? [
        {
          key: "organization",
          label: "Organization",
          value: organizationLabel || "Add organization",
          empty: !organizationLabel,
          icon: organizationLabel ? (
            <OrganizationIcon size={16} color={colors.muted} />
          ) : undefined,
          onPress: () => setPickerOpen(true),
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
          key: "phone",
          label: "Phone",
          value: draftPhone,
          onChangeText: onDraftPhoneChange,
          placeholder: "Phone",
          keyboardType: "phone-pad" as const,
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
          value: contact.email?.trim() || "—",
          empty: !contact.email?.trim(),
        },
        {
          key: "phone",
          label: "Phone",
          value: contact.phone?.trim() || "—",
          empty: !contact.phone?.trim(),
        },
        {
          key: "address",
          label: "Address",
          value: address || "—",
          empty: !address,
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
              placeholder="Contact name"
              placeholderTextColor={colors.muted}
              autoFocus
              style={profileStyles.nameInput}
            />
          ) : (
            <Text style={profileStyles.name}>{name}</Text>
          )}
          {editing ? (
            <TextInput
              value={draftTitle}
              onChangeText={onDraftTitleChange}
              placeholder="Title"
              placeholderTextColor={colors.muted}
              style={profileStyles.subtitleInput}
            />
          ) : title ? (
            <Text style={profileStyles.subtitle}>{title}</Text>
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
              scrollEnabled={false}
              style={profileStyles.summaryInput}
            />
          ) : summary ? (
            <Text style={profileStyles.summary}>{summary}</Text>
          ) : (
            <Text style={profileStyles.summaryEmpty}>No note yet.</Text>
          )}
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
          void patchOrganization(value);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
