import type { KnowledgeListItem } from "../navigation/entity-routes.js";

export type HelpArticleIndividualContactLookup = {
  name: string;
  avatarSrc?: string | null;
};

export type HelpArticleIndividualContactGroup = {
  /** `null` = documents with no contacts. */
  contactId: string | null;
  label: string;
  avatarSrc?: string | null;
  items: KnowledgeListItem[];
};

const UNASSIGNED_LABEL = "No contacts";

/**
 * Group Individual Support articles by their primary contact (first
 * `contactIds` entry). Documents with no contacts land in a trailing
 * “No contacts” group. Each document appears once.
 */
export function groupHelpArticleIndividualDocumentsByContact(
  documents: readonly KnowledgeListItem[],
  contactById?: ReadonlyMap<string, HelpArticleIndividualContactLookup>,
): HelpArticleIndividualContactGroup[] {
  const groups = new Map<string | null, HelpArticleIndividualContactGroup>();

  const ensureGroup = (
    contactId: string | null,
  ): HelpArticleIndividualContactGroup => {
    const existing = groups.get(contactId);
    if (existing) return existing;
    if (contactId == null) {
      const unassigned: HelpArticleIndividualContactGroup = {
        contactId: null,
        label: UNASSIGNED_LABEL,
        avatarSrc: null,
        items: [],
      };
      groups.set(null, unassigned);
      return unassigned;
    }
    const known = contactById?.get(contactId);
    const next: HelpArticleIndividualContactGroup = {
      contactId,
      label: known?.name?.trim() || contactId,
      avatarSrc: known?.avatarSrc ?? null,
      items: [],
    };
    groups.set(contactId, next);
    return next;
  };

  for (const item of documents) {
    if (item.kind === "folder") continue;
    const primaryContactId = item.contactIds?.find((id) => id.trim()) ?? null;
    ensureGroup(primaryContactId).items.push(item);
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.title.localeCompare(b.title);
    });
  }

  const assigned = [...groups.values()]
    .filter((group) => group.contactId != null)
    .sort((a, b) => a.label.localeCompare(b.label));
  const unassigned = groups.get(null);
  return unassigned ? [...assigned, unassigned] : assigned;
}
