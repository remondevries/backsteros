/**
 * Build BacksterOS desktop internal deep-link paths (same hrefs as
 * `resolveMentionHref` in desktop `packages/ui/src/mentions/tokens.ts`).
 * External tools open these by writing to `~/.config/backsteros/open-href`.
 */

import type { ParsedMentionToken } from "./mention-tokens";

const INBOX_TASK_KEY = "INBOX";
/** Synthetic project key for knowledge-base document mention tokens. */
export const KNOWLEDGE_MENTION_PROJECT_KEY = "_knowledge";

export function encodeTaskSlug(contextKey: string, taskNumber: number): string {
  return `${contextKey.toLowerCase()}-${taskNumber}`;
}

export function parseTaskDisplayId(
  displayId: string,
): { contextKey: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(displayId.trim());
  if (!match) return null;
  return { contextKey: match[1]!, number: Number(match[2]) };
}

export function parseLetterDisplayId(displayId: string): number | null {
  const match = /^L-(\d+)$/i.exec(displayId.trim());
  return match ? Number(match[1]) : null;
}

export function parseContactDisplayId(ref: string): number | null {
  const match = /^C-(\d+)$/i.exec(ref.trim());
  return match ? Number(match[1]) : null;
}

export type MentionDesktopHrefInput = {
  readonly token: ParsedMentionToken;
  /** Resolved task fields when token.kind === "task". */
  readonly task?: {
    readonly number: number;
    readonly projectKey?: string | null;
    readonly contactKey?: string | null;
    readonly id?: string;
  } | null;
  /** Resolved letter number when token.kind === "letter". */
  readonly letterNumber?: number | null;
  /** Resolved contact route param (number or key). */
  readonly contactRouteParam?: string | number | null;
  /** Resolved organization route param. */
  readonly organizationRouteParam?: string | number | null;
};

/**
 * Desktop in-app path for a mention, or null when we lack enough resolved data.
 * Paths match the desktop router (e.g. `/projects/PF/tasks/pf-43`).
 */
export function buildMentionDesktopHref(input: MentionDesktopHrefInput): string | null {
  const { token } = input;

  switch (token.kind) {
    case "task": {
      const parsed = parseTaskDisplayId(token.displayId);
      const number = input.task?.number ?? parsed?.number;
      if (number == null) return null;

      const projectKey = input.task?.projectKey ?? parsed?.contextKey ?? null;
      const contactKey = input.task?.contactKey ?? null;

      if (projectKey && projectKey.toUpperCase() !== INBOX_TASK_KEY) {
        return `/projects/${encodeURIComponent(projectKey)}/tasks/${encodeTaskSlug(projectKey, number)}`;
      }
      if (contactKey) {
        return `/contacts/${encodeURIComponent(contactKey)}/tasks/${encodeTaskSlug(contactKey, number)}`;
      }
      return `/inbox/${encodeTaskSlug(INBOX_TASK_KEY, number)}`;
    }
    case "project":
      return `/projects/${encodeURIComponent(token.key)}`;
    case "contact": {
      const param = input.contactRouteParam ?? parseContactDisplayId(token.key) ?? token.key;
      return `/contacts/${encodeURIComponent(String(param))}`;
    }
    case "organization": {
      const param = input.organizationRouteParam ?? token.key;
      return `/organizations/${encodeURIComponent(String(param))}`;
    }
    case "letter": {
      const number = input.letterNumber ?? parseLetterDisplayId(token.displayId);
      if (number == null) return null;
      return `/letters/l-${number}`;
    }
    case "email":
      // Email deep links need inbox/message ids from the catalog; fall back to list.
      return "/email";
    case "document": {
      if (token.projectKey.toLowerCase() === KNOWLEDGE_MENTION_PROJECT_KEY) {
        const encoded = token.relativePath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        return `/spaces/${encoded}`;
      }
      const encoded = token.relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      return `/projects/${encodeURIComponent(token.projectKey)}/documents/${encoded}`;
    }
  }
}
