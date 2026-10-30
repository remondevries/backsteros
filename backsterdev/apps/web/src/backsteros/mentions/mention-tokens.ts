/**
 * BacksterOS `[@type:id]` mention parser — ported from desktop
 * `packages/ui/src/mentions/mention-tokens.ts` for BacksterDEV surfaces.
 */

export type MentionKind =
  | "task"
  | "project"
  | "contact"
  | "organization"
  | "document"
  | "letter"
  | "email"
  | "meeting"
  | "journal"
  | "habit"
  | "message"
  | "post"
  | "transaction"
  | "invoice"
  | "estimate";

const MENTION_KIND_ALT =
  "task|project|contact|organization|document|letter|email|meeting|journal|habit|message|post|transaction|invoice|estimate";

export type ParsedMentionToken =
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

export const MENTION_TOKEN_RE = new RegExp(
  `\\[@(${MENTION_KIND_ALT}):([^\\]]+)\\]`,
  "g",
);

const MENTION_TOKEN_SINGLE_RE = new RegExp(
  `^\\[@(${MENTION_KIND_ALT}):([^\\]]+)\\]$`,
);

const JOURNAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseMentionToken(raw: string): ParsedMentionToken | null {
  const match = MENTION_TOKEN_SINGLE_RE.exec(raw.trim());
  if (!match) {
    return null;
  }

  const kind = match[1] as MentionKind;
  const value = match[2]!;

  if (kind === "task") {
    return { kind: "task", displayId: value, raw };
  }
  if (kind === "letter") {
    return { kind: "letter", displayId: value, raw };
  }
  if (kind === "email") {
    return { kind: "email", displayId: value, raw };
  }
  if (kind === "meeting") {
    return { kind: "meeting", displayId: value, raw };
  }
  if (kind === "project") {
    return { kind: "project", key: value, raw };
  }
  if (kind === "contact") {
    return { kind: "contact", key: value, raw };
  }
  if (kind === "organization") {
    return { kind: "organization", key: value, raw };
  }
  if (kind === "journal") {
    if (!JOURNAL_DATE_RE.test(value)) {
      return null;
    }
    return { kind: "journal", date: value, raw };
  }
  if (kind === "habit") {
    const slashIndex = value.indexOf("/");
    if (slashIndex <= 0) {
      return { kind: "habit", habitId: value, date: null, raw };
    }
    const habitId = value.slice(0, slashIndex);
    const date = value.slice(slashIndex + 1);
    if (!habitId || (date && !JOURNAL_DATE_RE.test(date))) {
      return null;
    }
    return { kind: "habit", habitId, date: date || null, raw };
  }
  if (kind === "message") {
    return { kind: "message", id: value, raw };
  }
  if (kind === "post") {
    return { kind: "post", id: value, raw };
  }
  if (kind === "transaction") {
    return { kind: "transaction", id: value, raw };
  }
  if (kind === "invoice") {
    return { kind: "invoice", id: value, raw };
  }
  if (kind === "estimate") {
    return { kind: "estimate", id: value, raw };
  }

  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  return {
    kind: "document",
    projectKey: value.slice(0, slashIndex),
    relativePath: value.slice(slashIndex + 1),
    raw,
  };
}

export function mentionTokenLabel(token: ParsedMentionToken): string {
  switch (token.kind) {
    case "task":
    case "letter":
    case "email":
    case "meeting":
      return token.displayId;
    case "project":
    case "contact":
    case "organization":
      return token.key;
    case "journal":
      return token.date;
    case "habit":
      return token.date ? `${token.habitId}/${token.date}` : token.habitId;
    case "message":
    case "post":
    case "transaction":
    case "invoice":
    case "estimate":
      return token.id;
    case "document": {
      const parts = token.relativePath.split("/");
      return parts[parts.length - 1] || token.relativePath;
    }
  }
}

export type MentionSegment =
  | { type: "markdown"; content: string }
  | { type: "mention"; token: ParsedMentionToken; raw: string };

export function segmentMarkdownWithMentions(markdown: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(MENTION_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({
        type: "markdown",
        content: markdown.slice(lastIndex, index),
      });
    }

    const raw = match[0];
    const parsed = parseMentionToken(raw);
    if (parsed) {
      segments.push({ type: "mention", token: parsed, raw });
    } else {
      segments.push({ type: "markdown", content: raw });
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(lastIndex),
    });
  }

  return segments.length > 0
    ? segments
    : [{ type: "markdown", content: markdown }];
}

/** Cache key for deduplicating mention resolution. */
export function getMentionTokenCacheKey(token: ParsedMentionToken): string {
  if (token.kind === "document") {
    return `${token.kind}:${token.projectKey}/${token.relativePath}`;
  }
  if (
    token.kind === "task" ||
    token.kind === "letter" ||
    token.kind === "email" ||
    token.kind === "meeting"
  ) {
    return `${token.kind}:${token.displayId}`;
  }
  if (token.kind === "journal") {
    return `${token.kind}:${token.date}`;
  }
  if (token.kind === "habit") {
    return token.date
      ? `${token.kind}:${token.habitId}/${token.date}`
      : `${token.kind}:${token.habitId}`;
  }
  if (
    token.kind === "message" ||
    token.kind === "post" ||
    token.kind === "transaction" ||
    token.kind === "invoice" ||
    token.kind === "estimate"
  ) {
    return `${token.kind}:${token.id}`;
  }
  return `${token.kind}:${token.key}`;
}

export function collectMentionTokens(markdown: string): ParsedMentionToken[] {
  const seen = new Set<string>();
  const tokens: ParsedMentionToken[] = [];
  for (const segment of segmentMarkdownWithMentions(markdown)) {
    if (segment.type !== "mention") continue;
    const key = getMentionTokenCacheKey(segment.token);
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(segment.token);
  }
  return tokens;
}
