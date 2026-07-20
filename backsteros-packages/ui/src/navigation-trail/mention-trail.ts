import {
  isKnowledgeDocumentDetailPath,
  isProjectDocumentDetailPath,
} from "../compose-task.js";
import { encodeTaskSlug } from "../inbox-items.js";
import { parseLetterSlug } from "../letters.js";
import type {
  MentionCatalog,
  ParsedMentionToken,
} from "../mentions/mention-menu-types.js";
import { parseTaskSlug } from "../resolve-history-entry-display.js";
import { INBOX_TASK_KEY } from "../task-display-id.js";
import { appendNavigationTrailNode, parseNavigationTrailPath } from "./codec.js";
import { KNOWLEDGE_MENTION_PROJECT_KEY } from "../mentions/tokens.js";
import type { NavigationTrailEntityRef } from "./types.js";

function normalizePathname(pathname: string): string {
  return (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") || "/";
}

/**
 * Paths where opening a mention should append a `~/…` trail node instead of
 * jumping to the entity’s canonical URL (journal day, project/knowledge docs,
 * contact overview, or an existing trail).
 */
export function isMentionTrailSourcePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (parseNavigationTrailPath(path)) {
    return true;
  }
  if (/^\/journal\/\d{4}-\d{2}-\d{2}$/.test(path)) {
    return true;
  }
  if (isProjectDocumentDetailPath(path) || isKnowledgeDocumentDetailPath(path)) {
    return true;
  }
  if (/^\/contacts\/[^/]+$/.test(path)) {
    return true;
  }
  if (/^\/organizations\/[^/]+\/contacts\/[^/]+$/.test(path)) {
    return true;
  }
  return false;
}

function mentionTrailRef(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): NavigationTrailEntityRef | null {
  switch (parsed.kind) {
    case "task": {
      const task = catalog.tasks.find(
        (entry) =>
          entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
      );
      if (!task) return null;
      const slug = parseTaskSlug(task.displayId);
      if (!slug) return null;
      return {
        kind: "task",
        entityId: task.id,
        routeParam: encodeTaskSlug(
          task.projectKey || task.contactKey || INBOX_TASK_KEY,
          slug.number,
        ),
      };
    }
    case "project": {
      const project = catalog.projects.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!project) return null;
      return {
        kind: "project",
        entityId: project.id,
        routeParam: project.key,
      };
    }
    case "contact": {
      const contact = catalog.contacts.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!contact) return null;
      return {
        kind: "contact",
        entityId: contact.id,
        routeParam: contact.key,
      };
    }
    case "organization": {
      const organization = catalog.organizations.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!organization) return null;
      return {
        kind: "organization",
        entityId: organization.id,
        routeParam: organization.key,
      };
    }
    case "document": {
      const document = catalog.documents.find(
        (entry) =>
          entry.projectKey.toLowerCase() === parsed.projectKey.toLowerCase() &&
          entry.relativePath.toLowerCase() ===
            parsed.relativePath.toLowerCase(),
      );
      if (!document) return null;
      const isKnowledge =
        document.projectKey.toLowerCase() ===
        KNOWLEDGE_MENTION_PROJECT_KEY.toLowerCase();
      return {
        kind: "document",
        entityId: document.id,
        projectRouteParam: isKnowledge ? "" : document.projectKey,
        relativePath: document.relativePath,
      };
    }
    case "letter": {
      const letter = catalog.letters.find(
        (entry) =>
          entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
      );
      if (!letter) return null;
      const letterNumber = parseLetterSlug(letter.displayId);
      if (letterNumber == null) return null;
      return {
        kind: "letter",
        entityId: letter.id,
        routeParam: `l-${letterNumber}`,
      };
    }
  }
}

/**
 * When `trailSourceHref` is a trail-capable path, return a trail URL for the
 * mention; otherwise return null so the caller can use the canonical href.
 */
export function resolveMentionTrailHref(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
  trailSourceHref: string,
): string | null {
  if (!isMentionTrailSourcePath(trailSourceHref)) {
    return null;
  }
  const ref = mentionTrailRef(parsed, catalog);
  if (!ref) {
    return null;
  }
  return appendNavigationTrailNode(trailSourceHref, ref);
}
