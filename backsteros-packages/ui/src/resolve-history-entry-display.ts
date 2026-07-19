import { formatTaskDisplayId } from "./task-display-id.js";
import {
  formatLetterDisplayId,
  parseLetterSlug,
} from "./letters.js";
import {
  isKnowledgeDocumentDetailPath,
  isProjectDocumentDetailPath,
} from "./compose-task.js";
import {
  getSettingsTabFromPath,
  getSettingsTabMeta,
  isSettingsPath,
} from "./settings.js";
import {
  isTasksDueFilter,
  TASKS_DUE_FILTER_LABELS,
} from "./tasks-due-filters.js";
import type { NavigationItemIconId } from "./navigation.js";

export const CONTACT_DISPLAY_KEY = "C";
export const ORGANIZATION_DISPLAY_KEY = "O";

export function formatContactDisplayId(contactNumber: number): string {
  return `${CONTACT_DISPLAY_KEY}-${contactNumber}`;
}

export function formatOrganizationDisplayId(
  organizationNumber: number,
): string {
  return `${ORGANIZATION_DISPLAY_KEY}-${organizationNumber}`;
}

export function parseTaskSlug(
  slug: string,
): { contextKey: string; number: number } | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^([a-z0-9]+)-(\d+)$/i);
  if (!match) {
    return null;
  }
  const number = Number(match[2]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }
  return {
    contextKey: match[1]!.toUpperCase(),
    number,
  };
}

export function parseContactSlug(slug: string): number | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^c-(\d+)$/i);
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }
  return number;
}

export function parseOrganizationSlug(slug: string): number | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^o-(\d+)$/i);
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }
  return number;
}

export type HistoryEntryKind =
  | "navigate"
  | "task"
  | "document"
  | "letter"
  | "contact"
  | "organization"
  | "project"
  | "journal"
  | "settings";

export type HistoryEntryDisplay = {
  kind: HistoryEntryKind;
  navId?: NavigationItemIconId;
  badgeLabel: string;
  title: string;
};

const TOP_LEVEL_NAV: Record<
  string,
  { navId: NavigationItemIconId; badgeLabel: string }
> = {
  "/inbox": { navId: "inbox", badgeLabel: "Inbox" },
  "/journal": { navId: "journal", badgeLabel: "Journal" },
  "/knowledge": { navId: "knowledge", badgeLabel: "Knowledge" },
  "/tasks": { navId: "tasks", badgeLabel: "Tasks" },
  "/projects": { navId: "projects", badgeLabel: "Projects" },
  "/letters": { navId: "letters", badgeLabel: "Letters" },
  "/contacts": { navId: "contacts", badgeLabel: "Contacts" },
  "/organizations": { navId: "organizations", badgeLabel: "Organization" },
};

function pathnameFromHref(href: string): string {
  try {
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return new URL(href).pathname;
    }
  } catch {
    // fall through
  }

  const queryIndex = href.indexOf("?");
  return queryIndex === -1 ? href : href.slice(0, queryIndex);
}

function taskBadgeFromSlug(slug: string): string {
  const parsed = parseTaskSlug(slug);
  if (parsed) {
    return formatTaskDisplayId(parsed.contextKey, parsed.number);
  }
  return slug.toUpperCase();
}

function contactBadgeFromSlug(slug: string): string {
  const number = parseContactSlug(slug);
  if (number !== null) {
    return formatContactDisplayId(number);
  }
  return slug.toUpperCase();
}

function organizationBadgeFromSlug(slug: string): string {
  const number = parseOrganizationSlug(slug);
  if (number !== null) {
    return formatOrganizationDisplayId(number);
  }
  return slug.toUpperCase();
}

function letterBadgeFromSlug(slug: string): string {
  const number = parseLetterSlug(slug);
  if (number !== null) {
    return formatLetterDisplayId(number);
  }
  return slug.toUpperCase();
}

function entityKeyBadge(segment: string): string {
  const decoded = decodeURIComponent(segment);
  const contactNumber = parseContactSlug(decoded);
  if (contactNumber !== null) {
    return formatContactDisplayId(contactNumber);
  }
  const organizationNumber = parseOrganizationSlug(decoded);
  if (organizationNumber !== null) {
    return formatOrganizationDisplayId(organizationNumber);
  }
  return decoded.toUpperCase();
}

