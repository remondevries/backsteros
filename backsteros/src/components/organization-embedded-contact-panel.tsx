import { useEffect, useMemo, useRef, useState } from "react";
import {
  coerceContactLanguages,
  formatContactDisplayName,
} from "@backsteros/contracts";

import {
  AvatarUpload,
  ContactDetailView,
  ContactRelationshipsListView,
  CrmActivityFeedView,
  asCoord,
  normalizeContactSocialAccounts,
  resolveContactCardSections,
  type ContactListItem,
  type ContactSectionId,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  normalizeContactEmails,
  normalizeContactPhones,
} from "../lib/contact-row-normalizers";
import { useContactPropertyHandlers } from "../lib/crm/use-crm-property-handlers";
import { useCrmSubjectGroupMembership } from "../lib/crm/use-crm-subject-group-membership";
import { useMapboxEntityLocation } from "../lib/crm/use-mapbox-entity-location";
import {
  useContactRelationships,
  useCrmActivityFeed,
  useCrmRelationshipLabels,
} from "../lib/use-crm-data";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export type OrganizationEmbeddedContactPanelProps = {
  contact: ContactListItem;
  /** Prefer Activity / Details (+ portal when client). */
  active: boolean;
  onSelectRelatedContact?: (contactId: string) => void;
};

/**
 * Contact profile card for the organization right rail — replaces the org
 * card when a contact is opened from the organization Contacts tab.
 */
