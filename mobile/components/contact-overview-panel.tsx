import { formatContactDisplayName } from "@backsteros/contracts";
import type {
  ContactEmailEntry,
  ContactPhoneEntry,
} from "@backsteros/contracts";
import {
  coerceContactEmailEntries,
  coerceContactPhoneEntries,
} from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  pickAvatarImage,
  patchAvatarMetadataLocally,
  uploadAvatarFromUri,
} from "../lib/avatar-upload";
import {
  formatBirthdayAgeLabel,
  formatBirthdayLabel,
} from "../lib/birthday";
import { organizationDetailHref } from "../lib/detail-href";
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
import { ContactCrmSections } from "./contact-crm-sections";
import { ContactEmailsEditor } from "./contact-emails-editor";
import { ContactPhonesEditor } from "./contact-phones-editor";
import {
  ContactSocialAccountsEditor,
  type ContactSocialAccount,
} from "./contact-social-accounts-editor";
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
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  emails: string | null;
  phone: string | null;
  phones: string | null;
  title: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  summary: string | null;
  birthday: string | null;
  social_accounts: string | null;
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
  c.id, c.number, c.key, c.name, c.first_name, c.last_name,
  c.email, c.emails, c.phone, c.phones, c.title,
  c.address, c.city, c.postal_code, c.country, c.summary, c.birthday,
  c.social_accounts, c.avatar_storage_key, c.organization_id,
  o.name AS organization_name
 FROM contacts c
 LEFT JOIN organizations o ON o.id = c.organization_id
 WHERE c.deleted_at IS NULL AND c.id = ?
 LIMIT 1`;

type ContactFields = {
  firstName: string;
  lastName: string;
  summary: string;
  email: string;
  emails: ContactEmailEntry[];
  phone: string;
  phones: ContactPhoneEntry[];
  socialAccounts: ContactSocialAccount[];
  title: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  birthday: string;
};

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseEmails(
  email: string | null | undefined,
  emailsRaw: string | null | undefined,
): { email: string; emails: ContactEmailEntry[] } {
  const emails = coerceContactEmailEntries(
    parseJsonArray(emailsRaw) as Parameters<
      typeof coerceContactEmailEntries
    >[0],
  );
  return { email: email?.trim() || "", emails };
}

function parsePhones(
  phone: string | null | undefined,
  phonesRaw: string | null | undefined,
): { phone: string; phones: ContactPhoneEntry[] } {
  const phones = coerceContactPhoneEntries(
    parseJsonArray(phonesRaw) as Parameters<
      typeof coerceContactPhoneEntries
    >[0],
  );
  return { phone: phone?.trim() || "", phones };
}

function parseSocialAccounts(
  raw: string | null | undefined,
): ContactSocialAccount[] {
  const out: ContactSocialAccount[] = [];
  for (const entry of parseJsonArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const platform =
      typeof (entry as { platform?: unknown }).platform === "string"
        ? (entry as { platform: string }).platform.trim()
        : "";
    const url =
      typeof (entry as { url?: unknown }).url === "string"
        ? (entry as { url: string }).url.trim()
        : "";
    if (!platform || !url) continue;
    out.push({ platform, url });
  }
  return out;
}

/**
 * Contact Details tab — identity + CRM fields (desktop Details parity).
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
    firstName: "",
    lastName: "",
    summary: "",
    email: "",
    emails: [],
    phone: "",
    phones: [],
    socialAccounts: [],
    title: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    birthday: "",
  });
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
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
    const emailFields = parseEmails(contact.email, contact.emails);
    const phoneFields = parsePhones(contact.phone, contact.phones);
    const next: ContactFields = {
      firstName:
        contact.first_name?.trim() ||
        contact.name?.trim().split(/\s+/)[0] ||
        "",
      lastName:
        contact.last_name?.trim() ||
        contact.name?.trim().split(/\s+/).slice(1).join(" ") ||
        "",
      summary: contact.summary ?? "",
      email: emailFields.email,
      emails: emailFields.emails,
      phone: phoneFields.phone,
      phones: phoneFields.phones,
      socialAccounts: parseSocialAccounts(contact.social_accounts),
      title: contact.title ?? "",
      address: contact.address ?? "",
      city: contact.city ?? "",
      postalCode: contact.postal_code ?? "",
      country: contact.country ?? "",
      birthday: contact.birthday?.trim().slice(0, 10) ?? "",
    };
    setFields(next);
    setOrganizationId(contact.organization_id ?? null);
    onNameChangeRef.current?.(
      formatContactDisplayName(next.firstName, next.lastName) || "Untitled",
    );
  }, [contact, contactId]);

  const avatarStorageKey =
    avatarStorageKeyOverride ?? contact?.avatar_storage_key ?? null;

  const avatarSrcById = useEntityAvatarSrcMap(
    "contact",
    contact ? [{ id: contact.id, avatarStorageKey }] : [],
    client,
  );

  const persist = useCallback(
    async (
      patch: Partial<ContactFields> & { organizationId?: string | null },
    ) => {
      setSaveError(null);
      const apiBody: Record<string, unknown> = {};
      const sqliteValues: Record<string, unknown> = {};

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

      if (patch.firstName !== undefined || patch.lastName !== undefined) {
        const firstName = (
          patch.firstName ?? fieldsRef.current.firstName
        ).trim();
        const lastName = (patch.lastName ?? fieldsRef.current.lastName).trim();
        const display =
          formatContactDisplayName(firstName, lastName) || firstName;
        apiBody.firstName = firstName;
        apiBody.lastName = lastName;
        apiBody.name = display;
        sqliteValues.first_name = firstName;
        sqliteValues.last_name = lastName;
        sqliteValues.name = display;
      }
      if (patch.birthday !== undefined) {
        const trimmed = patch.birthday.trim().slice(0, 10) || null;
        apiBody.birthday = trimmed;
        sqliteValues.birthday = trimmed;
      }
      mapField("summary", "summary", patch.summary);
      mapField("title", "title", patch.title);
      mapField("address", "address", patch.address);
      mapField("city", "city", patch.city);
      mapField("postalCode", "postal_code", patch.postalCode);
      mapField("country", "country", patch.country);

      if (patch.email !== undefined || patch.emails !== undefined) {
        const email = (patch.email ?? fieldsRef.current.email).trim() || null;
        const emails = patch.emails ?? fieldsRef.current.emails;
        apiBody.email = email;
        apiBody.emails = emails;
        sqliteValues.email = email;
        sqliteValues.emails = JSON.stringify(emails);
      }
      if (patch.phone !== undefined || patch.phones !== undefined) {
        const phone = (patch.phone ?? fieldsRef.current.phone).trim() || null;
        const phones = patch.phones ?? fieldsRef.current.phones;
        apiBody.phone = phone;
        apiBody.phones = phones;
        sqliteValues.phone = phone;
        sqliteValues.phones = JSON.stringify(phones);
      }
      if (patch.socialAccounts !== undefined) {
        apiBody.socialAccounts = patch.socialAccounts;
        sqliteValues.social_accounts = JSON.stringify(patch.socialAccounts);
      }

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
        if (patch.firstName !== undefined || patch.lastName !== undefined) {
          const display =
            formatContactDisplayName(
              (patch.firstName ?? fieldsRef.current.firstName).trim(),
              (patch.lastName ?? fieldsRef.current.lastName).trim(),
            ) || "Untitled";
          onNameChangeRef.current?.(display);
        }
      } catch (reason) {
        setSaveError(
          formatMobileUserFacingError(reason, "Could not save contact."),
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
        formatMobileUserFacingError(reason, "Could not update photo."),
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

  const displayName =
    formatContactDisplayName(fields.firstName, fields.lastName) || "Untitled";
  const birthdayLabel = formatBirthdayLabel(fields.birthday);
  const birthdayAge = formatBirthdayAgeLabel(fields.birthday);

  const profileFields = [
    {
      key: "firstName",
      label: "First name",
      value: fields.firstName,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, firstName: value })),
      onBlur: () => void persist({ firstName: fields.firstName }),
      placeholder: "First name",
      autoCapitalize: "words" as const,
    },
    {
      key: "lastName",
      label: "Last name",
      value: fields.lastName,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, lastName: value })),
      onBlur: () => void persist({ lastName: fields.lastName }),
      placeholder: "Last name",
      autoCapitalize: "words" as const,
    },
    {
      key: "birthday",
      label: "Birthday",
      value: fields.birthday,
      onChangeText: (value: string) =>
        setFields((prev) => ({ ...prev, birthday: value })),
      onBlur: () => void persist({ birthday: fields.birthday }),
      placeholder: "YYYY-MM-DD",
      autoCapitalize: "none" as const,
    },
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
          paddingBottom: 40,
        }}
        keepEndVisibleWhileTyping
      >
        <View style={profileStyles.header}>
          <EntityProfileAvatar
            kind="contact"
            name={displayName}
            src={avatarSrc}
            onPressEdit={() => void onChangeAvatar()}
            uploading={uploadingAvatar || pickingAvatar}
          />
          {displayId ? (
            <Text style={profileStyles.displayId}>{displayId}</Text>
          ) : null}
          <Text style={profileStyles.name}>{displayName}</Text>
          {birthdayLabel ? (
            <Text style={profileStyles.subtitleInput}>
              {birthdayLabel}
              {birthdayAge ? ` · ${birthdayAge}` : ""}
            </Text>
          ) : null}
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

        <View style={styles.editorBlock}>
          <Text style={styles.editorLabel}>Email</Text>
          <ContactEmailsEditor
            email={fields.email}
            emails={fields.emails}
            onChange={(next) =>
              setFields((prev) => ({
                ...prev,
                email: next.email,
                emails: next.emails,
              }))
            }
            onSave={(next) =>
              void persist({
                email: next.email ?? "",
                emails: next.emails,
              })
            }
          />
        </View>

        <View style={styles.editorBlock}>
          <Text style={styles.editorLabel}>Phone</Text>
          <ContactPhonesEditor
            phone={fields.phone}
            phones={fields.phones}
            onChange={(next) =>
              setFields((prev) => ({
                ...prev,
                phone: next.phone,
                phones: next.phones,
              }))
            }
            onSave={(next) =>
              void persist({
                phone: next.phone ?? "",
                phones: next.phones,
              })
            }
          />
        </View>

        <View style={styles.editorBlock}>
          <Text style={styles.editorLabel}>Social</Text>
          <ContactSocialAccountsEditor
            value={fields.socialAccounts}
            onChange={(next) =>
              setFields((prev) => ({ ...prev, socialAccounts: next }))
            }
            onSave={(next) => void persist({ socialAccounts: next })}
          />
        </View>

        <ContactCrmSections contactId={contactId} />

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

const styles = StyleSheet.create({
  editorBlock: {
    gap: 8,
    paddingHorizontal: 16,
  },
  editorLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
