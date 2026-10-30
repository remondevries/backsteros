import { EMPTY_MENTION_CATALOG } from "./empty-catalog.js";
import type {
  MentionCatalog,
  ParsedMentionToken,
} from "./mention-menu-types.js";
import { contactMatchesMentionRef } from "./resolve-catalog-entry.js";

function habitKey(habitId: string, date: string | null): string {
  return date ? `${habitId.toLowerCase()}/${date}` : habitId.toLowerCase();
}

/** Subset of a catalog matching the given mention tokens (Next resolve parity). */
export function filterCatalogForTokens(
  catalog: MentionCatalog,
  tokens: ParsedMentionToken[],
): MentionCatalog {
  if (tokens.length === 0) {
    return EMPTY_MENTION_CATALOG;
  }

  const taskIds = new Set(
    tokens
      .filter((token) => token.kind === "task")
      .map((token) => token.displayId.toLowerCase()),
  );
  const projectKeys = new Set(
    tokens
      .filter((token) => token.kind === "project")
      .map((token) => token.key.toLowerCase()),
  );
  const contactRefs = tokens
    .filter((token) => token.kind === "contact")
    .map((token) => token.key);
  const organizationKeys = new Set(
    tokens
      .filter((token) => token.kind === "organization")
      .map((token) => token.key.toLowerCase()),
  );
  const documentKeys = new Set(
    tokens
      .filter((token) => token.kind === "document")
      .map(
        (token) =>
          `${token.projectKey.toLowerCase()}/${token.relativePath.toLowerCase()}`,
      ),
  );
  const letterIds = new Set(
    tokens
      .filter((token) => token.kind === "letter")
      .map((token) => token.displayId.toLowerCase()),
  );
  const emailIds = new Set(
    tokens
      .filter((token) => token.kind === "email")
      .map((token) => token.displayId.toLowerCase()),
  );
  const meetingIds = new Set(
    tokens
      .filter((token) => token.kind === "meeting")
      .map((token) => token.displayId.toLowerCase()),
  );
  const journalDates = new Set(
    tokens.filter((token) => token.kind === "journal").map((token) => token.date),
  );
  const habitKeys = new Set(
    tokens
      .filter((token) => token.kind === "habit")
      .map((token) => habitKey(token.habitId, token.date)),
  );
  const messageIds = new Set(
    tokens
      .filter((token) => token.kind === "message")
      .map((token) => token.id.toLowerCase()),
  );
  const postIds = new Set(
    tokens
      .filter((token) => token.kind === "post")
      .map((token) => token.id.toLowerCase()),
  );
  const transactionIds = new Set(
    tokens
      .filter((token) => token.kind === "transaction")
      .map((token) => token.id.toLowerCase()),
  );
  const invoiceIds = new Set(
    tokens
      .filter((token) => token.kind === "invoice")
      .map((token) => token.id.toLowerCase()),
  );
  const estimateIds = new Set(
    tokens
      .filter((token) => token.kind === "estimate")
      .map((token) => token.id.toLowerCase()),
  );

  return {
    tasks: catalog.tasks.filter((task) =>
      taskIds.has(task.displayId.toLowerCase()),
    ),
    projects: catalog.projects.filter((project) =>
      projectKeys.has(project.key.toLowerCase()),
    ),
    contacts: catalog.contacts.filter((contact) =>
      contactRefs.some((ref) => contactMatchesMentionRef(contact, ref)),
    ),
    organizations: catalog.organizations.filter((organization) =>
      organizationKeys.has(organization.key.toLowerCase()),
    ),
    documents: catalog.documents.filter((document) =>
      documentKeys.has(
        `${document.projectKey.toLowerCase()}/${document.relativePath.toLowerCase()}`,
      ),
    ),
    letters: catalog.letters.filter((letter) =>
      letterIds.has(letter.displayId.toLowerCase()),
    ),
    emails: catalog.emails.filter((email) =>
      emailIds.has(email.displayId.toLowerCase()),
    ),
    meetings: catalog.meetings.filter(
      (meeting) =>
        meetingIds.has(meeting.displayId.toLowerCase()) ||
        meetingIds.has(meeting.id.toLowerCase()),
    ),
    journals: catalog.journals.filter((journal) =>
      journalDates.has(journal.date),
    ),
    habits: catalog.habits.filter((habit) =>
      habitKeys.has(habitKey(habit.id, habit.date)),
    ),
    messages: catalog.messages.filter((message) =>
      messageIds.has(message.id.toLowerCase()),
    ),
    posts: catalog.posts.filter((post) => postIds.has(post.id.toLowerCase())),
    transactions: catalog.transactions.filter((transaction) =>
      transactionIds.has(transaction.id.toLowerCase()),
    ),
    invoices: catalog.invoices.filter((invoice) =>
      invoiceIds.has(invoice.id.toLowerCase()),
    ),
    estimates: catalog.estimates.filter((estimate) =>
      estimateIds.has(estimate.id.toLowerCase()),
    ),
  };
}
