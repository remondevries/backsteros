import type { MentionSegment } from "../mention-tokens.js";

export type MentionChipLayout = "inline" | "block";

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

function isMentionOnOwnLine(
  segments: MentionSegment[],
  mentionIndex: number,
): boolean {
  const before = segments[mentionIndex - 1];
  const after = segments[mentionIndex + 1];

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
 * Task / project / letter mentions on their own line use full-width block
 * chips; mentions embedded in a sentence stay compact/inline.
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
