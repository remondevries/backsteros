export type PlainTextPart =
  | { type: "text"; text: string }
  | { type: "url"; text: string; href: string };

/** Match http(s) and www. URLs; trailing punctuation is trimmed below. */
const PLAIN_URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Sentence punctuation only — `)` is handled via paren balance below. */
const TRAILING_PUNCT_RE = /[.,;:!?"'\]]+$/;

/**
 * Peel trailing sentence punctuation (and unbalanced closing parens) off a
 * matched URL so `https://x.com.` does not include the period in `href`.
 */
export function peelPlainTextUrl(raw: string): {
  url: string;
  trailing: string;
} {
  let url = raw;
  let trailing = "";
  const punct = TRAILING_PUNCT_RE.exec(url);
  if (punct) {
    trailing = punct[0];
    url = url.slice(0, -trailing.length);
  }
  while (
    url.endsWith(")") &&
    (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)
  ) {
    trailing = `)${trailing}`;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

export function hrefForPlainTextUrl(url: string): string {
  return /^www\./i.test(url) ? `https://${url}` : url;
}

/** Split plain text into literal runs and clickable URL runs. */
export function splitPlainTextWithUrls(text: string): PlainTextPart[] {
  if (!text) return [];

  const parts: PlainTextPart[] = [];
  let lastIndex = 0;
  PLAIN_URL_RE.lastIndex = 0;

  for (const match of text.matchAll(PLAIN_URL_RE)) {
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, start) });
    }

    const { url, trailing } = peelPlainTextUrl(raw);
    if (url) {
      parts.push({
        type: "url",
        text: url,
        href: hrefForPlainTextUrl(url),
      });
    }
    if (trailing) {
      parts.push({ type: "text", text: trailing });
    }
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text }];
}
