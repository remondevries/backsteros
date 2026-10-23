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
  name?: string | null;
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
 * Party address for org/contact linking — always the From address.
 * Do not switch to To/Cc when From is our mailbox; sent messages still file
 * against whoever is in From (e.g. Remon’s contact), same as any other From.
 */
export function resolveEmailMessagePartyAddress(input: {
  from?: string | null;
  /** @deprecated Unused for linking — kept for call-site compatibility. */
  to?: readonly string[] | null;
  /** @deprecated Unused for linking — kept for call-site compatibility. */
  cc?: readonly string[] | null;
  /** @deprecated Unused for linking — kept for call-site compatibility. */
  isSent?: boolean;
  /** @deprecated Unused for linking — kept for call-site compatibility. */
  ourMailboxEmails?: ReadonlySet<string>;
  contacts?: readonly MatchableContact[];
  organizations?: readonly MatchableOrganization[];
  preferAddresses?: readonly string[] | null;
}): string | null {
  const from = parseReplyToAddress(input.from ?? "").trim();
  return from.includes("@") ? from : null;
}

/** Inbound From addresses in a thread (excludes our mailboxes). */
export function listInboundPartyAddresses(input: {
  messages: readonly { from?: string | null }[];
  ourMailboxEmails: ReadonlySet<string>;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of input.messages) {
    const display = parseReplyToAddress(entry.from ?? "").trim();
    if (!display.includes("@")) continue;
    const key = display.toLowerCase();
    if (input.ourMailboxEmails.has(key)) continue;
    const bare = parseBareEmailAddress(display);
    if (!bare || seen.has(bare)) continue;
    seen.add(bare);
    out.push(display);
  }
  return out;
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

function isExplicitEmailPartyUnlink(party: EmailMessagePartyLink): boolean {
  return !party.contactId?.trim() && !party.organizationId?.trim();
}

/**
 * Whether a stored party still belongs to this message’s party address.
 * `unknown` means the linked entity is not in the local directory yet — keep
 * the stored link rather than clearing it while CRM data is still loading.
 *
 * When another contact owns the address as their primary email and the stored
 * contact only has it as secondary/other, treat as mismatch so we refile to
 * the primary owner (guards against polluted “other” emails).
 */
export function classifyStoredEmailMessageParty(input: {
  party: EmailMessagePartyLink;
  address: string | null | undefined;
  contacts: readonly MatchableContact[];
  organizations: readonly MatchableOrganization[];
}): "match" | "mismatch" | "unknown" {
  const address = input.address?.trim();
  if (!address) return "unknown";
  const needle = parseBareEmailAddress(address);
  if (!needle) return "unknown";

  const contactId = input.party.contactId?.trim();
  if (contactId) {
    const contact = input.contacts.find((entry) => entry.id === contactId);
    if (!contact) return "unknown";
    if (!contactMatchesEmailAddress(contact, address)) return "mismatch";
    const primaryOwner = input.contacts.find(
      (entry) => parseBareEmailAddress(entry.email ?? "") === needle,
    );
    if (
      primaryOwner &&
      primaryOwner.id !== contactId &&
      parseBareEmailAddress(contact.email ?? "") !== needle
    ) {
      return "mismatch";
    }
    return "match";
  }

  const organizationId = input.party.organizationId?.trim();
  if (organizationId) {
    const organization = input.organizations.find(
      (entry) => entry.id === organizationId,
    );
    if (!organization) return "unknown";
    return organizationMatchesEmailAddress(organization, address)
      ? "match"
      : "mismatch";
  }

  return "unknown";
}

/**
 * Propose auto-link parties from each message’s From address. Contact first,
 * else organization. Sent vs received does not change the rule — From only.
 *
 * Per-message only — never copies a thread-level contact onto every message.
 * Keeps explicit unlinks and links that still match the address. Replaces
 * stale mismatches (e.g. a thread-level seed on the wrong From). Unknown
 * addresses stay unlinked, same as a single-message thread with no match.
 */
export function buildEmailMessagePartyAutoLinks(input: {
  messages: readonly {
    messageId: string;
    from?: string | null;
    to?: readonly string[] | null;
    cc?: readonly string[] | null;
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

    const address = resolveEmailMessagePartyAddress({
      from: entry.from,
    });

    const hasStored = Object.prototype.hasOwnProperty.call(existing, messageId);
    if (hasStored) {
      const stored = existing[messageId]!;
      // Explicit unlink — never soft-refile a party the user cleared.
      if (isExplicitEmailPartyUnlink(stored)) continue;
      const fit = classifyStoredEmailMessageParty({
        party: stored,
        address,
        contacts: input.contacts,
        organizations: input.organizations,
      });
      // Keep correct links, and keep unresolved ones until CRM is loaded.
      if (fit === "match" || fit === "unknown") continue;
    }

    const matched = matchEmailMessageParty({
      address,
      contacts: input.contacts,
      organizations: input.organizations,
    });
    if (matched?.contactId || matched?.organizationId) {
      next[messageId] = {
        contactId: matched.contactId,
        organizationId: matched.organizationId,
      };
      continue;
    }

    // No From match — leave a manual org/contact alone. Only clear when the
    // stored party is a contact that clearly does not belong to this From
    // while another contact owns the address as primary (polluted / wrong seed).
    if (hasStored) {
      const stored = existing[messageId]!;
      const storedContactId = stored.contactId?.trim();
      if (!storedContactId) continue;
      const needle = address ? parseBareEmailAddress(address) : null;
      const primaryOwner = needle
        ? input.contacts.find(
            (entry) => parseBareEmailAddress(entry.email ?? "") === needle,
          )
        : null;
      if (primaryOwner && primaryOwner.id !== storedContactId) {
        next[messageId] = {
          contactId: primaryOwner.id,
          organizationId: primaryOwner.organizationId?.trim() || null,
        };
      }
    }
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