export function OrganizationEmbeddedContactPanel({
  contact,
  active,
  onSelectRelatedContact,
}: OrganizationEmbeddedContactPanelProps) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const [cardSection, setCardSection] = useState<ContactSectionId>("overview");
  const [avatarOverride, setAvatarOverride] = useState<
    string | null | undefined
  >(undefined);

  useEffect(() => {
    setCardSection("overview");
    setAvatarOverride((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
  }, [contact.id]);

  const details = workspace.contactDetails[contact.id] ?? null;
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", [contact]);
  const syncedAvatarSrc = contactAvatarSrc[contact.id] ?? null;
  const avatarSrc =
    avatarOverride !== undefined ? avatarOverride : syncedAvatarSrc;

  const activityFeed = useCrmActivityFeed(
    "contact",
    contact.id,
    active && cardSection === "overview",
  );
  const relationships = useContactRelationships(
    contact.id,
    active && cardSection === "details",
  );
  const relationshipLabels = useCrmRelationshipLabels(
    active && cardSection === "details",
  );
  const {
    groupOptions,
    memberGroupIds,
    onMemberGroupIdsChange: handleMemberGroupIdsChange,
  } = useCrmSubjectGroupMembership({
    subjectType: "contact",
    subjectId: contact.id,
    enabled: active,
    notOnServerMessage:
      "This contact isn’t on the server yet, so it can’t join a group. Wait for sync or re-save the contact, then try again.",
  });

  // Keep the embedded rail to Activity / Details — Portal/Logs stay on the
  // full contacts surface so this panel matches the org card’s weight.
  const contactProfileSections = useMemo(
    () =>
      resolveContactCardSections({
        showPortal: false,
        showPortalLogs: false,
      }),
    [],
  );

  const latitude = asCoord(details?.latitude);
  const longitude = asCoord(details?.longitude);
  const contactDetailsRef = useRef(workspace.contactDetails);
  contactDetailsRef.current = workspace.contactDetails;
  const patchContact = workspace.patchContact;
  const {
    mapImageSrc,
    mapLoading,
    mapHint,
    resolveLocation: resolveContactLocation,
  } = useMapboxEntityLocation({
    active,
    entityId: contact.id,
    address: details
      ? {
          address: details.address ?? null,
          city: details.city ?? null,
          postalCode: details.postalCode ?? null,
          region: details.region ?? null,
          country: details.country ?? null,
        }
      : null,
    latitude,
    longitude,
    readCoordinates: (contactId) => contactDetailsRef.current[contactId],
    patchCoordinates: (contactId, coordinates) =>
      patchContact(contactId, coordinates),
    autoGeocodeMissingCoordinates: true,
  });

  const contactPropertyHandlers = useContactPropertyHandlers({
    client,
    contactId: contact.id,
    patchContact: workspace.patchContact,
    createOrganization: workspace.createOrganization,
    resolveLocation: resolveContactLocation,
    setAvatarOverride,
  });

  const organizationOptions = useMemo(
    () =>
      workspace.organizations.map((entry) => ({
        id: entry.id,
        name: entry.name,
      })),
    [workspace.organizations],
  );

  const displayName =
    formatContactDisplayName(contact.firstName ?? "", contact.lastName) ||
    contact.name;

  return (
    <ContactDetailView
      contact={{
        id: contact.id,
        name: contact.name,
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        displayId:
          contact.number != null ? `C-${contact.number}` : contact.key,
        email: details?.email ?? contact.email ?? null,
        emails: normalizeContactEmails(details?.emails ?? contact.emails),
        phone: details?.phone ?? contact.phone ?? null,
        phones: normalizeContactPhones(
          details?.phones ?? contact.phones ?? [],
        ),
        title: details?.title ?? contact.title ?? null,
        address: details?.address ?? null,
        city: details?.city ?? null,
        postalCode: details?.postalCode ?? null,
        country: details?.country ?? null,
        region: details?.region ?? null,
        timezone: details?.timezone ?? null,
        latitude,
        longitude,
        organizationId: contact.organizationId ?? details?.organizationId,
        organizationName: contact.organizationName,
        summary: details?.summary ?? null,
        socialAccounts: normalizeContactSocialAccounts(
          details?.socialAccounts,
        ),
        birthday: details?.birthday ?? contact.birthday ?? null,
        languages: coerceContactLanguages(
          details?.languages ?? contact.languages ?? [],
        ),
      }}
      organizationOptions={organizationOptions}
      groupOptions={groupOptions}
      memberGroupIds={memberGroupIds}
      onMemberGroupIdsChange={handleMemberGroupIdsChange}
      sections={contactProfileSections}
      section={cardSection}
      onSectionChange={setCardSection}
      relationshipsSlot={
        <ContactRelationshipsListView
          items={relationships.items}
          loading={relationships.loading}
          error={relationships.error}
          relationshipLabels={relationshipLabels.labels}
          contactOptions={workspace.contacts
            .filter((entry) => entry.id !== contact.id)
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              avatarSrc: entry.avatarSrc ?? null,
            }))}
          onSelectContact={(contactId) => {
            onSelectRelatedContact?.(contactId);
          }}
          onAdd={relationships.add}
          onRemove={relationships.remove}
          onCreateLabel={relationshipLabels.createLabel}
          onUpdateLabel={relationshipLabels.updateLabel}
          onDeleteLabel={relationshipLabels.deleteLabel}
        />
      }
      activitySlot={
        <CrmActivityFeedView
          items={activityFeed.items}
          loading={activityFeed.loading}
          error={activityFeed.error}
          nextCursor={activityFeed.nextCursor}
          onLoadMore={activityFeed.loadMore}
          onSubmitNote={activityFeed.submitNote}
        />
      }
      onCreateOrganizationFromQuery={
        contactPropertyHandlers.onCreateOrganizationFromQuery
      }
      overviewHeaderAccessory={
        <AvatarUpload
          displayName={displayName}
          avatarSrc={avatarSrc}
          shape="cover"
          showHint={false}
          onUpload={contactPropertyHandlers.onUploadAvatar}
          onRemove={contactPropertyHandlers.onRemoveAvatar}
        />
      }
      onSaveFirstName={contactPropertyHandlers.onSaveFirstName}
      onSaveLastName={contactPropertyHandlers.onSaveLastName}
      onSaveDetails={contactPropertyHandlers.onSaveDetails}
      onAfterLocationSave={contactPropertyHandlers.onAfterLocationSave}
      mapImageSrc={mapImageSrc}
      mapLoading={mapLoading}
      mapHint={mapHint}
    />
  );
}
