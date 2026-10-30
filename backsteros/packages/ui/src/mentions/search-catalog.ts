import { filterProjectsForDefaultPicker } from "@backsteros/contracts";

import type {
  MentionCatalog,
  MentionItem,
  MentionKind,
  MentionSection,
} from "./mention-menu-types.js";

const MAX_ITEMS_PER_SECTION = 8;

const SECTION_HEADINGS: Record<MentionKind, string> = {
  task: "Tasks",
  project: "Projects",
  contact: "Contacts",
  organization: "Organizations",
  document: "Documents",
  letter: "Letters",
  email: "E-mail",
  meeting: "Meetings",
  journal: "Journal",
  habit: "Habits",
  message: "Messages",
  post: "Posts",
  transaction: "Transactions",
  invoice: "Invoices",
  estimate: "Estimates",
};

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) {
    return true;
  }
  return haystack.toLowerCase().includes(query);
}

function filterTasks(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.tasks
    .filter(
      (task) =>
        matchesQuery(task.title, normalized) ||
        matchesQuery(task.displayId, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (task): MentionItem => ({
        kind: "task",
        id: task.id,
        displayId: task.displayId,
        title: task.title,
        status: task.status,
        projectName: task.projectName,
      }),
    );
}

function filterProjects(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return filterProjectsForDefaultPicker(catalog.projects)
    .filter(
      (project) =>
        matchesQuery(project.name, normalized) ||
        matchesQuery(project.key, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (project): MentionItem => ({
        kind: "project",
        id: project.id,
        key: project.key,
        name: project.name,
        color: project.color,
        icon: project.icon,
        type: project.type ?? null,
        status: project.status,
      }),
    );
}

function filterContacts(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.contacts
    .filter((contact) => {
      if (!normalized) return true;
      if (matchesQuery(contact.name, normalized)) return true;
      if (matchesQuery(contact.key, normalized)) return true;
      if (contact.displayId && matchesQuery(contact.displayId, normalized)) {
        return true;
      }
      if (contact.firstName && matchesQuery(contact.firstName, normalized)) {
        return true;
      }
      if (contact.lastName && matchesQuery(contact.lastName, normalized)) {
        return true;
      }
      if (contact.email && matchesQuery(contact.email, normalized)) {
        return true;
      }
      if (contact.title && matchesQuery(contact.title, normalized)) {
        return true;
      }
      if (
        contact.organizationName &&
        matchesQuery(contact.organizationName, normalized)
      ) {
        return true;
      }
      return false;
    })
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (contact): MentionItem => ({
        kind: "contact",
        id: contact.id,
        key: contact.key,
        number: contact.number,
        displayId: contact.displayId,
        name: contact.name,
        title: contact.title,
        organizationName: contact.organizationName,
        avatarStorageKey: contact.avatarStorageKey,
        avatarUpdatedAt: contact.avatarUpdatedAt,
        avatarSrc: contact.avatarSrc ?? null,
      }),
    );
}

function filterOrganizations(
  catalog: MentionCatalog,
  query: string,
): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.organizations
    .filter((organization) => {
      if (!normalized) return true;
      if (matchesQuery(organization.name, normalized)) return true;
      if (matchesQuery(organization.key, normalized)) return true;
      if (
        organization.displayId &&
        matchesQuery(organization.displayId, normalized)
      ) {
        return true;
      }
      if (organization.email && matchesQuery(organization.email, normalized)) {
        return true;
      }
      return false;
    })
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (organization): MentionItem => ({
        kind: "organization",
        id: organization.id,
        key: organization.key,
        name: organization.name,
        avatarStorageKey: organization.avatarStorageKey,
        avatarUpdatedAt: organization.avatarUpdatedAt,
        avatarSrc: organization.avatarSrc ?? null,
      }),
    );
}

function filterDocuments(
  catalog: MentionCatalog,
  query: string,
): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.documents
    .filter(
      (document) =>
        matchesQuery(document.title, normalized) ||
        matchesQuery(document.relativePath, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (document): MentionItem => ({
        kind: "document",
        id: document.id,
        projectId: document.projectId,
        projectKey: document.projectKey,
        projectName: document.projectName,
        relativePath: document.relativePath,
        title: document.title,
        icon: document.icon,
      }),
    );
}