export function resolveHistoryEntryDisplay(
  href: string,
  title: string,
): HistoryEntryDisplay {
  const pathname = pathnameFromHref(href);

  const dueTaskMatch = pathname.match(/^\/tasks\/([^/]+)\/([^/]+)$/);
  if (dueTaskMatch) {
    const slug = decodeURIComponent(dueTaskMatch[2]!);
    return {
      kind: "task",
      badgeLabel: taskBadgeFromSlug(slug),
      title,
    };
  }

  const dueListMatch = pathname.match(/^\/tasks\/([^/]+)$/);
  if (dueListMatch) {
    const filter = dueListMatch[1]!;
    const badgeLabel = isTasksDueFilter(filter)
      ? TASKS_DUE_FILTER_LABELS[filter]
      : filter.replace(/-/g, " ");
    return {
      kind: "navigate",
      navId: "tasks",
      badgeLabel,
      title,
    };
  }

  const inboxDetailMatch = pathname.match(/^\/inbox\/([^/]+)$/);
  if (inboxDetailMatch) {
    const slug = decodeURIComponent(inboxDetailMatch[1]!);
    const taskParsed = parseTaskSlug(slug);
    if (taskParsed) {
      return {
        kind: "task",
        badgeLabel: formatTaskDisplayId(
          taskParsed.contextKey,
          taskParsed.number,
        ),
        title,
      };
    }

    const letterNumber = parseLetterSlug(slug);
    if (letterNumber !== null) {
      return {
        kind: "letter",
        badgeLabel: formatLetterDisplayId(letterNumber),
        title,
      };
    }

    return {
      kind: "navigate",
      navId: "inbox",
      badgeLabel: slug.toUpperCase(),
      title,
    };
  }

  const projectTaskMatch = pathname.match(
    /^\/projects\/[^/]+\/tasks\/([^/]+)$/,
  );
  if (projectTaskMatch) {
    const slug = decodeURIComponent(projectTaskMatch[1]!);
    return {
      kind: "task",
      badgeLabel: taskBadgeFromSlug(slug),
      title,
    };
  }

  const contactTaskMatch = pathname.match(
    /^\/contacts\/[^/]+\/tasks\/([^/]+)$/,
  );
  if (contactTaskMatch) {
    const slug = decodeURIComponent(contactTaskMatch[1]!);
    return {
      kind: "task",
      badgeLabel: taskBadgeFromSlug(slug),
      title,
    };
  }

  if (
    isProjectDocumentDetailPath(pathname) ||
    isKnowledgeDocumentDetailPath(pathname)
  ) {
    return {
      kind: "document",
      badgeLabel: "Document",
      title,
    };
  }

  const globalLetterMatch = pathname.match(/^\/letters\/([^/]+)$/);
  if (globalLetterMatch && globalLetterMatch[1] !== "new") {
    const slug = decodeURIComponent(globalLetterMatch[1]!);
    return {
      kind: "letter",
      badgeLabel: letterBadgeFromSlug(slug),
      title,
    };
  }

  const projectLetterMatch = pathname.match(
    /^\/projects\/[^/]+\/letters\/([^/]+)$/,
  );
  if (projectLetterMatch) {
    const slug = decodeURIComponent(projectLetterMatch[1]!);
    return {
      kind: "letter",
      badgeLabel: letterBadgeFromSlug(slug),
      title,
    };
  }

  if (pathname === "/letters/new" || /\/letters\/new$/.test(pathname)) {
    return {
      kind: "letter",
      navId: "letters",
      badgeLabel: "New",
      title,
    };
  }

  const journalDateMatch = pathname.match(/^\/journal\/([^/]+)$/);
  if (journalDateMatch) {
    return {
      kind: "journal",
      badgeLabel: journalDateMatch[1]!,
      title,
    };
  }

  const projectDetailMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectDetailMatch) {
    return {
      kind: "project",
      badgeLabel: entityKeyBadge(projectDetailMatch[1]!),
      title,
    };
  }

  if (pathname === "/projects/new") {
    return {
      kind: "project",
      navId: "projects",
      badgeLabel: "New",
      title,
    };
  }

  const contactDetailMatch = pathname.match(/^\/contacts\/([^/]+)$/);
  if (contactDetailMatch) {
    return {
      kind: "contact",
      badgeLabel: contactBadgeFromSlug(contactDetailMatch[1]!),
      title,
    };
  }

  const organizationContactDetailMatch = pathname.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)$/,
  );
  if (organizationContactDetailMatch) {
    return {
      kind: "contact",
      badgeLabel: contactBadgeFromSlug(organizationContactDetailMatch[2]!),
      title,
    };
  }

  const organizationPathMatch = pathname.match(
    /^\/organizations\/([^/]+)(?:\/(projects|contacts|letters))?\/?$/,
  );
  if (organizationPathMatch) {
    return {
      kind: "organization",
      badgeLabel: organizationBadgeFromSlug(organizationPathMatch[1]!),
      title,
    };
  }

  const projectDocumentsListMatch = pathname.match(
    /^\/projects\/([^/]+)\/documents\/?$/,
  );
  if (projectDocumentsListMatch) {
    return {
      kind: "navigate",
      navId: "projects",
      badgeLabel: entityKeyBadge(projectDocumentsListMatch[1]!),
      title,
    };
  }

  if (isSettingsPath(pathname)) {
    const tab = getSettingsTabMeta(getSettingsTabFromPath(pathname));
    return {
      kind: "settings",
      badgeLabel: tab.label,
      title,
    };
  }

  const topLevelNav = TOP_LEVEL_NAV[pathname];
  if (topLevelNav) {
    return {
      kind: "navigate",
      navId: topLevelNav.navId,
      badgeLabel: topLevelNav.badgeLabel,
      title,
    };
  }

  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  return {
    kind: "navigate",
    badgeLabel: lastSegment
      ? decodeURIComponent(lastSegment).slice(0, 16)
      : "Page",
    title,
  };
}
