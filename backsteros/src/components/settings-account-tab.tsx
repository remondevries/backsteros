import {
  coerceContactLanguages,
  type MapboxGeocodeResult,
  type MapboxSettings,
} from "@backsteros/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AvatarUpload,
  ContactDetailView,
  ContactRelationshipsListView,
  DROPDOWN_NONE_VALUE,
  SearchableDropdown,
  buildAssigneeDropdownOptions,
  formatContactAddressLine,
  getContactOverlayHref,
  getUniqueListItemRouteParam,
  normalizeAppTimezone,
  normalizeContactSocialAccounts,
  resolveCountryOption,
  type ContactLocationParts,
  type ContactOverviewDetails,
  type ContactSectionConfig,
  asCoord,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import {
  useDesktopAvatarSrcMap,
} from "../lib/avatar-src";
import {
  normalizeContactEmails,
  normalizeContactPhones,
} from "../lib/contact-row-normalizers";
import {
  DEFAULT_ASSIGNEE_SETTINGS_KEY,
  getDefaultAssigneeId,
  parseDefaultAssigneeIdFromSettings,
  setDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
import {
  useContactRelationships,
  useCrmGroupsForSubject,
  useCrmRelationshipLabels,
} from "../lib/use-crm-data";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

const ACCOUNT_PROFILE_SECTIONS: readonly ContactSectionConfig[] = [
  {
    id: "details",
    label: "Details",
    segment: "details",
    supportsDetail: false,
  },
];


export function SettingsAccountTab({
  settings,
  workspaceTimezone,
  onSettingsSaved,
}: {
  settings: Record<string, unknown> | undefined;
  workspaceTimezone: string;
  onSettingsSaved?: () => void;
}) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string) => {
      navigateToHref(routerNavigate, to);
    },
    [routerNavigate],
  );
  const contacts = workspace.contacts;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  const [assigneeId, setAssigneeId] = useState<string | null>(() =>
    getDefaultAssigneeId(),
  );
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(
    undefined,
  );
  const [mapboxConfigured, setMapboxConfigured] = useState(false);
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const synced = syncDefaultAssigneeIdFromSettings(settings);
    setAssigneeId(synced);

    const fromServer = parseDefaultAssigneeIdFromSettings(settings);
    if (fromServer !== undefined || !synced) return;
    void client
      .requestJson("/api/v1/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [DEFAULT_ASSIGNEE_SETTINGS_KEY]: synced }),
      })
      .then(() => onSettingsSaved?.())
      .catch(() => {
        // keep local value if migrate fails
      });
  }, [client, onSettingsSaved, settings]);

  const persistAssignee = useCallback(
    (value: string | null) => {
      setAssigneeId(value);
      setDefaultAssigneeId(value);
      setAvatarOverride(undefined);
      setSavingAssignee(true);
      void client
        .requestJson("/api/v1/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            [DEFAULT_ASSIGNEE_SETTINGS_KEY]: value,
          }),
        })
        .then(() => onSettingsSaved?.())
        .catch(() => {
          // keep optimistic local value offline
        })
        .finally(() => setSavingAssignee(false));
    },
    [client, onSettingsSaved],
  );

  const contact = useMemo(
    () =>
      assigneeId
        ? (contacts.find((entry) => entry.id === assigneeId) ?? null)
        : null,
    [assigneeId, contacts],
  );

  const details = contact
    ? (workspace.contactDetails[contact.id] ?? null)
    : null;

  const contactTimezone = useMemo(() => {
    const raw =
      details?.timezone?.trim() ||
      contact?.timezone?.trim() ||
      "";
    return raw ? normalizeAppTimezone(raw) : "";
  }, [contact?.timezone, details?.timezone]);

  const seededTimezoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!contact) {
      seededTimezoneRef.current = null;
      return;
    }
    if (contactTimezone) {
      if (contactTimezone !== workspaceTimezone) {
        void client
          .requestJson("/api/v1/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ timezone: contactTimezone }),
          })
          .then(() => onSettingsSaved?.())
          .catch(() => {
            // keep local contact value offline
          });
      }
      return;
    }
    if (seededTimezoneRef.current === contact.id) return;
    seededTimezoneRef.current = contact.id;
    void workspace.patchContact(contact.id, {
      timezone: workspaceTimezone,
    });
  }, [
    client,
    contact,
    contactTimezone,
    onSettingsSaved,
    workspace,
    workspaceTimezone,
  ]);

  useEffect(() => {
    setAvatarOverride((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
  }, [contact?.id]);

  const contactLatitude = asCoord(details?.latitude);
  const contactLongitude = asCoord(details?.longitude);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<MapboxSettings>(
          "/api/v1/settings/mapbox",
        );
        if (!cancelled) setMapboxConfigured(body.accessTokenConfigured);
      } catch {
        if (!cancelled) setMapboxConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    setGeocodeFailed(false);
  }, [contact?.id]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (
      contactLatitude == null ||
      contactLongitude == null ||
      !mapboxConfigured
    ) {
      setMapImageSrc((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setMapLoading(false);
      return;
    }

    setMapLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(contactLatitude),
          lng: String(contactLongitude),
          width: "640",
          height: "320",
        });
        const blob = await client.requestBinary(
          `/api/v1/mapbox/static-map?${params}`,
        );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
        setMapHint(null);
      } catch {
        if (cancelled) return;
        setMapImageSrc((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setMapHint("Couldn’t load the map image.");
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, contactLatitude, contactLongitude, mapboxConfigured]);

  useEffect(() => {
    const addressLine = formatContactAddressLine({
      address: details?.address ?? null,
      city: details?.city ?? null,
      postalCode: details?.postalCode ?? null,
      region: details?.region ?? null,
      country: details?.country ?? null,
    });
    if (contactLatitude != null && contactLongitude != null) {
      setMapHint(null);
      return;
    }
    if (!addressLine) {
      setMapHint(null);
      return;
    }
    if (!mapboxConfigured) {
      setMapHint(
        "Add a Mapbox token in Settings → Integrations to show this on a map.",
      );
      return;
    }
    if (geocodeFailed) {
      setMapHint("Couldn’t locate this address.");
      return;
    }
    setMapHint(null);
  }, [
    contactLatitude,
    contactLongitude,
    details?.address,
    details?.city,
    details?.country,
    details?.region,
    details?.postalCode,
    geocodeFailed,
    mapboxConfigured,
  ]);

  const resolveContactLocation = useCallback(
    async (contactId: string, parts: ContactLocationParts) => {
      const addressLine = formatContactAddressLine(parts);
      if (!addressLine) {
        setGeocodeFailed(false);
        await workspace.patchContact(contactId, {
          latitude: null,
          longitude: null,
          timezone: null,
        });
        return;
      }
      if (!mapboxConfigured) {
        setGeocodeFailed(false);
        return;
      }
      try {
        const params = new URLSearchParams({ q: addressLine });
        const countryCode = resolveCountryOption(parts.country)?.code;
        if (countryCode) {
          params.set("country", countryCode);
        }
        const body = await client.requestJson<{
          result: MapboxGeocodeResult | null;
        }>(`/api/v1/mapbox/geocode?${params}`);
        if (!body.result) {
          setGeocodeFailed(true);
          await workspace.patchContact(contactId, {
            latitude: null,
            longitude: null,
          });
          return;
        }
        setGeocodeFailed(false);
        await workspace.patchContact(contactId, {
          latitude: body.result.latitude,
          longitude: body.result.longitude,
        });
      } catch {
        setGeocodeFailed(true);
      }
    },
    [client, mapboxConfigured, workspace],
  );

  const relationships = useContactRelationships(
    contact?.id ?? null,
    Boolean(contact?.id),
  );
  const relationshipLabels = useCrmRelationshipLabels(Boolean(contact?.id));
  const crmGroups = useCrmGroupsForSubject(
    "contact",
    contact?.id ?? null,
    Boolean(contact?.id),
  );

  const groupOptions = useMemo(
    () =>
      crmGroups.allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      })),
    [crmGroups.allGroups],
  );
  const memberGroupIds = useMemo(
    () => crmGroups.memberGroups.map((group) => group.id),
    [crmGroups.memberGroups],
  );
  const appliedMemberGroupIdsRef = useRef(memberGroupIds);
  useEffect(() => {
    appliedMemberGroupIdsRef.current = memberGroupIds;
  }, [memberGroupIds]);
  const membershipSyncChainRef = useRef(Promise.resolve());

  const handleMemberGroupIdsChange = useCallback(
    (nextIds: string[]) => {
      const previous = new Set(appliedMemberGroupIdsRef.current);
      const next = new Set(nextIds);
      appliedMemberGroupIdsRef.current = nextIds;
      membershipSyncChainRef.current = membershipSyncChainRef.current
        .catch(() => {})
        .then(async () => {
          try {
            for (const groupId of next) {
              if (!previous.has(groupId)) {
                await crmGroups.toggleMembership(groupId, true);
              }
            }
            for (const groupId of previous) {
              if (!next.has(groupId)) {
                await crmGroups.toggleMembership(groupId, false);
              }
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Failed to update groups";
            const friendly =
              /subject not found|member subject|404/i.test(message)
                ? "This contact isn’t on the server yet, so it can’t join a group. Wait for sync or re-save the contact, then try again."
                : message;
            window.alert(friendly);
            await crmGroups.reload();
          }
        });
    },
    [crmGroups],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(contacts, {
        avatarSrcById: contactAvatarSrc,
      }),
    [contactAvatarSrc, contacts],
  );
  const switcherOptions = useMemo(
    () =>
      assigneeOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    [assigneeOptions],
  );

  const organizationOptions = useMemo(
    () =>
      workspace.organizations.map((org) => ({
        id: org.id,
        name: org.name,
        number: org.number,
        key: org.key,
        avatarSrc: organizationAvatarSrc[org.id] ?? null,
      })),
    [organizationAvatarSrc, workspace.organizations],
  );

  const syncedAvatarSrc = contact
    ? (contactAvatarSrc[contact.id] ?? null)
    : null;
  const avatarSrc =
    avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;

  if (!contact) {
    return (
      <section className="settings-card settings-account-empty">
        <h2>Your profile</h2>
        <p>
          Pick the contact that represents you. That contact is your account
          profile here and the default assignee for new tasks.
        </p>
        {contacts.length === 0 ? (
          <p className="settings-hint">
            Add a contact in Contacts, then choose it here.
          </p>
        ) : (
          <div className="settings-field">
            <span>Contact</span>
            <SearchableDropdown
              value={DROPDOWN_NONE_VALUE}
              options={assigneeOptions}
              onChange={(next) => {
                if (next === DROPDOWN_NONE_VALUE) return;
                persistAssignee(next);
              }}
              disabled={savingAssignee}
              searchPlaceholder="Choose your contact…"
              ariaLabel="Account contact"
            />
          </div>
        )}
      </section>
    );
  }

  const overviewContact = {
    id: contact.id,
    name: contact.name,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    displayId: contact.number != null ? `C-${contact.number}` : contact.key,
    email: details?.email ?? null,
    emails: normalizeContactEmails(details?.emails ?? contact.emails),
    phone: details?.phone ?? contact.phone ?? null,
    phones: normalizeContactPhones(details?.phones ?? contact.phones ?? []),
    title: details?.title ?? null,
    address: details?.address ?? null,
    city: details?.city ?? null,
    postalCode: details?.postalCode ?? null,
    country: details?.country ?? null,
    region: details?.region ?? null,
    timezone: contactTimezone || workspaceTimezone,
    latitude: contactLatitude,
    longitude: contactLongitude,
    organizationId: contact.organizationId ?? details?.organizationId,
    organizationName: contact.organizationName,
    summary: details?.summary ?? null,
    socialAccounts: normalizeContactSocialAccounts(details?.socialAccounts),
    birthday: details?.birthday ?? contact.birthday ?? null,
    languages: coerceContactLanguages(
      details?.languages ?? contact.languages ?? [],
    ),
  };

  return (
    <section className="settings-account-profile">
      <ContactDetailView
        contact={overviewContact}
        organizationOptions={organizationOptions}
        groupOptions={groupOptions}
        memberGroupIds={memberGroupIds}
        onMemberGroupIdsChange={handleMemberGroupIdsChange}
        sections={ACCOUNT_PROFILE_SECTIONS}
        section="details"
        showSectionNav={false}
        contactSwitcher={{
          options: switcherOptions,
          disabled: savingAssignee,
          onSelect: (nextId) => {
            persistAssignee(nextId);
          },
          onClear: () => {
            persistAssignee(null);
          },
        }}
        relationshipsSlot={
          <ContactRelationshipsListView
            items={relationships.items}
            loading={relationships.loading}
            error={relationships.error}
            relationshipLabels={relationshipLabels.labels}
            contactOptions={contacts
              .filter((entry) => entry.id !== contact.id)
              .map((entry) => ({
                id: entry.id,
                name: entry.name,
                avatarSrc:
                  contactAvatarSrc[entry.id] ?? entry.avatarSrc ?? null,
              }))}
            onSelectContact={(contactId) => {
              const target = contacts.find((entry) => entry.id === contactId);
              if (!target) return;
              navigate(
                getContactOverlayHref(
                  getUniqueListItemRouteParam(target, contacts),
                ),
              );
            }}
            onAdd={relationships.add}
            onRemove={relationships.remove}
            onCreateLabel={relationshipLabels.createLabel}
            onUpdateLabel={relationshipLabels.updateLabel}
            onDeleteLabel={relationshipLabels.deleteLabel}
          />
        }
        overviewHeaderAccessory={
          <AvatarUpload
            displayName={contact.name}
            avatarSrc={avatarSrc}
            shape="circle"
            showHint={false}
            onUpload={async (file) => {
              const result = await uploadDesktopAvatar(
                client,
                "contact",
                contact.id,
                file,
              );
              if (result.ok) {
                const url = URL.createObjectURL(file);
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return url;
                });
              }
              return result;
            }}
            onRemove={async () => {
              const result = await removeDesktopAvatar(
                client,
                "contact",
                contact.id,
              );
              if (result.ok) {
                setAvatarOverride((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return null;
                });
              }
              return result;
            }}
          />
        }
        onCreateOrganizationFromQuery={(query) => {
          void workspace.createOrganization({ name: query }).then((created) => {
            void workspace.patchContact(contact.id, {
              organizationId: created.id,
            });
          });
        }}
        onSaveFirstName={async (firstName) => {
          try {
            await workspace.patchContact(contact.id, { firstName });
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not save first name.",
            };
          }
        }}
        onSaveLastName={async (lastName) => {
          try {
            await workspace.patchContact(contact.id, { lastName });
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not save last name.",
            };
          }
        }}
        onSaveDetails={(patch: ContactOverviewDetails) => {
          void workspace.patchContact(contact.id, patch);
          if ("timezone" in patch) {
            const nextTimezone = patch.timezone?.trim()
              ? normalizeAppTimezone(patch.timezone)
              : workspaceTimezone;
            void client
              .requestJson("/api/v1/settings", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ timezone: nextTimezone }),
              })
              .then(() => onSettingsSaved?.())
              .catch(() => {
                // keep contact value offline
              });
          }
        }}
        onAfterLocationSave={(parts) => {
          void resolveContactLocation(contact.id, parts);
        }}
        mapImageSrc={mapImageSrc}
        mapLoading={mapLoading}
        mapHint={mapHint}
      />
    </section>
  );
}
