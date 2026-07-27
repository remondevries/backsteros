/** Same rules as `@backsteros/ui` `parseTaskSlug`. */

export function parseTaskSlug(
  slug: string,
): { contextKey: string; number: number } | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^([a-z0-9]+)-(\d+)$/i);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isInteger(number) || number < 1) return null;
  return {
    contextKey: match[1]!.toUpperCase(),
    number,
  };
}
