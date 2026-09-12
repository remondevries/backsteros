import {
  contactEmailRowsForEditor,
  contactPhoneRowsForEditor,
  normalizeOrganizationEmailsInput,
  normalizeOrganizationPhonesInput,
} from "@backsteros/contracts";

import type { ContactListItem } from "../navigation/entity-routes.js";
import type { OrganizationListItem } from "../navigation/entity-routes.js";
import {
  getContactsHref,
  getOrganizationsHref,
  getUniqueListItemRouteParam,
} from "../navigation/entity-routes.js";
import type {
  SupportContactCardModel,
  SupportOrganizationCardModel,
  SupportPartyEmail,
  SupportPartyPhone,
} from "../components/tasks/support-party-card-types.js";

export type SupportPartyTaskLike = {
  contactId?: string | null;
  relatedContactIds?: string[] | null;
  relatedOrganizationIds?: string[] | null;
};

export type ResolveSupportPartiesInput = {
  task: SupportPartyTaskLike;
  contacts: readonly ContactListItem[];
  organizations: readonly OrganizationListItem[];
  contactAvatarSrc?: Record<string, string | null | undefined>;
  organizationAvatarSrc?: Record<string, string | null | undefined>;
};

export type ResolvedSupportParties = {
  contact: SupportContactCardModel | null;
  organization: SupportOrganizationCardModel | null;
  contactHref: string | null;
  organizationHref: string | null;
};

function firstId(ids: string[] | null | undefined): string | null {
  if (!ids?.length) return null;
  const id = ids.find((entry) => entry.trim().length > 0);
  return id?.trim() || null;
}

function contactEmails(contact: ContactListItem): SupportPartyEmail[] {
  return contactEmailRowsForEditor(contact)
    .filter((entry) => entry.address.trim().length > 0)
    .map((entry) => ({
      label: entry.label,
      address: entry.address,
    }));
}

function contactPhones(contact: ContactListItem): SupportPartyPhone[] {
  return contactPhoneRowsForEditor(contact)
    .filter((entry) => entry.number.trim().length > 0)
    .map((entry) => ({
      label: entry.label,
      number: entry.number,
    }));
}

function organizationEmails(
  organization: OrganizationListItem,
): SupportPartyEmail[] {
  return normalizeOrganizationEmailsInput({
    email: organization.email,
    emails: organization.emails,
  }).emails
    .filter((entry) => entry.address.trim().length > 0)
    .map((entry) => ({
      label: entry.label,
      address: entry.address,
    }));
}

function organizationPhones(
  organization: OrganizationListItem,
): SupportPartyPhone[] {
  return normalizeOrganizationPhonesInput({
    phone: organization.phone,
    phones: organization.phones,
  }).phones
    .filter((entry) => entry.number.trim().length > 0)
    .map((entry) => ({
      label: entry.label,
      number: entry.number,
    }));
}

function toContactModel(
  contact: ContactListItem,
  avatarSrc?: string | null,
): SupportContactCardModel {
  return {
    id: contact.id,
    name: contact.name,
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title,
    organizationName: contact.organizationName,
    avatarSrc: avatarSrc ?? contact.avatarSrc ?? null,
    emails: contactEmails(contact),
    phones: contactPhones(contact),
    address: contact.address,
    city: contact.city,
    postalCode: contact.postalCode,
    region: contact.region,
    country: contact.country,
  };
}

function toOrganizationModel(
  organization: OrganizationListItem,
  avatarSrc?: string | null,
): SupportOrganizationCardModel {
  return {
    id: organization.id,
    name: organization.name,
    avatarSrc: avatarSrc ?? organization.avatarSrc ?? null,
    website: organization.website ?? null,
    emails: organizationEmails(organization),
    phones: organizationPhones(organization),
    address: organization.address,
    city: organization.city,
    postalCode: organization.postalCode,
    region: organization.region,
    country: organization.country,
  };
}

/**
 * Pick the primary client contact + organization for a support ticket card.
 * Contact: relatedContactIds[0] → contactId.
 * Organization: relatedOrganizationIds[0] → contact.organizationId.
 */
export function resolveSupportParties(
  input: ResolveSupportPartiesInput,
): ResolvedSupportParties {
  const contactsById = new Map(
    input.contacts.map((contact) => [contact.id, contact]),
  );
  const organizationsById = new Map(
    input.organizations.map((organization) => [organization.id, organization]),
  );

  const contactId =
    firstId(input.task.relatedContactIds) ??
    (input.task.contactId?.trim() || null);
  const contact = contactId ? (contactsById.get(contactId) ?? null) : null;

  const organizationId =
    firstId(input.task.relatedOrganizationIds) ??
    (contact?.organizationId?.trim() || null);
  const organization = organizationId
    ? (organizationsById.get(organizationId) ?? null)
    : null;

  const contactHref = contact
    ? getContactsHref(
        getUniqueListItemRouteParam(contact, input.contacts),
      )
    : null;
  const organizationHref = organization
    ? getOrganizationsHref(
        getUniqueListItemRouteParam(organization, input.organizations),
      )
    : null;

  return {
    contact: contact
      ? toContactModel(
          contact,
          input.contactAvatarSrc?.[contact.id] ?? contact.avatarSrc,
        )
      : null,
    organization: organization
      ? toOrganizationModel(
          organization,
          input.organizationAvatarSrc?.[organization.id] ??
            organization.avatarSrc,
        )
      : null,
    contactHref,
    organizationHref,
  };
}
