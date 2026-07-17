import type { Letter } from "@/lib/db/schema";

export const LETTER_DISPLAY_KEY = "L";

export function formatLetterDisplayId(letterNumber: number): string {
  return `${LETTER_DISPLAY_KEY}-${letterNumber}`;
}

export function getLetterDisplayId(
  letter: Pick<Letter, "number">,
): string | null {
  if (!letter.number) {
    return null;
  }

  return formatLetterDisplayId(letter.number);
}
