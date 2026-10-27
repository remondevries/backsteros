export const CONTACT_SECTION_IDS = [
  "conversation",
  "overview",
  "details",
  "portal",
  "logs",
  "tasks",
  "letters",
] as const;

export type ContactSectionId = (typeof CONTACT_SECTION_IDS)[number];

export type ContactSectionConfig = {
  id: ContactSectionId;
  label: string;
  segment: string;
  supportsDetail: boolean;
};

/**
 * Base sections on the standalone contact profile card (Activity / Details).
 * Clients also get Portal (+ Logs when configured) via `resolveContactCardSections`.
 * Expand is the chrome icon + the next digit after the last card section — not a
 * toggle option. Tasks / Letters / … live in the expanded workspace (digits after expand).
 */
export const CONTACT_CARD_SECTIONS: readonly ContactSectionConfig[] = [
  { id: "overview", label: "Activity", segment: "", supportsDetail: false },
  {
    id: "details",
    label: "Details",
    segment: "details",
    supportsDetail: false,
  },
];

/** DOM hook so digit shortcuts can see which card sections are mounted. */
export const CONTACT_CARD_SECTION_IDS_ATTR = "data-contact-card-section-ids";

/**
 * Keep-alive panes stay mounted while hidden. Digit shortcuts must ignore their
 * card-section attrs or Contacts 1/2/3 can bind to a frozen Communication rail
 * (or the reverse) depending on DOM order.
 */
export function isContactCardSectionAttrVisible(node: Element): boolean {
  if (node.closest("[data-keep-alive-hidden]") != null) return false;
  const ariaHiddenRoot = node.closest("[aria-hidden]");
  if (ariaHiddenRoot?.getAttribute("aria-hidden") === "true") return false;
  return true;
}

