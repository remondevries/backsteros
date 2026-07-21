import type { MentionSegment } from "./tokens";

export type MentionChipLayout = "inline" | "block";

/** List / heading / quote markers that open a line without being "sentence" text. */
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

function isBlankOrStructuralPrefixLine(line: string): boolean {
  return stripStructuralLinePrefix(line).trim() === "";
}

/**
 * If `content` ends with a structural line prefix (optionally after a newline),
 * split it so renderers can wrap the following block mention in a list/quote.
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

function isMentionOnOwnLine(
  segments: MentionSegment[],
  mentionIndex: number,
): boolean {
  const before = segments[mentionIndex - 1];
  const after = segments[mentionIndex + 1];

  // List markers / headings / quotes before the mention do not count as
  // "sentence text" — `- [@task:…]` is still alone on its line.
  if (
    isMarkdownSegment(before) &&
    !isBlankOrStructuralPrefixLine(lastLine(before.content))
  ) {
    return false;
  }

  if (isMarkdownSegment(after) && firstLine(after.content).trim() !== "") {
    return false;
  }

  const beforeOk =
    !before ||
    (isMarkdownSegment(before) &&
      (/(?:^|\n)\s*$/.test(before.content) ||
        isBlankOrStructuralPrefixLine(lastLine(before.content))));
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
 * Task / project / letter mentions on their own line use full-width block
 * chips; mentions embedded in a sentence stay compact/inline.
 * Structural prefixes (`- `, `1. `, `# `, `> `) still count as own-line.
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
