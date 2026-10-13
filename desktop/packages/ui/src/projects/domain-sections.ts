export const DOMAIN_SECTION_IDS = ["details", "cloudflare"] as const;

export type DomainSectionId = (typeof DOMAIN_SECTION_IDS)[number];

export type DomainSectionConfig = {
  id: DomainSectionId;
  label: string;
};

/** Base tabs on the Catalog Domains profile card. */
export const DOMAIN_CARD_SECTIONS: readonly DomainSectionConfig[] = [
  { id: "details", label: "Details" },
];

export const DOMAIN_CLOUDFLARE_SECTION: DomainSectionConfig = {
  id: "cloudflare",
  label: "Cloudflare",
};

/** Card tabs — inserts Cloudflare when the project has a linked zone. */
export function resolveDomainCardSections(options?: {
  showCloudflare?: boolean;
}): DomainSectionConfig[] {
  if (!options?.showCloudflare) {
    return [...DOMAIN_CARD_SECTIONS];
  }
  return [...DOMAIN_CARD_SECTIONS, DOMAIN_CLOUDFLARE_SECTION];
}

export function isDomainSectionId(value: string): value is DomainSectionId {
  return (DOMAIN_SECTION_IDS as readonly string[]).includes(
    value as DomainSectionId,
  );
}

export function parseDomainSectionId(
  value: string | null | undefined,
): DomainSectionId {
  if (value === "cloudflare") return "cloudflare";
  return "details";
}