function parseContactCardSectionIdsAttr(
  raw: string | null | undefined,
): ContactSectionId[] {
  const ids: ContactSectionId[] = [];
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim();
    if (
      id === "conversation" ||
      id === "overview" ||
      id === "details" ||
      id === "portal" ||
      id === "logs"
    ) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Card section ids currently shown on the contact rail (comma-separated attribute).
 * Falls back to Activity / Details when the rail is not mounted (tests, SSR).
 * Prefers a visible (non-keep-alive-hidden) node when several are mounted.
 */
export function readContactCardSectionIdsFromDom(): readonly ContactSectionId[] {
  if (typeof document === "undefined") {
    return CONTACT_CARD_SECTIONS.map((section) => section.id);
  }
  const nodes = document.querySelectorAll(`[${CONTACT_CARD_SECTION_IDS_ATTR}]`);
  let raw: string | null = null;
  for (const candidate of nodes) {
    if (!isContactCardSectionAttrVisible(candidate)) continue;
    raw = candidate.getAttribute(CONTACT_CARD_SECTION_IDS_ATTR)?.trim() || null;
    if (raw) break;
  }
  const ids = parseContactCardSectionIdsAttr(raw);
  return ids.length > 0
    ? ids
    : CONTACT_CARD_SECTIONS.map((section) => section.id);
}

/**
 * 0-based digit index of the first expanded-workspace tab.
 * Card sections occupy 1…N; expand is N+1; workspace starts at N+2.
 */
export function contactExpandedWorkspaceDigitStartIndex(
  cardSectionCount: number,
): number {
  return Math.max(0, cardSectionCount) + 1;
}

export const CONTACT_PORTAL_SECTION: ContactSectionConfig = {
  id: "portal",
  label: "Portal",
  segment: "portal",
  supportsDetail: false,
};

export const CONTACT_PORTAL_LOGS_SECTION: ContactSectionConfig = {
  id: "logs",
  label: "Logs",
  segment: "logs",
  supportsDetail: false,
};

/** All contact sections including tasks/letters (routing + org-scoped card). */
export const CONTACT_SECTIONS: readonly ContactSectionConfig[] = [
  ...CONTACT_CARD_SECTIONS,
  CONTACT_PORTAL_SECTION,
  CONTACT_PORTAL_LOGS_SECTION,
  { id: "tasks", label: "Tasks", segment: "tasks", supportsDetail: true },
  { id: "letters", label: "Letters", segment: "letters", supportsDetail: true },
];

export function isContactSectionId(value: string): value is ContactSectionId {
  return (CONTACT_SECTION_IDS as readonly string[]).includes(value);
}

export function isContactCardSectionId(
  value: string,
): value is "conversation" | "overview" | "details" | "portal" | "logs" {
  return (
    value === "conversation" ||
    value === "overview" ||
    value === "details" ||
    value === "portal" ||
    value === "logs"
  );
}

/** Chat right-rail card: conversation Details, then Activity / Contact (+ Portal). */
export const CHAT_CONTACT_CONVERSATION_SECTION: ContactSectionConfig = {
  id: "conversation",
  label: "Details",
  segment: "conversation",
  supportsDetail: false,
};

export function resolveChatContactCardSections(options?: {
  showPortal?: boolean;
  showPortalLogs?: boolean;
}): ContactSectionConfig[] {
  const contactDetails: ContactSectionConfig = {
    id: "details",
    label: "Contact",
    segment: "details",
    supportsDetail: false,
  };
  const base: ContactSectionConfig[] = [
    CHAT_CONTACT_CONVERSATION_SECTION,
    CONTACT_CARD_SECTIONS[0]!, // Activity
    contactDetails,
  ];
  if (!options?.showPortal) return base;
  const sections = [...base, CONTACT_PORTAL_SECTION];
  if (options.showPortalLogs) {
    sections.push(CONTACT_PORTAL_LOGS_SECTION);
  }
  return sections;
}

/** Email rail first tab — same id as chat Details, labeled E-mail. */
const EMAIL_CONTACT_CONVERSATION_SECTION: ContactSectionConfig = {
  ...CHAT_CONTACT_CONVERSATION_SECTION,
  label: "E-mail",
};

/**
 * Communication → Chat email rail: E-mail only until an organization or
 * contact is linked; then Activity / Contact (+ Portal) like chat (Details
 * stays the chat sidepanel label).
 */
export function resolveCommunicationEmailCardSections(options?: {
  linked?: boolean;
  showPortal?: boolean;
  showPortalLogs?: boolean;
}): ContactSectionConfig[] {
  if (!options?.linked) {
    return [EMAIL_CONTACT_CONVERSATION_SECTION];
  }
  const sections = resolveChatContactCardSections({
    showPortal: options.showPortal,
    showPortalLogs: options.showPortalLogs,
  });
  return sections.map((entry) =>
    entry.id === "conversation" ? EMAIL_CONTACT_CONVERSATION_SECTION : entry,
  );
}

/**
 * Communication → Chat support rail: Details (ticket properties) only until
 * a contact/org is linked; then Activity / Contact (+ Portal) like email.
 */
export function resolveCommunicationSupportCardSections(options?: {
  linked?: boolean;
  showPortal?: boolean;
  showPortalLogs?: boolean;
}): ContactSectionConfig[] {
  if (!options?.linked) {
    return [CHAT_CONTACT_CONVERSATION_SECTION];
  }
  return resolveChatContactCardSections({
    showPortal: options.showPortal,
    showPortalLogs: options.showPortalLogs,
  });
}

/** Card sections for a contact — Portal (+ Logs when configured). */
export function resolveContactCardSections(options?: {
  showPortal?: boolean;
  showPortalLogs?: boolean;
}): ContactSectionConfig[] {
  if (!options?.showPortal) {
    return [...CONTACT_CARD_SECTIONS];
  }
  const sections: ContactSectionConfig[] = [
    ...CONTACT_CARD_SECTIONS,
    CONTACT_PORTAL_SECTION,
  ];
  if (options.showPortalLogs) {
    sections.push(CONTACT_PORTAL_LOGS_SECTION);
  }
  return sections;
}

/** Parse a URL segment (`tasks`, `letters`, …). Empty / missing → overview. */
export function parseContactSectionId(
  value: string | null | undefined,
): ContactSectionId {
  if (!value || value === "overview") return "overview";
  // Legacy feed tab lived at /activity, then became Details.
  if (value === "activity") return "details";
  // Relationships folded into Details.
  if (value === "relationships") return "details";
  return isContactSectionId(value) ? value : "overview";
}

/** Path after `/contacts/{slug}` — empty for overview (Activity tab). */
export function getContactSectionSegment(section: ContactSectionId): string {
  return section === "overview" ? "" : section;
}

export function getContactSectionHref(
  contactSlug: string,
  section: ContactSectionId = "overview",
): string {
  const base = `/contacts/${encodeURIComponent(contactSlug)}`;
  const segment = getContactSectionSegment(section);
  return segment ? `${base}/${segment}` : base;
}

export function getActiveContactSection(
  pathname: string,
  contactSlug: string,
): ContactSectionId {
  const base = `/contacts/${encodeURIComponent(contactSlug)}`;
  const normalized = pathname.replace(/\/+$/, "") || "/";

  for (const section of CONTACT_SECTIONS) {
    if (!section.segment) continue;
    const sectionPath = `${base}/${section.segment}`;
    if (
      normalized === sectionPath ||
      normalized.startsWith(`${sectionPath}/`)
    ) {
      return section.id;
    }
  }

  return "overview";
}

export function isContactSectionDetailPath(
  pathname: string,
  contactSlug: string,
): boolean {
  const base = `/contacts/${encodeURIComponent(contactSlug)}`;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const sectionId = getActiveContactSection(normalized, contactSlug);
  const section = CONTACT_SECTIONS.find((entry) => entry.id === sectionId);

  if (!section?.supportsDetail) {
    return false;
  }

  const sectionRoot = section.segment ? `${base}/${section.segment}` : base;
  return (
    normalized.length > sectionRoot.length + 1 &&
    normalized.startsWith(`${sectionRoot}/`)
  );
}

export function shouldShowContactNav(
  pathname: string,
  contactSlug: string,
): boolean {
  return !isContactSectionDetailPath(pathname, contactSlug);
}
