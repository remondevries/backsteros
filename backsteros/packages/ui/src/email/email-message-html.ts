export function escapeEmailHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextEmailToHtml(text: string): string {
  return escapeEmailHtml(text).replace(/\r\n/g, "\n").replace(/\n/g, "<br>\n");
}

export function isSubstantiveEmailHtml(
  html: string | null | undefined,
): boolean {
  const trimmed = html?.trim();
  if (!trimmed) return false;
  if (/<img\b/i.test(trimmed)) return true;
  const text = trimmed
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0;
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}

export function isFullEmailHtmlDocument(html: string): boolean {
  const trimmed = html.trim();
  return (
    /^\s*<!doctype/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed)
  );
}

/** Pull body markup (and head styles) out of a full HTML document. */
export function extractEmailHtmlBody(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";

  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(trimmed, "text/html");
      const headMarkup = Array.from(
        doc.head?.querySelectorAll("style, link[rel='stylesheet']") ?? [],
      )
        .map((node) => node.outerHTML)
        .join("");
      const bodyMarkup = doc.body?.innerHTML?.trim() ?? "";
      if (bodyMarkup || headMarkup) {
        return `${headMarkup}${bodyMarkup}`;
      }
    } catch {
      // fall through to regex extraction
    }
  }

  if (!isFullEmailHtmlDocument(trimmed)) return trimmed;

  const styleBlocks = Array.from(
    trimmed.matchAll(/<style[\s\S]*?<\/style>/gi),
  )
    .map((match) => match[0])
    .join("");
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch?.[1]?.trim() ?? "";
  return body ? `${styleBlocks}${body}` : trimmed;
}

export function buildEmailShadowStyles(): string {
  return `<style>
    :host {
      display: block;
      color: #d4d4d4;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14.4px;
      line-height: 1.55;
      overflow-wrap: anywhere;
      border-radius: 6px;
      overflow: hidden;
    }
    /*
     * Outbound / many inbound HTML emails bake in #222/#444 for light clients.
     * Those inline colors beat :host inheritance — force UI-readable text.
     */
    :host, :host :where(div, p, span, td, th, li, font, strong, em, b, i, u) {
      color: #d4d4d4 !important;
    }
    img { max-width: 100%; height: auto; }
    img[src^="cid:"] { visibility: hidden; }
    img[data-inline-cid] { visibility: visible; }
    a, a :where(span, font, strong, em, b, i, u) { color: #6eb6ff !important; }
    table { max-width: 100%; }
    blockquote {
      margin: 0.5rem 0 0;
      padding-left: 10px;
      border-left: 2px solid #3a3a3e;
      color: #9a9aa0 !important;
    }
    .email-quote-details {
      margin-top: 0.65rem;
    }
    .email-quote-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin: 0;
      padding: 0.15rem 0.4rem;
      border: 0.5px solid rgb(255 255 255 / 0.12);
      border-radius: 6px;
      background: rgb(255 255 255 / 0.04);
      color: #9a9aa0;
      font: inherit;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      line-height: 1.2;
      cursor: pointer;
      list-style: none;
      user-select: none;
    }
    .email-quote-toggle::-webkit-details-marker { display: none; }
    .email-quote-toggle:hover,
    .email-quote-toggle:focus-visible {
      color: #d4d4d4;
      background: rgb(255 255 255 / 0.08);
      outline: none;
    }
    .email-quote-block {
      margin-top: 0.55rem;
      color: #9a9aa0 !important;
    }
  </style>`;
}

export function prepareEmailHtmlForDisplay(html: string): string {
  const extracted = extractEmailHtmlBody(html);
  return sanitizeEmailHtml(extracted).trim();
}

export function normalizeEmailContentId(
  contentId: string | null | undefined,
): string | null {
  const trimmed = contentId?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^<|>$/g, "");
}

export function parseEmailHtmlContentIds(html: string): string[] {
  const ids = new Set<string>();
  const pattern = /\bcid:<?([^"'>\s]+)>?/gi;
  for (const match of html.matchAll(pattern)) {
    const normalized = normalizeEmailContentId(match[1]);
    if (normalized) ids.add(normalized);
  }
  return [...ids];
}

export function emailHtmlReferencesInlineAttachments(html: string): boolean {
  return parseEmailHtmlContentIds(html).length > 0;
}

export type EmailMessageInlineAttachment = {
  attachmentId: string;
  contentId: string | null;
};

export function resolveEmailInlineAttachments(
  attachments: EmailMessageInlineAttachment[] | null | undefined,
  html: string,
): EmailMessageInlineAttachment[] {
  const referenced = new Set(parseEmailHtmlContentIds(html));
  if (referenced.size === 0) return [];
  return (attachments ?? []).filter((attachment) => {
    const contentId = normalizeEmailContentId(attachment.contentId);
    return Boolean(contentId && referenced.has(contentId));
  });
}
