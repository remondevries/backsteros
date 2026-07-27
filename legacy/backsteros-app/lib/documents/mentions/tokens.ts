import { getProjectDocumentHref } from "@/lib/document-navigation-path";
import {
  getContactHref,
  getContactTaskHrefFromKey,
  getInboxTaskHref,
  getLettersHref,
  getOrganizationHref,
  getProjectHref,
  getProjectLetterHref,
  getProjectTaskHref,
} from "@/lib/entity-route-hrefs";
import { parseLetterSlug, parseTaskSlug } from "@/lib/entity-slugs";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";

import type {
  MentionCatalog,
  MentionItem,
  ParsedMentionToken,
} from "./mention-menu-types";

/** Synthetic project key for knowledge-base document mention tokens. */
export const KNOWLEDGE_MENTION_PROJECT_KEY = "_knowledge";

export const MENTION_TOKEN_RE =
  /\[@(task|project|contact|organization|document|letter):([^\]]+)\]/g;

const MENTION_TOKEN_SINGLE_RE =
  /^\[@(task|project|contact|organization|document|letter):([^\]]+)\]$/;

export function buildMentionToken(item: MentionItem): string {
  switch (item.kind) {
    case "task":
      return `[@task:${item.displayId}]`;
    case "letter":
      return `[@letter:${item.displayId}]`;
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

export function parseMentionToken(raw: string): ParsedMentionToken | null {
  const match = MENTION_TOKEN_SINGLE_RE.exec(raw.trim());
  if (!match) {
    return null;
  }

  const kind = match[1] as ParsedMentionToken["kind"];
  const value = match[2]!;

  if (kind === "task") {
    return { kind: "task", displayId: value, raw };
  }

  if (kind === "letter") {
    return { kind: "letter", displayId: value, raw };
  }

  if (kind === "project") {
    return { kind: "project", key: value, raw };
  }

  if (kind === "contact") {
    return { kind: "contact", key: value, raw };
  }

  if (kind === "organization") {
    return { kind: "organization", key: value, raw };
  }

  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  return {
    kind: "document",
    projectKey: value.slice(0, slashIndex),
    relativePath: value.slice(slashIndex + 1),
    raw,
  };
}

/** Stable cache key for deduplicating mention resolution requests. */
export function getMentionTokenCacheKey(token: ParsedMentionToken): string {
  if (token.kind === "document") {
    return `${token.kind}:${token.projectKey}/${token.relativePath}`;
  }
  if (token.kind === "task" || token.kind === "letter") {
    return `${token.kind}:${token.displayId}`;
  }
  return `${token.kind}:${token.key}`;
}

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
        return getProjectTaskHref(task.projectKey, slug.number);
      }
      if (task.contactKey) {
        return getContactTaskHrefFromKey(task.contactKey, slug.number);
      }
      if (slug.contextKey.toUpperCase() === INBOX_TASK_KEY) {
        return getInboxTaskHref(slug.number);
      }
      return getInboxTaskHref(slug.number);
    }
    case "letter": {
      const letter = catalog.letters.find(
        (entry) =>
          entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
      );
      if (!letter) {
        return null;
      }
      const letterNumber = parseLetterSlug(letter.displayId);
      if (letterNumber == null) {
        return null;
      }
      if (letter.projectKey) {
        return getProjectLetterHref(letter.projectKey, letterNumber);
      }
      return getLettersHref(letterNumber);
    }
    case "project": {
      const project = catalog.projects.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!project) {
        return null;
      }
      return getProjectHref(project);
    }
    case "contact": {
      const contact = catalog.contacts.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!contact) {
        return null;
      }
      return getContactHref(contact);
    }
    case "organization": {
      const organization = catalog.organizations.find(
        (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
      );
      if (!organization) {
        return null;
      }
      return getOrganizationHref(organization);
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
        return getKnowledgeDocumentHref(document.relativePath);
      }
      return getProjectDocumentHref(document.projectKey, document.relativePath);
    }
  }
}

export type MentionSegment =
  | { type: "markdown"; content: string }
  | { type: "mention"; token: ParsedMentionToken; raw: string };

export function segmentMarkdownWithMentions(markdown: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(MENTION_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({
        type: "markdown",
        content: markdown.slice(lastIndex, index),
      });
    }

    const raw = match[0];
    const parsed = parseMentionToken(raw);
    if (parsed) {
      segments.push({ type: "mention", token: parsed, raw });
    } else {
      segments.push({ type: "markdown", content: raw });
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(lastIndex),
    });
  }

  return segments;
}

export function extractMentionTokensFromMarkdown(
  markdown: string,
): ParsedMentionToken[] {
  const tokens: ParsedMentionToken[] = [];

  for (const match of markdown.matchAll(MENTION_TOKEN_RE)) {
    const parsed = parseMentionToken(match[0]);
    if (parsed) {
      tokens.push(parsed);
    }
  }

  return tokens;
}
