/** Same rules as `@backsteros/ui` `formatLetterDisplayId`. */

export const LETTER_DISPLAY_KEY = "L";

export function formatLetterDisplayId(letterNumber: number): string {
  return `${LETTER_DISPLAY_KEY}-${letterNumber}`;
}
