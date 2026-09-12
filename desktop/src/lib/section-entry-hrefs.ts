import {
  getFirstCommunicationItemHref,
  getFirstInboxItemHref,
  getKnowledgeHref,
  getOrganizationsHref,
  getScopedContactSectionHref,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  resolveLetterDetailHref,
  type InboxListItem,
  type KnowledgeListItem,
} from "@backsteros/ui";

import {
  peekSectionEntryHref,
  rememberSectionEntryHrefs,
  type SectionEntryKey,
} from "./section-entry-store";

export { peekSectionEntryHref, rememberSectionEntryHrefs };
export type { SectionEntryKey };

function firstAlphaItem<T extends { name: string }>(items: readonly T[]): T | null {
  return groupItemsByAlphaLetter(items).flatMap(([, group]) => group)[0] ?? null;
}

export function firstContactRouteParam(
  contacts: readonly {
    id: string;
    name: string;
    number?: number | null;
    key?: string | null;
  }[],
): string | null {
  const first = firstAlphaItem(contacts);
  if (!first) return null;
  return getUniqueListItemRouteParam(first, contacts);
}

export function firstContactHref(
  contacts: readonly {
    id: string;
    name: string;
    number?: number | null;
    key?: string | null;
  }[],
): string | null {
  const param = firstContactRouteParam(contacts);
  return param ? getScopedContactSectionHref(param, "overview") : null;
}

export function firstOrganizationRouteParam(
  organizations: readonly {
    id: string;
    name: string;
    number?: number | null;
    key?: string | null;
  }[],
): string | null {
  const first = firstAlphaItem(organizations);
  if (!first) return null;
  return getUniqueListItemRouteParam(first, organizations);
}

export function firstOrganizationHref(
  organizations: readonly {
    id: string;
    name: string;
    number?: number | null;
    key?: string | null;
  }[],
): string | null {
  const param = firstOrganizationRouteParam(organizations);
  return param ? getOrganizationsHref(param) : null;
}

export function firstLetterHref(
  letters: readonly { id: string; number?: number | null }[],
): string | null {
  const first = letters[0];
  if (!first) return null;
  return resolveLetterDetailHref({
    id: first.id,
    number: first.number,
    listBaseHref: "/letters",
  });
}

export function firstLetterSlug(
  letters: readonly { id: string; number?: number | null }[],
): string | null {
  const href = firstLetterHref(letters);
  if (!href || href === "/letters") return null;
  if (!href.startsWith("/letters/")) return null;
  return href.slice("/letters/".length).split("/")[0] ?? null;
}

export function firstKnowledgeHref(
  documents: readonly KnowledgeListItem[],
): string | null {
  const first = documents.find((doc) => doc.kind !== "folder");
  if (!first) return null;
  return getKnowledgeHref(first.path ?? first.id);
}

export function rememberWorkspaceSectionEntries(input: {
  inboxItems: readonly InboxListItem[];
  communicationItems?: readonly InboxListItem[];
  contacts: readonly {
    id: string;
    name: string;
    number?: number | null;
    key?: string | null;
  }[];
  organizations: readonly {
    id: string;
    name: string;
    number?: number | null;
    key?: string | null;
  }[];
  letters: readonly { id: string; number?: number | null }[];
  knowledgeDocuments: readonly KnowledgeListItem[];
}): void {
  // Seed only — section roots always open these first items (never last-place).
  const seed: Partial<Record<SectionEntryKey, string | null>> = {};
  if (peekSectionEntryHref("inbox") == null) {
    seed.inbox = getFirstInboxItemHref(input.inboxItems) ?? null;
  }
  if (
    peekSectionEntryHref("communication") == null &&
    input.communicationItems
  ) {
    seed.communication =
      getFirstCommunicationItemHref(input.communicationItems) ?? null;
  }
  // Contacts / organizations catalogs live in main content — always list root.
  seed.contacts = "/contacts";
  seed.organizations = "/organizations";
  if (peekSectionEntryHref("letters") == null) {
    seed.letters = firstLetterHref(input.letters);
  }
  if (peekSectionEntryHref("knowledge") == null) {
    seed.knowledge = firstKnowledgeHref(input.knowledgeDocuments);
  }
  if (Object.keys(seed).length > 0) {
    rememberSectionEntryHrefs(seed);
  }
}
