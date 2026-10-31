/**
 * Parse `[@kind:…]` tokens from chat message bodies (agents / shell chat).
 * Kept in core/server so webhook + thread APIs do not depend on the UI package.
 */

export const CHAT_MENTION_KIND_ALT =
  "task|project|contact|organization|document|letter|email|meeting|journal|habit|message|post|transaction|invoice|estimate";

export const CHAT_MENTION_TOKEN_RE = new RegExp(
  `\\[@(${CHAT_MENTION_KIND_ALT}):([^\\]]+)\\]`,
  "g",
);

export type ParsedChatMentionToken =
  | { kind: "task"; displayId: string; raw: string }
  | { kind: "letter"; displayId: string; raw: string }
  | { kind: "email"; displayId: string; raw: string }
  | { kind: "meeting"; displayId: string; raw: string }
  | { kind: "project"; key: string; raw: string }
  | { kind: "contact"; key: string; raw: string }
  | { kind: "organization"; key: string; raw: string }
  | {
      kind: "document";
      projectKey: string;
      relativePath: string;
      raw: string;
    }
  | { kind: "journal"; date: string; raw: string }
  | { kind: "habit"; habitId: string; date: string | null; raw: string }
  | { kind: "message"; id: string; raw: string }
  | { kind: "post"; id: string; raw: string }
  | { kind: "transaction"; id: string; raw: string }
  | { kind: "invoice"; id: string; raw: string }
  | { kind: "estimate"; id: string; raw: string };

const JOURNAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseChatMentionToken(
  raw: string,
): ParsedChatMentionToken | null {
  const match = new RegExp(
    `^\\[@(${CHAT_MENTION_KIND_ALT}):([^\\]]+)\\]$`,
  ).exec(raw.trim());
  if (!match) return null;
  const kind = match[1]!;
  const value = match[2]!;

  switch (kind) {
    case "task":
    case "letter":
    case "email":
    case "meeting":
      return { kind, displayId: value, raw };
    case "project":
    case "contact":
    case "organization":
      return { kind, key: value, raw };
    case "journal":
      if (!JOURNAL_DATE_RE.test(value)) return null;
      return { kind, date: value, raw };
    case "habit": {
      const slash = value.indexOf("/");
      if (slash <= 0) return { kind, habitId: value, date: null, raw };
      const habitId = value.slice(0, slash);
      const date = value.slice(slash + 1);
      if (!habitId || (date && !JOURNAL_DATE_RE.test(date))) return null;
      return { kind, habitId, date: date || null, raw };
    }
    case "message":
    case "post":
    case "transaction":
    case "invoice":
    case "estimate":
      return { kind, id: value, raw };
    case "document": {
      const slash = value.indexOf("/");
      if (slash <= 0) return null;
      return {
        kind,
        projectKey: value.slice(0, slash),
        relativePath: value.slice(slash + 1),
        raw,
      };
    }
    default:
      return null;
  }
}

/** Unique mention tokens in first-seen order. */
export function extractChatMentionTokens(
  body: string,
): ParsedChatMentionToken[] {
  if (!body) return [];
  const seen = new Set<string>();
  const out: ParsedChatMentionToken[] = [];
  CHAT_MENTION_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHAT_MENTION_TOKEN_RE.exec(body)) != null) {
    const raw = match[0];
    const parsed = parseChatMentionToken(raw);
    if (!parsed) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
