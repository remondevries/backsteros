import {
  contactMatchesEmailAddress,
  findContactByEmailAddress,
  parseBareEmailAddress,
} from "@backsteros/contracts";

import { parseReplyToAddress } from "./email.js";

export type EmailMessagePartyLink = {
  contactId: string | null;
  organizationId: string | null;
};

export type EmailMessagePartyMap = Record<string, EmailMessagePartyLink>;

type MatchableContact = {
  id: string;
  organizationId?: string | null;
  email?: string | null;
  emails?: readonly { address?: string | null }[] | null;
};

type MatchableOrganization = {
  id: string;
  email?: string | null;
  emails?: readonly { address?: string | null }[] | null;
};

/**
 * External party address for linking — received uses From; sent uses the first
 * To that is not our mailbox.
 */
export function resolveEmailMessagePartyAddress(input: {
  from?: string | null;
  to?: readonly string[] | null;
  isSent: boolean;
  ourMailboxEmails: ReadonlySet<string>;
}): string | null {
  if (input.isSent) {
    for (const raw of input.to ?? []) {
      const address = parseReplyToAddress(raw).trim().toLowerCase();
      if (!address.includes("@")) continue;
      if (input.ourMailboxEmails.has(address)) continue;
      return parseReplyToAddress(raw).trim() || null;
    }
    return null;
  }
  const from = parseReplyToAddress(input.from ?? "").trim();
  return from.includes("@") ? from : null;
}

function organizationMatchesEmailAddress(
  organization: MatchableOrganization,
  address: string,
): boolean {
  const needle = parseBareEmailAddress(address);
  if (!needle) return false;
  const primary = organization.email?.trim();
  if (primary && parseBareEmailAddress(primary) === needle) return true;
  for (const entry of organization.emails ?? []) {
    const value = entry.address?.trim();
    if (value && parseBareEmailAddress(value) === needle) return true;
  }
  return false;
}

/** Match a party address to a contact first, else an organization by email. */
export function matchEmailMessageParty(input: {
  address: string | null | undefined;
  contacts: readonly MatchableContact[];
  organizations: readonly MatchableOrganization[];
}): EmailMessagePartyLink | null {
  const address = input.address?.trim();
  if (!address) return null;

  const contact = findContactByEmailAddress(input.contacts, address);
  if (contact) {
    return {
      contactId: contact.id,
      organizationId: contact.organizationId?.trim() || null,
    };
  }

  const organization = input.organizations.find((entry) =>
    organizationMatchesEmailAddress(entry, address),
  );
  if (organization) {
    return { contactId: null, organizationId: organization.id };
  }

  return null;
}

/**
 * Propose auto-link parties for messages that have no stored party yet.
 * Does not overwrite existing map entries.
 */
export function buildEmailMessagePartyAutoLinks(input: {
  messages: readonly {
    messageId: string;
    from?: string | null;
    to?: readonly string[] | null;
  }[];
  ourMailboxEmails: ReadonlySet<string>;
  contacts: readonly MatchableContact[];
  organizations: readonly MatchableOrganization[];
  existing: EmailMessagePartyMap | null | undefined;
}): EmailMessagePartyMap {
  const next: EmailMessagePartyMap = {};
  const existing = input.existing ?? {};

  for (const entry of input.messages) {
    const messageId = entry.messageId?.trim();
    if (!messageId) continue;
    const stored = existing[messageId];
    if (stored?.contactId || stored?.organizationId) continue;

    const fromEmail = parseReplyToAddress(entry.from ?? "")
      .trim()
      .toLowerCase();
    const isSent = Boolean(
      fromEmail && input.ourMailboxEmails.has(fromEmail),
    );
    const address = resolveEmailMessagePartyAddress({
      from: entry.from,
      to: entry.to,
      isSent,
      ourMailboxEmails: input.ourMailboxEmails,
    });
    const matched = matchEmailMessageParty({
      address,
      contacts: input.contacts,
      organizations: input.organizations,
    });
    if (!matched) continue;
    if (!matched.contactId && !matched.organizationId) continue;
    next[messageId] = matched;
  }

  return next;
}

export function getEmailMessageParty(
  map: EmailMessagePartyMap | null | undefined,
  messageId: string | null | undefined,
): EmailMessagePartyLink | null {
  const key = messageId?.trim();
  if (!key) return null;
  return map?.[key] ?? null;
}

/** True when address is already listed on the contact (any label). */
export function contactHasEmailAddress(
  contact: {
    email?: string | null;
    emails?: readonly { address?: string | null }[] | null;
  },
  address: string,
): boolean {
  return contactMatchesEmailAddress(contact, address);
}
