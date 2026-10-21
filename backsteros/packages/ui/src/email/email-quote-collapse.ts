/**
 * Split plain-text email bodies into the new reply and the quoted history
 * (lines starting with `>`, or a common “On … wrote:” / “Op … schreef:” header).
 */

const PLAIN_REPLY_HEADER =
  /^(?:on\s.+wrote:|op\s.+schreef\s.+:|le\s.+\s(?:a|à)\sécrit\s*:|am\s.+\sschrieb\s.+:|-{2,}\s*original message\s*-{2,}|_{5,}|from:\s+\S)/i;

const HTML_QUOTE_SELECTOR = [
  "blockquote",
  ".gmail_quote",
  ".gmail_extra",
  ".yahoo_quoted",
  ".ProtonMail_quote",
  "#divRplyFwdMsg",
  ".moz-cite-prefix",
].join(", ");

export type SplitPlainTextEmailQuotesResult = {
  /** New reply content above the quote (may be empty). */
  visible: string;
  /** Quoted history starting at the reply header / first `>` line. Null when none. */
  quoted: string | null;
};

function isPlainQuoteLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(">")) return true;
  return PLAIN_REPLY_HEADER.test(trimmed);
}

/**
 * Find where quoted history begins in a plain-text body.
 * Returns -1 when the whole body is new content (or entirely quoted with
 * nothing useful to keep above the fold — then we leave it expanded).
 */
export function findPlainTextEmailQuoteStart(text: string): number {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return -1;

  const lines = normalized.split("\n");
  let quoteIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (isPlainQuoteLine(lines[i]!)) {
      quoteIndex = i;
      break;
    }
  }
  if (quoteIndex <= 0) return -1;

  // Skip blank lines immediately above the quote so the toggle sits cleanly
  // under the new reply.
  while (quoteIndex > 0 && lines[quoteIndex - 1]!.trim() === "") {
    quoteIndex -= 1;
  }
  return quoteIndex;
}

export function splitPlainTextEmailQuotes(
  text: string,
): SplitPlainTextEmailQuotesResult {
  const normalized = text.replace(/\r\n/g, "\n");
  const quoteIndex = findPlainTextEmailQuoteStart(normalized);
  if (quoteIndex < 0) {
    return { visible: normalized, quoted: null };
  }

  const lines = normalized.split("\n");
  const visible = lines.slice(0, quoteIndex).join("\n").replace(/\s+$/, "");
  const quoted = lines.slice(quoteIndex).join("\n").replace(/^\s+/, "");
  if (!quoted.trim()) {
    return { visible: normalized, quoted: null };
  }
  return { visible, quoted };
}

/** True when a node is (or sits inside) a known HTML quote container. */
export function isHtmlEmailQuoteNode(node: Element): boolean {
  return Boolean(
    node.matches?.(HTML_QUOTE_SELECTOR) ||
      node.closest?.(HTML_QUOTE_SELECTOR),
  );
}

export function getHtmlEmailQuoteSelector(): string {
  return HTML_QUOTE_SELECTOR;
}

function elementLooksLikeHtmlEmailQuote(el: Element): boolean {
  if (el.matches(HTML_QUOTE_SELECTOR)) return true;
  // Keep a short run of siblings that only wrap further quotes (common in
  // Apple Mail / Outlook wrappers after the first cite prefix).
  const childQuote = el.querySelector(HTML_QUOTE_SELECTOR);
  if (!childQuote) return false;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const quoteText = (childQuote.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length === 0 || text === quoteText || text.startsWith(quoteText.slice(0, 40));
}

/**
 * Collect the first top-level quote element and following quote siblings so one
 * toggle can hide the trailing reply chain (Gmail-style).
 */
export function collectTrailingHtmlEmailQuoteNodes(
  root: ParentNode,
): Element[] {
  const candidates = Array.from(
    root.querySelectorAll(HTML_QUOTE_SELECTOR),
  ) as Element[];
  const first = candidates.find((el) => {
    const parentQuote = el.parentElement?.closest(HTML_QUOTE_SELECTOR);
    return !parentQuote;
  });
  if (!first || !first.parentElement) return [];

  const nodes: Element[] = [];
  let cursor: Element | null = first;
  while (cursor && elementLooksLikeHtmlEmailQuote(cursor)) {
    nodes.push(cursor);
    cursor = cursor.nextElementSibling;
  }
  return nodes;
}
