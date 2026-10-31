/**
 * Plain-text @ mention trigger + insert helpers for the shell chat composer.
 * Mirrors CodeMirror `computeMentionTriggerState` without an editor view.
 */
import {
  MENTION_TOKEN_RE,
  parseMentionToken,
  segmentMarkdownWithMentions,
  type ParsedMentionToken,
} from "../mentions/mention-tokens.js";
import type { MentionMenuTriggerState } from "../mentions/mention-menu-types.js";

const MENTION_TRIGGER_RE = /(?:^|\s)@([^\s@]{0,60})$/;

/**
 * Detect an open `@query` mention trigger ending at `cursor` in plain text.
 * Returns null when the caret is not in a mention query.
 */
export function computePlainTextMentionTrigger(
  text: string,
  cursor: number,
): MentionMenuTriggerState | null {
  if (cursor < 0 || cursor > text.length) return null;
  // Only consider the current line (same as the CodeMirror trigger).
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const before = text.slice(lineStart, cursor);
  const match = MENTION_TRIGGER_RE.exec(before);
  if (!match) return null;

  const atOffset = match.index + match[0].length - match[1]!.length - 1;
  const from = lineStart + atOffset;
  const to = cursor;
  const query = match[1] ?? "";
  return { from, to, query };
}

/** Replace the active `@query` span with a mention token (+ trailing space). */
export function insertMentionTokenAtTrigger(
  text: string,
  trigger: MentionMenuTriggerState,
  token: string,
): { text: string; cursor: number } {
  const insert = token.endsWith(" ") ? token : `${token} `;
  const next = `${text.slice(0, trigger.from)}${insert}${text.slice(trigger.to)}`;
  return { text: next, cursor: trigger.from + insert.length };
}

export type ComposerMentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; token: ParsedMentionToken; raw: string };

/** Segment composer text for the chip mirror (mentions + plain runs). */
export function segmentComposerMentionText(
  text: string,
): ComposerMentionSegment[] {
  if (!text) return [{ type: "text", text: "" }];
  const out: ComposerMentionSegment[] = [];
  for (const segment of segmentMarkdownWithMentions(text)) {
    if (segment.type === "mention") {
      out.push({
        type: "mention",
        token: segment.token,
        raw: segment.raw,
      });
      continue;
    }
    if (segment.type === "markdown") {
      if (segment.content) out.push({ type: "text", text: segment.content });
      continue;
    }
    out.push({ type: "text", text: segment.raw });
  }
  return out.length > 0 ? out : [{ type: "text", text }];
}

/** True when `text` contains at least one parseable `[@kind:…]` token. */
export function composerTextHasMentionTokens(text: string): boolean {
  MENTION_TOKEN_RE.lastIndex = 0;
  const match = MENTION_TOKEN_RE.exec(text);
  if (!match) return false;
  return parseMentionToken(match[0]) != null;
}
