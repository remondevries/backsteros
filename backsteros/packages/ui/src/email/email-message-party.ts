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

/** True when `address` matches the organization’s primary or listed emails. */
export function organizationMatchesEmailAddress(
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
 *
 * Matches by party address: contact first (including their organizationId),
 * otherwise organization-only. Both are persisted so the rail files itself
 * whenever an email address is already known.
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
    // Any stored entry (including explicit unlink with null ids) wins — never
    // soft-refile a party the user cleared.
    if (Object.prototype.hasOwnProperty.call(existing, messageId)) continue;

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
    if (!matched?.contactId && !matched?.organizationId) continue;
    next[messageId] = {
      contactId: matched.contactId,
      organizationId: matched.organizationId,
    };
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

/**
 * Unique contact ids across a thread’s per-message parties (insertion order).
 * Falls back to a single thread-level contact when the map is empty.
 */
export function uniqueEmailPartyContactIds(
  parties: EmailMessagePartyMap | null | undefined,
  fallbackContactId?: string | null,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const party of Object.values(parties ?? {})) {
    const id = party.contactId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) {
    const fallback = fallbackContactId?.trim();
    if (fallback) ids.push(fallback);
  }
  return ids;
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
