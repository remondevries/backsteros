import {
  getContactsHref,
  getKnowledgeHref,
  getOrganizationsHref,
  getProjectsHref,
  getUniqueListItemRouteParam,
} from "../navigation/entity-routes.js";
import { getEmailItemHref } from "../email/email.js";
import { encodeTaskSlug, getInboxTaskRouteHref } from "../inbox/inbox-items.js";
import { parseLetterSlug } from "../letters/letters.js";
import { resolveScopedLetterDetailHref } from "../letters/letter-route-scope.js";
import { getScopedProjectTaskHref } from "../projects/project-route-scope.js";
import { getProjectDocumentHref } from "../projects/project-sections.js";
import {
  formatContactDisplayId,
  parseTaskSlug,
} from "../navigation/resolve-history-entry-display.js";
import { INBOX_TASK_KEY } from "../tasks/task-display-id.js";
import type {
  MentionCatalog,
  MentionItem,
  ParsedMentionToken,
} from "./mention-menu-types.js";
import { MENTION_TOKEN_RE, parseMentionToken } from "./mention-tokens.js";
import { contactMatchesMentionRef } from "./resolve-catalog-entry.js";

/** Synthetic project key for knowledge-base document mention tokens. */
export const KNOWLEDGE_MENTION_PROJECT_KEY = "_knowledge";

export function buildMentionToken(item: MentionItem): string {
  switch (item.kind) {
    case "task":
      return `[@task:${item.displayId}]`;
    case "letter":
      return `[@letter:${item.displayId}]`;
    case "email":
      return `[@email:${item.displayId}]`;
    case "project":
      return `[@project:${item.key}]`;
    case "contact":
      return `[@contact:${preferredContactMentionDisplayId(item) ?? item.key}]`;
    case "organization":
      return `[@organization:${item.key}]`;
    case "document":
      return `[@document:${item.projectKey}/${item.relativePath}]`;
  }
}

function preferredContactMentionRef(
  contact: MentionCatalog["contacts"][number],
): string | null {
  return preferredContactMentionDisplayId(contact);
}

/**
 * Canonical contact mention id (`C-17`). Prefer number, then a C-N displayId.
 * Returns null when only a slug key is available.
 */
export function preferredContactMentionDisplayId(contact: {
  number?: number | null;
  displayId?: string | null;
}): string | null {
  if (contact.number != null) {
    return formatContactDisplayId(contact.number);
  }
  const displayId = contact.displayId?.trim();
  if (displayId && /^c-\d+$/i.test(displayId)) {
    return displayId;
  }
  return null;
}

/**
 * Rewrite legacy `[@contact:slugkey…]` tokens to `[@contact:C-N]` when the
 * catalog can resolve them. Leaves unresolved / already-canonical tokens alone.
 */
export function rewriteContactMentionTokensToDisplayIds(
  markdown: string,
  catalog: Pick<MentionCatalog, "contacts">,
): string {
  if (!markdown || catalog.contacts.length === 0) {
    return markdown;
  }

  MENTION_TOKEN_RE.lastIndex = 0;
  return markdown.replace(MENTION_TOKEN_RE, (raw) => {
    const parsed = parseMentionToken(raw);
    if (!parsed || parsed.kind !== "contact") {
      return raw;
    }

    const contact = catalog.contacts.find((entry) =>
      contactMatchesMentionRef(entry, parsed.key),
    );
    if (!contact) {
      return raw;
    }

    const preferred = preferredContactMentionRef(contact);
    if (!preferred || preferred.toLowerCase() === parsed.key.toLowerCase()) {
      return raw;
    }

    return `[@contact:${preferred}]`;
  });
}

/** Stable cache key for deduplicating mention resolution requests. */
export function getMentionTokenCacheKey(token: ParsedMentionToken): string {
  if (token.kind === "document") {
    return `${token.kind}:${token.projectKey}/${token.relativePath}`;
  }
  if (
    token.kind === "task" ||
    token.kind === "letter" ||
    token.kind === "email"
  ) {
    return `${token.kind}:${token.displayId}`;
  }
  return `${token.kind}:${token.key}`;
}

function getContactTaskHrefFromKey(
  contactKey: string,
  taskNumber: number,
): string {
  return `/contacts/${encodeURIComponent(contactKey)}/tasks/${encodeTaskSlug(contactKey, taskNumber)}`;
}

/** Resolve a catalog-backed mention token to an in-app href (Next parity). */
export function resolveMentionHref(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): string | null {
  switch (parsed.kind) {
    case "task": {
      const task = catalog.tasks.find(
        (entry) =>
          entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
      );
      if (!task) {
        return null;
      }
      const slug = parseTaskSlug(task.displayId);
      if (!slug) {
        return null;
      }
      if (task.projectKey) {
        return getScopedProjectTaskHref(task.projectKey, slug.number);
      }
      if (task.contactKey) {
        return getContactTaskHrefFromKey(task.contactKey, slug.number);
      }
      if (slug.contextKey.toUpperCase() === INBOX_TASK_KEY) {
        return getInboxTaskRouteHref({ number: slug.number });
      }
      return getInboxTaskRouteHref({ number: slug.number });
    }
    case "project": {
      const project = catalog.projects.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!project) {
        return null;
      }
      return getProjectsHref(project.key);
    }
    case "contact": {
      const contact = catalog.contacts.find((entry) =>
        contactMatchesMentionRef(entry, parsed.key),
      );
      if (!contact) {
        return null;
      }
      return getContactsHref(
        getUniqueListItemRouteParam(contact, catalog.contacts),
      );
    }
    case "organization": {
      const organization = catalog.organizations.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!organization) {
        return null;
      }
      return getOrganizationsHref(
        getUniqueListItemRouteParam(organization, catalog.organizations),
      );
    }
    case "document": {
      const document = catalog.documents.find(
        (entry) =>
          entry.projectKey.toLowerCase() === parsed.projectKey.toLowerCase() &&
          entry.relativePath.toLowerCase() ===
            parsed.relativePath.toLowerCase(),
      );
      if (!document) {
        return null;
      }
      if (
        document.projectKey.toLowerCase() ===
        KNOWLEDGE_MENTION_PROJECT_KEY.toLowerCase()
      ) {
        return getKnowledgeHref(document.relativePath);
      }
      return getProjectDocumentHref(document.projectKey, document.relativePath);
    }
    case "letter": {
      const letter = catalog.letters.find(
        (entry) =>
          entry.displayId.toLowerCase() === parsed.displayId.toLowerCase() ||
          entry.id.toLowerCase() === parsed.displayId.toLowerCase(),
      );
      if (!letter) {
        return null;
      }
      const letterNumber =
        parseLetterSlug(letter.displayId) ??
        parseLetterSlug(parsed.displayId);
      const scope = letter.projectKey
        ? {
            kind: "project" as const,
            projectRouteParam: letter.projectKey,
          }
        : { kind: "global" as const };
      return resolveScopedLetterDetailHref(
        { id: letter.id, number: letterNumber },
        scope,
      );
    }
    case "email": {
      const email = catalog.emails.find(
        (entry) =>
          entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
      );
      if (!email) {
        return null;
      }
      return getEmailItemHref(email.inboxId, email.messageId);
    }
  }
}
