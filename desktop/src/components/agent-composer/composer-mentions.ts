/**
 * Mention tokenization for the desktop agent composer.
 * Adapted from pingdotgg/t3code (MIT) — composerInlineTokens / composer-editor-mentions.
 */

export type ComposerMentionToken = {
  readonly type: "mention";
  readonly value: string;
  readonly source: string;
  readonly start: number;
  readonly end: number;
};

export type ComposerPromptSegment =
  | { type: "text"; text: string }
  | { type: "mention"; path: string; source: string };

const MENTION_TOKEN_REGEX =
  /(^|\s)@(?:"((?:\\.|[^"\\])*)"|([^\s@"]+))(?=\s|$)/g;
const FILE_LINK_TOKEN_REGEX =
  /(^|\s)\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)(?=\s|$)/g;
const URI_SCHEME_REGEX = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_PATH_REGEX = /^[A-Za-z]:[\\/]/
const SCOPED_PACKAGE_REFERENCE_REGEX =
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[^\s@"]+)*$/;

const SIMPLE_MENTION_PATH_REGEX = /^[^\s@"\\]+$/;

function composerFileLinkBasename(path: string): string {
  const separatorIndex = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\"),
  );
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

function escapeMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function encodeMarkdownLinkDestination(path: string): string {
  return encodeURI(path)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/\\/g, "%5C");
}

/** Canonical chip serialization — `[basename](path)`. */
export function serializeComposerFileLink(path: string): string {
  const label = escapeMarkdownLinkLabel(composerFileLinkBasename(path));
  return `[${label}](${encodeMarkdownLinkDestination(path)})`;
}

export function serializeComposerMentionPath(path: string): string {
  if (SIMPLE_MENTION_PATH_REGEX.test(path)) {
    return path;
  }
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function basenameOfPath(path: string): string {
  return composerFileLinkBasename(path);
}

function collectMentionTokens(text: string): ComposerMentionToken[] {
  const matches: ComposerMentionToken[] = [];

  for (const match of text.matchAll(FILE_LINK_TOKEN_REGEX)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const label = (match[2] ?? "").replace(/\\(.)/g, "$1");
    const encodedPath = match[3] ?? "";
    let path = encodedPath;
    try {
      path = decodeURIComponent(encodedPath);
    } catch {
      // keep encoded
    }
    const basename = composerFileLinkBasename(path);
    const hasExternalScheme =
      URI_SCHEME_REGEX.test(path) && !WINDOWS_DRIVE_PATH_REGEX.test(path);
    if (!path || hasExternalScheme || label !== basename) {
      continue;
    }
    const start = (match.index ?? 0) + prefix.length;
    const end = start + fullMatch.length - prefix.length;
    matches.push({
      type: "mention",
      value: path,
      source: text.slice(start, end),
      start,
      end,
    });
  }

  for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const quotedPath = match[2];
    const path =
      quotedPath !== undefined
        ? quotedPath.replace(/\\(.)/g, "$1")
        : (match[3] ?? "");
    if (
      !path ||
      (quotedPath === undefined && SCOPED_PACKAGE_REFERENCE_REGEX.test(path))
    ) {
      continue;
    }
    const start = (match.index ?? 0) + prefix.length;
    const end = start + fullMatch.length - prefix.length;
    // Prefer file-link tokens when ranges overlap.
    if (
      matches.some(
        (existing) =>
          !(end <= existing.start || start >= existing.end),
      )
    ) {
      continue;
    }
    matches.push({
      type: "mention",
      value: path,
      source: text.slice(start, end),
      start,
      end,
    });
  }

  return matches.sort((a, b) => a.start - b.start);
}

function pushTextSegment(
  segments: ComposerPromptSegment[],
  text: string,
): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === "text") {
    last.text += text;
    return;
  }
  segments.push({ type: "text", text });
}

/** Split a prompt into text + mention segments for Lexical rendering. */
export function splitPromptIntoComposerSegments(
  prompt: string,
): ComposerPromptSegment[] {
  if (!prompt) return [];

  const segments: ComposerPromptSegment[] = [];
  const tokenMatches = collectMentionTokens(prompt);
  let cursor = 0;
  for (const match of tokenMatches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      pushTextSegment(segments, prompt.slice(cursor, match.start));
    }
    segments.push({
      type: "mention",
      path: match.value,
      source: match.source,
    });
    cursor = match.end;
  }
  if (cursor < prompt.length) {
    pushTextSegment(segments, prompt.slice(cursor));
  }
  return segments;
}

export function collectComposerMentions(
  text: string,
): ReadonlyArray<ComposerMentionToken> {
  return collectMentionTokens(text);
}
