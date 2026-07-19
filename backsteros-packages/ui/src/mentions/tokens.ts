import {
  getContactsHref,
  getKnowledgeHref,
  getOrganizationsHref,
  getProjectsHref,
} from "../entity-routes.js";
import { encodeTaskSlug, getInboxTaskRouteHref } from "../inbox-items.js";
import { getScopedProjectTaskHref } from "../project-route-scope.js";
import { getProjectDocumentHref } from "../project-sections.js";
import { parseTaskSlug } from "../resolve-history-entry-display.js";
import { INBOX_TASK_KEY } from "../task-display-id.js";
import type {
  MentionCatalog,
  MentionItem,
  ParsedMentionToken,
} from "./mention-menu-types.js";

/** Synthetic project key for knowledge-base document mention tokens. */
export const KNOWLEDGE_MENTION_PROJECT_KEY = "_knowledge";

export function buildMentionToken(item: MentionItem): string {
  switch (item.kind) {
    case "task":
      return `[@task:${item.displayId}]`;
    case "project":
      return `[@project:${item.key}]`;
    case "contact":
      return `[@contact:${item.key}]`;
    case "organization":
      return `[@organization:${item.key}]`;
    case "document":
      return `[@document:${item.projectKey}/${item.relativePath}]`;
  }
}

/** Stable cache key for deduplicating mention resolution requests. */
export function getMentionTokenCacheKey(token: ParsedMentionToken): string {
  if (token.kind === "document") {
    return `${token.kind}:${token.projectKey}/${token.relativePath}`;
  }
  if (token.kind === "task") {
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
      const contact = catalog.contacts.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!contact) {
        return null;
      }
      return getContactsHref(contact.number ?? contact.key);
    }
    case "organization": {
      const organization = catalog.organizations.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!organization) {
        return null;
      }
      return getOrganizationsHref(organization.number ?? organization.key);
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
  }
}
