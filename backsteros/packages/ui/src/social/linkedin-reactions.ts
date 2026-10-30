import type { LinkedInReactionType } from "@backsteros/contracts";

export const LINKEDIN_REACTION_OPTIONS: readonly {
  id: LinkedInReactionType;
  label: string;
  /** Compact mark for the right-nav filing control. */
  glyph: string;
}[] = [
  { id: "LIKE", label: "Like", glyph: "👍" },
  { id: "PRAISE", label: "Celebrate", glyph: "👏" },
  { id: "EMPATHY", label: "Support", glyph: "🤍" },
  { id: "APPRECIATION", label: "Love", glyph: "❤️" },
  { id: "INTEREST", label: "Insightful", glyph: "💡" },
  { id: "ENTERTAINMENT", label: "Funny", glyph: "😄" },
] as const;

export function linkedInReactionLabel(
  type: string | null | undefined,
): string {
  const match = LINKEDIN_REACTION_OPTIONS.find((entry) => entry.id === type);
  return match?.label ?? "Like";
}

export function linkedInReactionGlyph(
  type: string | null | undefined,
): string | null {
  const match = LINKEDIN_REACTION_OPTIONS.find((entry) => entry.id === type);
  return match?.glyph ?? null;
}

/** Countries mapped by Zernio for LinkedIn geo-restriction (subset for UI). */
export const LINKEDIN_GEO_COUNTRY_OPTIONS: readonly {
  code: string;
  label: string;
}[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "NL", label: "Netherlands" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgium" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "IE", label: "Ireland" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "CH", label: "Switzerland" },
  { code: "AT", label: "Austria" },
  { code: "PT", label: "Portugal" },
  { code: "PL", label: "Poland" },
  { code: "BR", label: "Brazil" },
] as const;

/**
 * Wrap bare LinkedIn profile/company URLs as `@[url]` for Zernio resolution.
 */
export function wrapLinkedInMentionUrls(text: string): string {
  const pattern =
    /(?<!@\[)(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^\s)\]]+)/gi;
  return text.replace(pattern, (match) => `@[${match}]`);
}

export function extractLinkedInMentionCandidate(
  text: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(
    /(^|\s)(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^\s]*)$/i,
  );
  if (!match) return null;
  const query = match[2] ?? "";
  const start = caret - query.length;
  return { start, end: caret, query };
}
