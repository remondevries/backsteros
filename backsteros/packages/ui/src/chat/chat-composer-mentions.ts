/**
 * Plain-text @ mention trigger + document model for the shell chat composer.
 * Serialization always uses raw `[@kind:…]` tokens; the editor shows chips.
 */
import type { MentionCatalog, MentionItem } from "../mentions/mention-menu-types.js";
import type { MentionMenuTriggerState } from "../mentions/mention-menu-types.js";
import {
  MENTION_TOKEN_RE,
  mentionTokenLabel,
  parseMentionToken,
  segmentMarkdownWithMentions,
  type ParsedMentionToken,
} from "../mentions/mention-tokens.js";
import {
  resolveMentionCatalogContact,
  resolveMentionCatalogDocument,
  resolveMentionCatalogEmail,
  resolveMentionCatalogEstimate,
  resolveMentionCatalogHabit,
  resolveMentionCatalogInvoice,
  resolveMentionCatalogJournal,
  resolveMentionCatalogLetter,
  resolveMentionCatalogMeeting,
  resolveMentionCatalogMessage,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogPost,
  resolveMentionCatalogProject,
  resolveMentionCatalogTask,
  resolveMentionCatalogTransaction,
} from "../mentions/resolve-catalog-entry.js";
import { buildMentionToken } from "../mentions/tokens.js";

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

/** Insert a picked mention item as `[@kind:…] ` (always trailing space). */
export function insertMentionItemAtTrigger(
  text: string,
  trigger: MentionMenuTriggerState,
  item: MentionItem,
): { text: string; cursor: number; token: string; label: string } {
  const token = buildMentionToken(item);
  const result = insertMentionTokenAtTrigger(text, trigger, token);
  return {
    ...result,
    token,
    label: mentionItemChipLabel(item),
  };
}

export type ComposerMentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; token: ParsedMentionToken; raw: string; label: string };

/** Chip label for a picked menu item (name/title, not only the key). */
export function mentionItemChipLabel(item: MentionItem): string {
  switch (item.kind) {
    case "task":
    case "letter":
    case "email":
    case "document":
    case "meeting":
    case "journal":
    case "habit":
    case "message":
    case "post":
    case "transaction":
    case "invoice":
    case "estimate":
      return item.title.trim() || mentionTokenLabel(parseMentionToken(buildMentionToken(item))!);
    case "project":
    case "contact":
    case "organization":
      return item.name.trim() || item.key;
  }
}

/** Resolve a display label for an existing token (catalog → name/title). */
export function resolveComposerMentionChipLabel(
  token: ParsedMentionToken,
  catalog?: MentionCatalog | null,
  preferredLabel?: string | null,
): string {
  const preferred = preferredLabel?.trim();
  if (preferred) return preferred;
  if (!catalog) return mentionTokenLabel(token);

  switch (token.kind) {
    case "task":
      return resolveMentionCatalogTask(token, catalog)?.title ?? mentionTokenLabel(token);
    case "project":
      return resolveMentionCatalogProject(token, catalog)?.name ?? mentionTokenLabel(token);
    case "contact":
      return resolveMentionCatalogContact(token, catalog)?.name ?? mentionTokenLabel(token);
    case "organization":
      return (
        resolveMentionCatalogOrganization(token, catalog)?.name ??
        mentionTokenLabel(token)
      );
    case "document":
      return (
        resolveMentionCatalogDocument(token, catalog)?.title ??
        mentionTokenLabel(token)
      );
    case "letter":
      return resolveMentionCatalogLetter(token, catalog)?.title ?? mentionTokenLabel(token);
    case "email":
      return resolveMentionCatalogEmail(token, catalog)?.title ?? mentionTokenLabel(token);
    case "meeting":
      return resolveMentionCatalogMeeting(token, catalog)?.title ?? mentionTokenLabel(token);
    case "journal":
      return resolveMentionCatalogJournal(token, catalog)?.title ?? mentionTokenLabel(token);
    case "habit":
      return resolveMentionCatalogHabit(token, catalog)?.title ?? mentionTokenLabel(token);
    case "message":
      return resolveMentionCatalogMessage(token, catalog)?.title ?? mentionTokenLabel(token);
    case "post":
      return resolveMentionCatalogPost(token, catalog)?.title ?? mentionTokenLabel(token);
    case "transaction":
      return (
        resolveMentionCatalogTransaction(token, catalog)?.title ??
        mentionTokenLabel(token)
      );
    case "invoice":
      return resolveMentionCatalogInvoice(token, catalog)?.title ?? mentionTokenLabel(token);
    case "estimate":
      return (
        resolveMentionCatalogEstimate(token, catalog)?.title ??
        mentionTokenLabel(token)
      );
  }
}

/**
 * Parse composer plain text into text + mention segments.
 * Mentions keep their raw token for serialization; labels come from catalog.
 */
export function parseComposerMentionDoc(
  text: string,
  catalog?: MentionCatalog | null,
): ComposerMentionSegment[] {
  if (!text) return [{ type: "text", text: "" }];
  const out: ComposerMentionSegment[] = [];
  for (const segment of segmentMarkdownWithMentions(text)) {
    if (segment.type === "mention") {
      out.push({
        type: "mention",
        token: segment.token,
        raw: segment.raw,
        label: resolveComposerMentionChipLabel(segment.token, catalog),
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

/** Serialize editor segments back to plain text with raw `[@kind:…]` tokens. */
export function serializeComposerMentionDoc(
  segments: readonly ComposerMentionSegment[],
): string {
  let out = "";
  for (const segment of segments) {
    if (segment.type === "text") out += segment.text;
    else out += segment.raw;
  }
  return out;
}

/** @deprecated Prefer {@link parseComposerMentionDoc}. */
export function segmentComposerMentionText(
  text: string,
  catalog?: MentionCatalog | null,
): ComposerMentionSegment[] {
  return parseComposerMentionDoc(text, catalog);
}

/** True when `text` contains at least one parseable `[@kind:…]` token. */
export function composerTextHasMentionTokens(text: string): boolean {
  MENTION_TOKEN_RE.lastIndex = 0;
  const match = MENTION_TOKEN_RE.exec(text);
  if (!match) return false;
  return parseMentionToken(match[0]) != null;
}

/** Round-trip: parse → serialize must preserve tokens and whitespace. */
export function roundTripComposerMentionText(
  text: string,
  catalog?: MentionCatalog | null,
): string {
  return serializeComposerMentionDoc(parseComposerMentionDoc(text, catalog));
}
