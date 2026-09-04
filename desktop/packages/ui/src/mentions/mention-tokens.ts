import {
  parseNamedLinkToken,
  type ParsedNamedLinkToken,
} from "./named-link-tokens.js";

export type MentionKind =
  | "task"
  | "project"
  | "contact"
  | "organization"
  | "document"
  | "letter"
  | "email";

export type ParsedMentionToken =
  | { kind: "task"; displayId: string; raw: string }
  | { kind: "letter"; displayId: string; raw: string }
  | { kind: "email"; displayId: string; raw: string }
  | { kind: "project"; key: string; raw: string }
  | { kind: "contact"; key: string; raw: string }
  | { kind: "organization"; key: string; raw: string }
  | {
      kind: "document";
      projectKey: string;
      relativePath: string;
      raw: string;
    };

export const MENTION_TOKEN_RE =
  /\[@(task|project|contact|organization|document|letter|email):([^\]]+)\]/g;

const MENTION_TOKEN_SINGLE_RE =
  /^\[@(task|project|contact|organization|document|letter|email):([^\]]+)\]$/;

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
  if (kind === "project") {
    return { kind: "project", key: value, raw };
  }
  if (kind === "contact") {
    return { kind: "contact", key: value, raw };
  }
  if (kind === "organization") {
    return { kind: "organization", key: value, raw };
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
      return token.displayId;
    case "project":
    case "contact":
    case "organization":
      return token.key;
    case "document": {
      const parts = token.relativePath.split("/");
      return parts[parts.length - 1] || token.relativePath;
    }
  }
}

export type MentionSegment =
  | { type: "markdown"; content: string }
  | { type: "mention"; token: ParsedMentionToken; raw: string }
  | { type: "namedLink"; token: ParsedNamedLinkToken; raw: string };

type TokenHit =
  | { kind: "mention"; index: number; raw: string; token: ParsedMentionToken }
  | {
      kind: "namedLink";
      index: number;
      raw: string;
      token: ParsedNamedLinkToken;
    };

function findNextTokenHit(markdown: string, from: number): TokenHit | null {
  const slice = markdown.slice(from);
  MENTION_TOKEN_RE.lastIndex = 0;
  const mentionMatch = MENTION_TOKEN_RE.exec(slice);

  // Rebuild named-link regex each call so lastIndex stays clean.
  const namedLinkRe = /\[(?!@)([^\]\|\r\n]+)\|([^\]\r\n]+)\]/g;
  let namedHit: TokenHit | null = null;
  let namedMatch: RegExpExecArray | null;
  while ((namedMatch = namedLinkRe.exec(slice)) != null) {
    const raw = namedMatch[0];
    const parsed = parseNamedLinkToken(raw);
    if (!parsed) {
      continue;
    }
    namedHit = {
      kind: "namedLink",
      index: from + (namedMatch.index ?? 0),
      raw,
      token: parsed,
    };
    break;
  }

  const mentionHit: TokenHit | null =
    mentionMatch != null
      ? (() => {
          const raw = mentionMatch[0];
          const parsed = parseMentionToken(raw);
          if (!parsed) {
            return null;
          }
          return {
            kind: "mention" as const,
            index: from + (mentionMatch.index ?? 0),
            raw,
            token: parsed,
          };
        })()
      : null;

  if (mentionHit && namedHit) {
    return mentionHit.index <= namedHit.index ? mentionHit : namedHit;
  }
  return mentionHit ?? namedHit;
}

export function segmentMarkdownWithMentions(markdown: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  while (lastIndex < markdown.length) {
    const hit = findNextTokenHit(markdown, lastIndex);
    if (!hit) {
      break;
    }

    if (hit.index > lastIndex) {
      segments.push({
        type: "markdown",
        content: markdown.slice(lastIndex, hit.index),
      });
    }

    if (hit.kind === "mention") {
      segments.push({ type: "mention", token: hit.token, raw: hit.raw });
    } else {
      segments.push({ type: "namedLink", token: hit.token, raw: hit.raw });
    }

    lastIndex = hit.index + hit.raw.length;
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

export type { ParsedNamedLinkToken };
