import {
  getFirstInboxItemHref,
  getKnowledgeHref,
  getLettersHref,
  getOrganizationsHref,
  getScopedContactSectionHref,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  type InboxListItem,
  type KnowledgeListItem,
} from "@backsteros/ui";

type SectionEntryKey =
  | "inbox"
  | "contacts"
  | "organizations"
  | "letters"
  | "knowledge";

const entries: Record<SectionEntryKey, string | null> = {
  inbox: null,
  contacts: null,
  organizations: null,
  letters: null,
  knowledge: null,
};

export function rememberSectionEntryHrefs(
  next: Partial<Record<SectionEntryKey, string | null>>,
): void {
  Object.assign(entries, next);
}

export function peekSectionEntryHref(key: SectionEntryKey): string | null {
  return entries[key];
}

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
  letters: readonly { number?: number | null }[],
): string | null {
  const first = letters[0];
  if (first?.number == null) return null;
  return getLettersHref(first.number);
}

export function firstLetterSlug(
  letters: readonly { number?: number | null }[],
): string | null {
  const href = firstLetterHref(letters);
  if (!href || href === "/letters" || href === "/letters-v2") return null;
  const fromV2 = href.startsWith("/letters-v2/")
    ? href.slice("/letters-v2/".length)
    : href.startsWith("/letters/")
      ? href.slice("/letters/".length)
      : null;
  return fromV2?.split("/")[0] ?? null;
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
  letters: readonly { number?: number | null }[];
  knowledgeDocuments: readonly KnowledgeListItem[];
}): void {
  rememberSectionEntryHrefs({
    inbox: getFirstInboxItemHref(input.inboxItems) ?? null,
    contacts: firstContactHref(input.contacts),
    organizations: firstOrganizationHref(input.organizations),
    letters: firstLetterHref(input.letters),
    knowledge: firstKnowledgeHref(input.knowledgeDocuments),
  });
}
