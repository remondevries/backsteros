import type { MentionSegment } from "./tokens";

export type MentionChipLayout = "inline" | "block";

/** List / heading / quote markers that open a markdown line. */
const STRUCTURAL_LINE_PREFIX_RE =
  /^(?:\s*)(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/;

function isMarkdownSegment(
  segment: MentionSegment | undefined,
): segment is Extract<MentionSegment, { type: "markdown" }> {
  return segment?.type === "markdown";
}

function lastLine(content: string): string {
  const lines = content.split("\n");
  return lines[lines.length - 1] ?? "";
}

function firstLine(content: string): string {
  return content.split("\n")[0] ?? "";
}

/** Strip a leading list/heading/blockquote marker from a single line. */
export function stripStructuralLinePrefix(line: string): string {
  return line.replace(STRUCTURAL_LINE_PREFIX_RE, "");
}

/**
 * If `content` ends with a structural line prefix (optionally after a newline),
 * split it so renderers can keep list/quote markers with the following mention.
 */
export function splitTrailingStructuralPrefix(content: string): {
  head: string;
  prefix: string;
} | null {
  const match = content.match(
    /(?:^|\n)([ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+\.[ \t]+|>[ \t]?))$/,
  );
  if (!match || match.index == null) {
    return null;
  }

  const prefix = match[1] ?? "";
  if (!prefix) {
    return null;
  }

  return {
    head: content.slice(0, match.index + (match[0].startsWith("\n") ? 1 : 0)),
    prefix,
  };
}

/**
 * Parse a list-item opener at the start of a markdown segment.
 * Leading newlines are returned separately so callers can flush them first.
 */
export function matchListItemOpener(content: string): {
  leadingNewlines: string;
  ordered: boolean;
  /** Text after the list marker on the same line (may be empty). */
  textAfterMarker: string;
} | null {
  const match = content.match(
    /^(\n*)([ \t]*)([-*+]|\d+\.)([ \t]+)([^\n]*)$/,
  );
  if (!match) {
    return null;
  }

  return {
    leadingNewlines: match[1] ?? "",
    ordered: /^\d+\.$/.test(match[3] ?? ""),
    textAfterMarker: match[5] ?? "",
  };
}

function isMentionOnOwnLine(
  segments: MentionSegment[],
  mentionIndex: number,
): boolean {
  const before = segments[mentionIndex - 1];
  const after = segments[mentionIndex + 1];

  // List/heading/quote markers count as same-line structure, so
  // `- [@task:…]` stays compact/inline next to the bullet — only a bare
  // own-line mention (no marker) uses the full-width block card.
  if (isMarkdownSegment(before) && lastLine(before.content).trim() !== "") {
    return false;
  }

  if (isMarkdownSegment(after) && firstLine(after.content).trim() !== "") {
    return false;
  }

  const beforeOk =
    !before ||
    (isMarkdownSegment(before) && /(?:^|\n)\s*$/.test(before.content));
  const afterOk =
    !after || (isMarkdownSegment(after) && /^\s*(?:\n|$)/.test(after.content));

  return beforeOk && afterOk;
}

function isParagraphOnlyMention(
  segments: MentionSegment[],
  mentionIndex: number,
): boolean {
  return segments.every((segment, index) => {
    if (index === mentionIndex) {
      return segment.type === "mention";
    }

    return segment.type === "markdown" && segment.content.trim() === "";
  });
}

/**
 * Task / project / letter mentions on their own bare line use full-width
 * block chips; mentions in sentences or list/heading/quote lines stay inline.
 * Keep in sync with `@backsteros/ui` `mentions/mention-layout.ts`.
 */
export function resolveMentionLayout(
  segments: MentionSegment[],
  mentionIndex: number,
): MentionChipLayout {
  const segment = segments[mentionIndex];
  if (segment?.type !== "mention") {
    return "inline";
  }

  if (
    segment.token.kind !== "task" &&
    segment.token.kind !== "project" &&
    segment.token.kind !== "letter"
  ) {
    return "inline";
  }

  if (isParagraphOnlyMention(segments, mentionIndex)) {
    return "block";
  }

  return isMentionOnOwnLine(segments, mentionIndex) ? "block" : "inline";
}
