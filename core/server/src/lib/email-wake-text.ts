/**
 * Trim email bodies for Judith wake payloads (OS-94).
 * Strips quoted history / signatures and caps length; full text stays
 * fetchable by message id when the agent needs more context.
 */

export const EMAIL_WAKE_TEXT_MAX_CHARS = 4_000;

const QUOTE_MARKERS: readonly RegExp[] = [
  /\nOn .{10,240} wrote:\s*\n/i,
  /\nOp .{10,240} schreef .{0,120}:\s*\n/i,
  /\n-+\s*Original Message\s*-+/i,
  /\n-+\s*Doorgestuurd bericht\s*-+/i,
  /\n-+\s*Forwarded message\s*-+/i,
  /\nFrom:\s.+\nSent:\s/i,
  /\nVan:\s.+\nVerzonden:\s/i,
  /\n_{5,}\s*\n/,
];

const SIGNATURE_MARKERS: readonly RegExp[] = [
  /\n-- \n/,
  /\n--\n/,
  /\nSent from my (iPhone|iPad|Android)/i,
  /\nVerzonden vanaf mijn /i,
  /\nGet Outlook for /i,
  /\n________________________________\n/,
];

function cutAtFirstMarker(text: string, markers: readonly RegExp[]): string {
  let cut = text.length;
  for (const marker of markers) {
    const match = text.match(marker);
    if (match?.index != null && match.index > 0 && match.index < cut) {
      cut = match.index;
    }
  }
  return text.slice(0, cut).trimEnd();
}

function stripLeadingQuoteLines(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^>/.test(line.trimStart()) && kept.some((entry) => entry.trim())) {
      break;
    }
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export function trimEmailTextForWake(
  text: string,
  maxChars: number = EMAIL_WAKE_TEXT_MAX_CHARS,
): string {
  let next = text.replace(/\r\n/g, "\n").trim();
  if (!next) return "";

  next = cutAtFirstMarker(next, QUOTE_MARKERS);
  next = stripLeadingQuoteLines(next);
  next = cutAtFirstMarker(next, SIGNATURE_MARKERS);
  next = next.trim();

  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
