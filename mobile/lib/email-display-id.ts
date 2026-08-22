/** Mirrors `@backsteros/ui` email display ids (`E-1`, `E-2`, …) for mobile. */

export const EMAIL_DISPLAY_KEY = "E";

export function formatEmailDisplayId(number: number): string {
  return `${EMAIL_DISPLAY_KEY}-${number}`;
}

export function parseEmailDisplayId(displayId: string): number | null {
  const match = displayId
    .trim()
    .match(new RegExp(`^${EMAIL_DISPLAY_KEY}-(\\d+)$`, "i"));
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