function filterEmails(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.emails
    .filter(
      (email) =>
        matchesQuery(email.title, normalized) ||
        matchesQuery(email.displayId, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (email): MentionItem => ({
        kind: "email",
        id: email.id,
        displayId: email.displayId,
        title: email.title,
        status: email.status,
        projectName: email.projectName,
      }),
    );
}

function filterLetters(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.letters
    .filter(
      (letter) =>
        matchesQuery(letter.title, normalized) ||
        matchesQuery(letter.displayId, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (letter): MentionItem => ({
        kind: "letter",
        id: letter.id,
        displayId: letter.displayId,
        title: letter.title,
        status: letter.status,
        projectName: letter.projectName,
      }),
    );
}

function filterMeetings(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.meetings
    .filter(
      (meeting) =>
        matchesQuery(meeting.title, normalized) ||
        matchesQuery(meeting.displayId, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (meeting): MentionItem => ({
        kind: "meeting",
        id: meeting.id,
        displayId: meeting.displayId,
        title: meeting.title,
        startAt: meeting.startAt,
        projectName: meeting.projectName,
      }),
    );
}

function filterJournals(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.journals
    .filter(
      (journal) =>
        matchesQuery(journal.title, normalized) ||
        matchesQuery(journal.date, normalized),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (journal): MentionItem => ({
        kind: "journal",
        id: journal.id,
        date: journal.date,
        title: journal.title,
      }),
    );
}

function filterHabits(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.habits
    .filter(
      (habit) =>
        matchesQuery(habit.title, normalized) ||
        (habit.date != null && matchesQuery(habit.date, normalized)),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (habit): MentionItem => ({
        kind: "habit",
        id: habit.id,
        title: habit.title,
        icon: habit.icon,
        date: habit.date,
      }),
    );
}

function filterMessages(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.messages
    .filter(
      (message) =>
        matchesQuery(message.title, normalized) ||
        matchesQuery(message.channelType, normalized) ||
        (message.contactName != null &&
          matchesQuery(message.contactName, normalized)),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (message): MentionItem => ({
        kind: "message",
        id: message.id,
        channelType: message.channelType,
        title: message.title,
        contactName: message.contactName,
      }),
    );
}

function filterPosts(catalog: MentionCatalog, query: string): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.posts
    .filter(
      (post) =>
        matchesQuery(post.title, normalized) ||
        (post.platform != null && matchesQuery(post.platform, normalized)) ||
        (post.body != null && matchesQuery(post.body, normalized)),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (post): MentionItem => ({
        kind: "post",
        id: post.id,
        title: post.title,
        platform: post.platform,
      }),
    );
}

function filterTransactions(
  catalog: MentionCatalog,
  query: string,
): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.transactions
    .filter(
      (transaction) =>
        matchesQuery(transaction.title, normalized) ||
        (transaction.counterparty != null &&
          matchesQuery(transaction.counterparty, normalized)) ||
        (transaction.notes != null && matchesQuery(transaction.notes, normalized)),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (transaction): MentionItem => ({
        kind: "transaction",
        id: transaction.id,
        title: transaction.title,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
      }),
    );
}

function filterInvoices(
  catalog: MentionCatalog,
  query: string,
): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.invoices
    .filter(
      (invoice) =>
        matchesQuery(invoice.title, normalized) ||
        (invoice.invoiceNumber != null &&
          matchesQuery(invoice.invoiceNumber, normalized)) ||
        (invoice.contactName != null &&
          matchesQuery(invoice.contactName, normalized)),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (invoice): MentionItem => ({
        kind: "invoice",
        id: invoice.id,
        title: invoice.title,
        invoiceNumber: invoice.invoiceNumber,
      }),
    );
}

function filterEstimates(
  catalog: MentionCatalog,
  query: string,
): MentionItem[] {
  const normalized = normalizeQuery(query);

  return catalog.estimates
    .filter(
      (estimate) =>
        matchesQuery(estimate.title, normalized) ||
        (estimate.displayId != null &&
          matchesQuery(estimate.displayId, normalized)) ||
        (estimate.clientLabel != null &&
          matchesQuery(estimate.clientLabel, normalized)),
    )
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(
      (estimate): MentionItem => ({
        kind: "estimate",
        id: estimate.id,
        title: estimate.title,
        displayId: estimate.displayId,
      }),
    );
}

export function buildMentionSections(
  catalog: MentionCatalog,
  query: string,
): MentionSection[] {
  const sections: MentionSection[] = [
    {
      kind: "task",
      heading: SECTION_HEADINGS.task,
      items: filterTasks(catalog, query),
    },
    {
      kind: "letter",
      heading: SECTION_HEADINGS.letter,
      items: filterLetters(catalog, query),
    },
    {
      kind: "email",
      heading: SECTION_HEADINGS.email,
      items: filterEmails(catalog, query),
    },
    {
      kind: "meeting",
      heading: SECTION_HEADINGS.meeting,
      items: filterMeetings(catalog, query),
    },
    {
      kind: "message",
      heading: SECTION_HEADINGS.message,
      items: filterMessages(catalog, query),
    },
    {
      kind: "project",
      heading: SECTION_HEADINGS.project,
      items: filterProjects(catalog, query),
    },
    {
      kind: "contact",
      heading: SECTION_HEADINGS.contact,
      items: filterContacts(catalog, query),
    },
    {
      kind: "organization",
      heading: SECTION_HEADINGS.organization,
      items: filterOrganizations(catalog, query),
    },
    {
      kind: "document",
      heading: SECTION_HEADINGS.document,
      items: filterDocuments(catalog, query),
    },
    {
      kind: "journal",
      heading: SECTION_HEADINGS.journal,
      items: filterJournals(catalog, query),
    },
    {
      kind: "habit",
      heading: SECTION_HEADINGS.habit,
      items: filterHabits(catalog, query),
    },
    {
      kind: "post",
      heading: SECTION_HEADINGS.post,
      items: filterPosts(catalog, query),
    },
    {
      kind: "transaction",
      heading: SECTION_HEADINGS.transaction,
      items: filterTransactions(catalog, query),
    },
    {
      kind: "invoice",
      heading: SECTION_HEADINGS.invoice,
      items: filterInvoices(catalog, query),
    },
    {
      kind: "estimate",
      heading: SECTION_HEADINGS.estimate,
      items: filterEstimates(catalog, query),
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

export function flattenMentionSections(
  sections: MentionSection[],
): MentionItem[] {
  return sections.flatMap((section) => section.items);
}
