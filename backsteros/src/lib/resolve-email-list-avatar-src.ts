import {
  brandfetchLogoUrlFromEmailAddress,
  contactHasEmailAddress,
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
 * List-card avatar for an email row — must match the name on the card.
 *
 * The card name prefers `contactId` / `contactName` (counterparty). Avatar
 * must follow that same person — never our mailbox face just because the
 * collapsed `from` / party-label email is an outbound address of ours.
 *
 * Do not fall back to `mailboxAvatarSrc`.
 */
export function resolveEmailListAvatarSrc(input: {
  item: InboxEmailListItem;
  contacts: readonly AvatarContact[];
  organizations: readonly AvatarOrganization[];
  contactAvatarSrc: Record<string, string>;
  organizationUploadedSrc: Record<string, string>;
  brandfetchClientId: string | null | undefined;
  /** Our mailbox-linked contact ids — skipped when a counterparty matches. */
  mailboxContactIds?: ReadonlySet<string>;
}): string | null {
  const {
    item,
    contacts,
    organizations,
    contactAvatarSrc,
    organizationUploadedSrc,
    brandfetchClientId,
    mailboxContactIds,
  } = input;

  const resolveOrg = (
    organizationId: string | null | undefined,
  ): string | null => {
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

  const resolveContact = (
    contactId: string | null | undefined,
  ): string | null => {
    const id = contactId?.trim();
    if (!id) return null;
    const contact = contacts.find((entry) => entry.id === id) ?? null;
    const uploaded =
      contactAvatarSrc[id] ?? contact?.avatarSrc?.trim() ?? null;
    if (uploaded?.trim()) return uploaded;
    return resolveOrg(contact?.organizationId);
  };

  const filedId = item.contactId?.trim() || null;
  const filedIsMailbox = Boolean(
    filedId && mailboxContactIds?.has(filedId),
  );

  // Card name comes from contactId/contactName — prefer that face first when
  // it is a counterparty (not our mailbox contact).
  if (filedId && !filedIsMailbox) {
    const filedAvatar = resolveContact(filedId);
    if (filedAvatar) return filedAvatar;
  }

  const partyEmail = emailListItemPartyEmail(item);
  const matched = matchEmailMessageParty({
    address: partyEmail,
    contacts,
    organizations,
  });
  if (matched?.contactId) {
    const matchedIsMailbox = Boolean(
      mailboxContactIds?.has(matched.contactId),
    );
    // Party-label email can still be our outbound From while the name is the
    // counterparty — never let that soft-match paint our face on their row.
    if (!(matchedIsMailbox && filedId && !filedIsMailbox)) {
      const matchedContact = resolveContact(matched.contactId);
      if (matchedContact) return matchedContact;
      // Same person, no uploaded face — stop here (brandfetch below) instead
      // of falling through to a different filed contact.
      const matchedPerson = contacts.find(
        (entry) => entry.id === matched.contactId,
      );
      const matchedOrg = resolveOrg(matchedPerson?.organizationId);
      if (matchedOrg) return matchedOrg;
      return brandfetchLogoUrlFromEmailAddress(partyEmail, brandfetchClientId);
    }
  }
  if (matched?.organizationId) {
    const matchedOrg = resolveOrg(matched.organizationId);
    if (matchedOrg) return matchedOrg;
  }

  // Skip our mailbox filing when the party line points at someone else.
  if (filedId && !(filedIsMailbox && partyEmail)) {
    const filedContact =
      contacts.find((entry) => entry.id === filedId) ?? null;
    if (
      !partyEmail ||
      !filedContact ||
      contactHasEmailAddress(filedContact, partyEmail)
    ) {
      const filedAvatar = resolveContact(filedId);
      if (filedAvatar) return filedAvatar;
    }
  }

  const filedOrg = resolveOrg(item.organizationId);
  if (filedOrg) return filedOrg;

  return brandfetchLogoUrlFromEmailAddress(partyEmail, brandfetchClientId);
}
