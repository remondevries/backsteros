import {
  classifyStoredEmailMessageParty,
  matchEmailMessageParty,
  type EmailMessagePartyLink,
  type EmailMessagePartyMap,
} from "../email/email-message-party.js";

/** Party for one thread message as seen by the Communication right rail. */
export type CommunicationEmailActiveParty = {
  messageId: string;
  address: string | null;
  /** Display name from the From/To header when present (not a linked contact). */
  displayName: string | null;
  contactId: string | null;
  organizationId: string | null;
};

type PartyDirectory = Parameters<typeof matchEmailMessageParty>[0];

export type ResolveCommunicationEmailPartyInput = {
  /** New-email compose or an open standalone draft. */
  isComposing: boolean;
  composeParty: EmailMessagePartyLink;
  composePartyEmail: string | null;
  /** Latest thread message (list card identity). */
  activeParty: CommunicationEmailActiveParty | null;
  /** Selected thread message (rail follows this one). */
  selectedParty: CommunicationEmailActiveParty | null;
  messageParties: EmailMessagePartyMap;
  /** Party address from the list row when the thread has not hydrated yet. */
  fallbackPartyEmail: string | null;
  contacts: PartyDirectory["contacts"];
  organizations: PartyDirectory["organizations"];
};

export type ResolvedCommunicationEmailParty = {
  /** Message the rail is focused on (selected, else latest); null in compose. */
  focusParty: CommunicationEmailActiveParty | null;
  /** Party for the latest message — drives the left-list card. */
  latestMessageParty: EmailMessagePartyLink | null;
  /** Party the rail shows and link/unlink edits. */
  selectedMessageParty: EmailMessagePartyLink | null;
  /** Address shown on the rail (compose To, or focused From). */
  emailPartyEmail: string | null;
};

function isUnlink(party: EmailMessagePartyLink): boolean {
  return !party.contactId?.trim() && !party.organizationId?.trim();
}

/**
 * Resolve which contact/org the Communication email rail shows.
 *
 * Order: explicit unlink wins; then a From soft-match when there is no stored
 * party or the stored party is a mismatch; then the stored manual link; then
 * the thread-reported party.
 */
export function resolveCommunicationEmailParty(
  input: ResolveCommunicationEmailPartyInput,
): ResolvedCommunicationEmailParty {
  if (input.isComposing) {
    return {
      focusParty: null,
      latestMessageParty: input.composeParty,
      selectedMessageParty: input.composeParty,
      emailPartyEmail: input.composePartyEmail,
    };
  }

  const active = input.activeParty;
  const latestMessageParty = active
    ? (input.messageParties[active.messageId] ?? {
        contactId: active.contactId,
        organizationId: active.organizationId,
      })
    : null;

  const focusParty = input.selectedParty ?? active;
  const focusMessageId = focusParty?.messageId?.trim() || null;
  const focusStoredParty =
    focusMessageId &&
    Object.prototype.hasOwnProperty.call(input.messageParties, focusMessageId)
      ? input.messageParties[focusMessageId]!
      : null;
  const focusAddress = focusParty?.address?.trim() || null;

  let selectedMessageParty: EmailMessagePartyLink | null;
  if (focusStoredParty && isUnlink(focusStoredParty)) {
    selectedMessageParty = focusStoredParty;
  } else {
    const storedFit = focusStoredParty
      ? classifyStoredEmailMessageParty({
          party: focusStoredParty,
          address: focusAddress,
          contacts: input.contacts,
          organizations: input.organizations,
        })
      : null;
    const needsAddressMatch =
      Boolean(focusAddress) && (!focusStoredParty || storedFit === "mismatch");
    const softMatch = needsAddressMatch
      ? matchEmailMessageParty({
          address: focusAddress,
          contacts: input.contacts,
          organizations: input.organizations,
        })
      : null;
    selectedMessageParty =
      softMatch ??
      // Mismatch with no From match: keep the manual org/contact.
      focusStoredParty ??
      (focusParty
        ? {
            contactId: focusParty.contactId,
            organizationId: focusParty.organizationId,
          }
        : latestMessageParty);
  }

  return {
    focusParty,
    latestMessageParty,
    selectedMessageParty,
    emailPartyEmail: focusAddress || input.fallbackPartyEmail,
  };
}

/** Apply a link/unlink to the active or selected party when it is that message. */
export function applyCommunicationEmailPartyLink(
  prev: CommunicationEmailActiveParty | null,
  messageId: string,
  next: EmailMessagePartyLink,
): CommunicationEmailActiveParty {
  if (!prev) {
    return { messageId, address: null, displayName: null, ...next };
  }
  return prev.messageId === messageId ? { ...prev, ...next } : prev;
}
