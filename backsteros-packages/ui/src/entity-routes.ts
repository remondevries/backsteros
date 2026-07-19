export type OrganizationListItem = {
  id: string;
  name: string;
  number?: number | null;
  key?: string | null;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | null;
  avatarSrc?: string | null;
};

export function getOrganizationsHref(numberOrId?: number | string): string {
  if (numberOrId == null) return "/organizations";
  return `/organizations/${numberOrId}`;
}

export function getSelectedOrganizationSlugFromPathname(
  pathname: string,
): string | null {
  const match = pathname.match(/^\/organizations\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function isOrganizationSectionPath(pathname: string): boolean {
  return (
    pathname === "/organizations" || pathname.startsWith("/organizations/")
  );
}

export function organizationMatchesSlug(
  organization: OrganizationListItem,
  slug: string | null,
): boolean {
  if (!slug) return false;
  if (organization.id === slug) return true;
  if (organization.key && organization.key.toLowerCase() === slug.toLowerCase()) {
    return true;
  }
  if (organization.number != null && String(organization.number) === slug) {
    return true;
  }
  return false;
}

export type ContactListItem = {
  id: string;
  name: string;
  number?: number | null;
  key?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  email?: string | null;
  title?: string | null;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | null;
  avatarSrc?: string | null;
};

export function getContactsHref(numberOrId?: number | string): string {
  if (numberOrId == null) return "/contacts";
  return `/contacts/${numberOrId}`;
}

/**
 * Prefer number, then key, then id — but skip number/key when another sibling
 * shares them so list hrefs stay unique (avoids selecting the wrong row).
 */
export function getUniqueListItemRouteParam(
  item: { id: string; number?: number | null; key?: string | null },
  siblings: readonly { id: string; number?: number | null; key?: string | null }[],
): string {
  if (item.number != null) {
    const number = item.number;
    if (siblings.filter((sibling) => sibling.number === number).length === 1) {
      return String(number);
    }
  }
  if (item.key) {
    const key = item.key;
    if (
      siblings.filter(
        (sibling) =>
          sibling.key != null &&
          sibling.key.toLowerCase() === key.toLowerCase(),
      ).length === 1
    ) {
      return item.key;
    }
  }
  return item.id;
}

export function getSelectedContactSlugFromPathname(
  pathname: string,
): string | null {
  const orgMatch = pathname.match(
    /^\/organizations\/[^/]+\/contacts\/([^/]+)/,
  );
  if (orgMatch) {
    return decodeURIComponent(orgMatch[1]!);
  }

  const match = pathname.match(/^\/contacts\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function isContactSectionPath(pathname: string): boolean {
  return pathname === "/contacts" || pathname.startsWith("/contacts/");
}

export function contactMatchesSlug(
  contact: ContactListItem,
  slug: string | null,
): boolean {
  if (!slug) return false;
  if (contact.id === slug) return true;
  if (contact.key && contact.key.toLowerCase() === slug.toLowerCase()) {
    return true;
  }
  if (contact.number != null && String(contact.number) === slug) {
    return true;
  }
  return false;
}

export type KnowledgeListItem = {
  id: string;
  title: string;
  path?: string | null;
  kind?: "document" | "folder";
  parentId?: string | null;
  sortOrder?: number;
  icon?: string | null;
  /** Set for project-scoped documents (`type=project`). */
  projectId?: string | null;
};

export function getKnowledgeHref(pathOrId?: string): string {
  if (!pathOrId) return "/knowledge";
  // Preserve path separators (Next parity) — encode then restore `/`.
  const encoded = encodeURIComponent(pathOrId).replace(/%2F/gi, "/");
  return encoded ? `/knowledge/${encoded}` : "/knowledge";
}

export function getSelectedKnowledgeSlugFromPathname(
  pathname: string,
): string | null {
  if (!pathname.startsWith("/knowledge/")) return null;
  const slug = pathname.slice("/knowledge/".length);
  return slug ? decodeURIComponent(slug) : null;
}

export function isKnowledgeSectionPath(pathname: string): boolean {
  return pathname === "/knowledge" || pathname.startsWith("/knowledge/");
}

export type ProjectListItem = {
  id: string;
  name: string;
  key: string;
  status?: string | null;
  icon?: string | null;
};

export function getProjectsHref(keyOrId?: string): string {
  if (!keyOrId) return "/projects";
  return `/projects/${encodeURIComponent(keyOrId)}`;
}

export function isProjectsPath(pathname: string): boolean {
  return pathname === "/projects" || pathname.startsWith("/projects/");
}
