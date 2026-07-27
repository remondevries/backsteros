/**
 * Desktop-parity section tab index from number keys (1 = first tab).
 * Matches `@backsteros/ui` `parseSectionTabIndex`.
 */
export function parseSectionTabIndex(
  key: string,
  character?: string | null,
): number | null {
  if (character && /^[1-9]$/.test(character)) {
    return Number(character) - 1;
  }
  const digitCode = /^Digit([1-9])$/.exec(key);
  if (digitCode?.[1]) {
    return Number(digitCode[1]) - 1;
  }
  if (/^[1-9]$/.test(key)) {
    return Number(key) - 1;
  }
  return null;
}
