import {
  brandfetchLogoUrlFromEmailAddress,
  emailListItemPartyEmail,
  matchEmailMessageParty,
  resolveOrganizationAvatarSrc,
  type InboxEmailListItem,
} from "@backsteros/ui";

type AvatarContact = {
  id: string;
  name?: string | null;
  organizationId?: string | null;
  email?: string | null;
  emails?: readonly { address?: string | null }[] | null;
  avatarSrc?: string | null;
};

type AvatarOrganization = {
  id: string;
  website?: string | null;
  avatarStorageKey?: string | null;
  email?: string | null;
  emails?: readonly { address?: string | null }[] | null;
};

/**
 * List-card avatar for an email row — same priority as the open thread:
 * filed contact → filed org → soft-matched party → Brandfetch domain.
 * Soft-match / Brandfetch keep logos visible after leaving the thread (the open
 * row used to inject orgId only while selected).
 *
 * Do not fall back to `mailboxAvatarSrc` — on Messages that is our mailbox
 * contact face, which wrongly replaces the thread’s other-party avatar.
 */
export function resolveEmailListAvatarSrc(input: {
  item: InboxEmailListItem;
  contacts: readonly AvatarContact[];
  organizations: readonly AvatarOrganization[];
  contactAvatarSrc: Record<string, string>;
  organizationUploadedSrc: Record<string, string>;
  brandfetchClientId: string | null | undefined;
}): string | null {
  const {
    item,
    contacts,
    organizations,
    contactAvatarSrc,
    organizationUploadedSrc,
    brandfetchClientId,
  } = input;

  const resolveOrg = (organizationId: string | null | undefined): string | null => {
    const id = organizationId?.trim();
    if (!id) return null;
    const organization =
      organizations.find((entry) => entry.id === id) ?? null;
    return resolveOrganizationAvatarSrc({
      uploadedSrc: organizationUploadedSrc[id] ?? null,
      avatarStorageKey: organization?.avatarStorageKey,
      website: organization?.website,
      brandfetchClientId,
    });
  };

  const resolveContact = (contactId: string | null | undefined): string | null => {
    const id = contactId?.trim();
    if (!id) return null;
    const contact = contacts.find((entry) => entry.id === id) ?? null;
    const uploaded =
      contactAvatarSrc[id] ?? contact?.avatarSrc?.trim() ?? null;
    if (uploaded?.trim()) return uploaded;
    return resolveOrg(contact?.organizationId);
  };

  const filedContact = resolveContact(item.contactId);
  if (filedContact) return filedContact;

  const filedOrg = resolveOrg(item.organizationId);
  if (filedOrg) return filedOrg;

  const partyEmail = emailListItemPartyEmail(item);
  const matched = matchEmailMessageParty({
    address: partyEmail,
    contacts,
    organizations,
  });
  if (matched?.contactId) {
    const matchedContact = resolveContact(matched.contactId);
    if (matchedContact) return matchedContact;
  }
  if (matched?.organizationId) {
    const matchedOrg = resolveOrg(matched.organizationId);
    if (matchedOrg) return matchedOrg;
  }

  return brandfetchLogoUrlFromEmailAddress(partyEmail, brandfetchClientId);
}
