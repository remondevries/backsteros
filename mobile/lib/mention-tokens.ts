/** Mirrors `@backsteros/ui` mention-tokens (parse + segment). */

export type MentionKind =
  | "task"
  | "project"
  | "contact"
  | "organization"
  | "document"
  | "letter";

export type ParsedMentionToken =
  | { kind: "task"; displayId: string; raw: string }
  | { kind: "letter"; displayId: string; raw: string }
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
  /\[@(task|project|contact|organization|document|letter):([^\]]+)\]/g;

const MENTION_TOKEN_SINGLE_RE =
  /^\[@(task|project|contact|organization|document|letter):([^\]]+)\]$/;

export function parseMentionToken(raw: string): ParsedMentionToken | null {
  const match = MENTION_TOKEN_SINGLE_RE.exec(raw.trim());
  if (!match) return null;

  const kind = match[1] as MentionKind;
  const value = match[2]!;

  if (kind === "task") {
    return { kind: "task", displayId: value, raw };
  }
  if (kind === "letter") {
    return { kind: "letter", displayId: value, raw };
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
  if (slashIndex <= 0) return null;

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

export function extractMentionTokens(markdown: string): ParsedMentionToken[] {
  return segmentMarkdownWithMentions(markdown).flatMap((segment) =>
    segment.type === "mention" ? [segment.token] : [],
  );
}

/** Split on blank-line runs while keeping empty rows visible in preview.
 * N consecutive newlines (N >= 2) become N - 1 blank paragraphs — matching
 * desktop/web `DocumentMarkdownPreview` so edit and preview heights stay in sync.
 */
export function splitMarkdownParagraphs(body: string): string[] {
  if (!body) return [];

  const parts: string[] = [];
  const blankLineRuns = /\n{2,}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blankLineRuns.exec(body)) !== null) {
    parts.push(body.slice(lastIndex, match.index));
    const blankLineCount = match[0].length - 1;
    for (let i = 0; i < blankLineCount; i += 1) {
      parts.push("");
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = body.slice(lastIndex);
  if (rest.length > 0 || parts.length === 0) {
    parts.push(rest);
  }

  return parts;
}
