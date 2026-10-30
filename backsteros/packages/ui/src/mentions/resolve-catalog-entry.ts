import { parseContactSlug } from "../navigation/resolve-history-entry-display.js";
import type { ParsedMentionToken } from "./mention-tokens.js";
import type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogEmail,
  MentionCatalogHabit,
  MentionCatalogJournal,
  MentionCatalogLetter,
  MentionCatalogMeeting,
  MentionCatalogMessage,
  MentionCatalogOrganization,
  MentionCatalogPost,
  MentionCatalogProject,
  MentionCatalogTask,
  MentionCatalogTransaction,
} from "./mention-menu-types.js";

/** Match a contact mention ref: `C-12`, legacy slug key, or uuid. */
export function contactMatchesMentionRef(
  contact: {
    id?: string;
    key: string;
    number?: number | null;
    displayId?: string | null;
  },
  ref: string,
): boolean {
  const normalized = ref.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (contact.key.toLowerCase() === normalized) {
    return true;
  }
  if (contact.id && contact.id.toLowerCase() === normalized) {
    return true;
  }
  if (contact.displayId && contact.displayId.toLowerCase() === normalized) {
    return true;
  }
  const fromSlug = parseContactSlug(ref);
  return fromSlug != null && contact.number === fromSlug;
}

export function resolveMentionCatalogTask(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogTask | null {
  if (parsed.kind !== "task") {
    return null;
  }

  return (
    catalog.tasks.find(
      (entry) =>
        entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogProject(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogProject | null {
  if (parsed.kind !== "project") {
    return null;
  }

  return (
    catalog.projects.find(
      (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogContact(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogContact | null {
  if (parsed.kind !== "contact") {
    return null;
  }

  return (
    catalog.contacts.find((entry) =>
      contactMatchesMentionRef(entry, parsed.key),
    ) ?? null
  );
}

export function resolveMentionCatalogOrganization(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogOrganization | null {
  if (parsed.kind !== "organization") {
    return null;
  }

  return (
    catalog.organizations.find(
      (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogDocument(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogDocument | null {
  if (parsed.kind !== "document") {
    return null;
  }

  return (
    catalog.documents.find(
      (entry) =>
        entry.projectKey.toLowerCase() === parsed.projectKey.toLowerCase() &&
        entry.relativePath.toLowerCase() === parsed.relativePath.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogLetter(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogLetter | null {
  if (parsed.kind !== "letter") {
    return null;
  }

  return (
    catalog.letters.find(
      (entry) =>
        entry.displayId.toLowerCase() === parsed.displayId.toLowerCase() ||
        entry.id.toLowerCase() === parsed.displayId.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogEmail(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogEmail | null {
  if (parsed.kind !== "email") {
    return null;
  }

  return (
    catalog.emails.find(
      (entry) =>
        entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogMeeting(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogMeeting | null {
  if (parsed.kind !== "meeting") {
    return null;
  }

  return (
    catalog.meetings.find(
      (entry) =>
        entry.displayId.toLowerCase() === parsed.displayId.toLowerCase() ||
        entry.id.toLowerCase() === parsed.displayId.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogJournal(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogJournal | null {
  if (parsed.kind !== "journal") {
    return null;
  }

  return (
    catalog.journals.find((entry) => entry.date === parsed.date) ?? null
  );
}

export function resolveMentionCatalogHabit(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogHabit | null {
  if (parsed.kind !== "habit") {
    return null;
  }

  return (
    catalog.habits.find((entry) => {
      if (entry.id.toLowerCase() !== parsed.habitId.toLowerCase()) {
        return false;
      }
      if (parsed.date == null) {
        return entry.date == null;
      }
      return entry.date === parsed.date;
    }) ??
    // Fall back to habit definition when a day row is missing.
    (parsed.date != null
      ? (catalog.habits.find(
          (entry) =>
            entry.id.toLowerCase() === parsed.habitId.toLowerCase() &&
            entry.date == null,
        ) ?? null)
      : null)
  );
}

export function resolveMentionCatalogMessage(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogMessage | null {
  if (parsed.kind !== "message") {
    return null;
  }

  return (
    catalog.messages.find(
      (entry) => entry.id.toLowerCase() === parsed.id.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogPost(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogPost | null {
  if (parsed.kind !== "post") {
    return null;
  }

  return (
    catalog.posts.find(
      (entry) => entry.id.toLowerCase() === parsed.id.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogTransaction(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogTransaction | null {
  if (parsed.kind !== "transaction") {
    return null;
  }

  return (
    catalog.transactions.find(
      (entry) => entry.id.toLowerCase() === parsed.id.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogInvoice(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
) {
  if (parsed.kind !== "invoice") {
    return null;
  }

  return (
    catalog.invoices.find(
      (entry) => entry.id.toLowerCase() === parsed.id.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogEstimate(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
) {
  if (parsed.kind !== "estimate") {
    return null;
  }

  return (
    catalog.estimates.find(
      (entry) => entry.id.toLowerCase() === parsed.id.toLowerCase(),
    ) ?? null
  );
}
