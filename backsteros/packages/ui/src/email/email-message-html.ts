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

/**
 * Remove `@media (prefers-color-scheme: dark) { … }` blocks (nested braces OK).
 * Shadow DOM still matches the OS preference, so dark-mode email CSS would
 * otherwise paint light text onto our light canvas.
 */
export function stripPrefersColorSchemeDarkMedia(css: string): string {
  let result = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] === "@" && /@media\b/i.test(css.slice(i, i + 6))) {
      const headerEnd = css.indexOf("{", i);
      if (headerEnd === -1) {
        result += css.slice(i);
        break;
      }
      const header = css.slice(i, headerEnd);
      if (/prefers-color-scheme\s*:\s*dark/i.test(header)) {
        i = headerEnd + 1;
        let depth = 1;
        while (i < css.length && depth > 0) {
          const ch = css[i];
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          i += 1;
        }
        continue;
      }
    }
    result += css[i];
    i += 1;
  }
  return result;
}

/**
 * Keep HTML emails on their light design: drop dark-scheme media queries and
 * neutralize `color-scheme: dark` so OS dark mode does not restyle the message.
 */
export function neutralizeEmailDarkModeCss(css: string): string {
  return stripPrefersColorSchemeDarkMedia(css)
    .replace(/color-scheme\s*:\s*light\s+dark\s*;?/gi, "color-scheme: light;")
    .replace(/color-scheme\s*:\s*dark\s*;?/gi, "color-scheme: light;")
    .replace(
      /supported-color-schemes\s*:\s*[^;]+;?/gi,
      "supported-color-schemes: light;",
    );
}

/** Rewrite `<style>` blocks so dark-mode adaptations cannot fire. */
export function neutralizeEmailHtmlDarkMode(html: string): string {
  return html.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_full, attrs: string, css: string) =>
      `<style${attrs}>${neutralizeEmailDarkModeCss(css)}</style>`,
  );
}

export type EmailHtmlCanvas = "light" | "dark";

const LIGHT_BG_ATTR =
  /bgcolor\s*=\s*["']?\s*#?(?:fff(?:fff)?|f[5-9a-f]{5}|e[8-9a-f]{5}|white)\b/i;
const LIGHT_BG_STYLE =
  /background(?:-color)?\s*:\s*(?:#(?:fff(?:fff)?|f[5-9a-f]{5}|e[8-9a-f]{5})\b|rgb\(\s*255\s*,\s*255\s*,\s*255|hsl\(\s*0\s*,\s*0%\s*,\s*100%|white)\b/i;

/**
 * Light canvas only for real light-designed templates (light fill + table
 * layout). A lone `bgcolor` on `<body>` or a signature table is not enough —
 * those stay on the dark thread canvas.
 */
export function emailHtmlPrefersLightCanvas(html: string): boolean {
  const sample = html.slice(0, 80_000);
  if (!sample.trim()) return false;

  const hasLightBackground =
    LIGHT_BG_ATTR.test(sample) || LIGHT_BG_STYLE.test(sample);
  if (!hasLightBackground) return false;

  const tableCount = (sample.match(/<table\b/gi) ?? []).length;
  if (tableCount >= 2) return true;
  if (
    tableCount >= 1 &&
    (/role\s*=\s*["']?presentation/i.test(sample) ||
      /width\s*=\s*["']?\d{3,}/i.test(sample) ||
      /cellpadding\s*=/i.test(sample) ||
      /cellspacing\s*=/i.test(sample))
  ) {
    return true;
  }

  return false;
}

function buildEmailQuoteToggleStyles(canvas: EmailHtmlCanvas): string {
  if (canvas === "light") {
    return `
    .email-quote-details { margin-top: 0.65rem; }
    .email-quote-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin: 0;
      padding: 0.15rem 0.4rem;
      border: 0.5px solid rgb(0 0 0 / 0.14);
      border-radius: 6px;
      background: rgb(0 0 0 / 0.04);
      color: #666666;
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
      color: #222222;
      background: rgb(0 0 0 / 0.08);
      outline: none;
    }
    .email-quote-block { margin-top: 0.55rem; color: #555555; }
    `;
  }
  return `
    .email-quote-details { margin-top: 0.65rem; }
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
    .email-quote-block { margin-top: 0.55rem; color: #9a9aa0; }
  `;
}

/**
 * Isolation styles for the email HTML shadow root.
 *
 * - **light**: branded light templates keep their own surfaces; no forced colors.
 * - **dark**: match the dark thread. Only clear the *outer* wrapper fill so a
 *   bare `body`/`div` white sheet does not flash — nested backgrounds (charts,
 *   banners, cards) stay intact. Force readable light text for plain replies.
 */
export function buildEmailShadowStyles(
  canvas: EmailHtmlCanvas = "dark",
): string {
  const isLight = canvas === "light";
  const darkCanvasForce = isLight
    ? ""
    : `
    /* Outer sheet only — do not wipe nested email artboards. */
    :host > :where(html, body, div, table, center, section, article, main),
    :host > :where(html, body) > :where(div, table, center, section, article, main) {
      background: transparent !important;
      background-color: transparent !important;
    }
    /*
     * Beat author !important dark text (e.g. color:#000) that was written for
     * a light sheet we made transparent — otherwise text matches the dark UI.
     */
    :host,
    :host :where(
      div, p, span, td, th, li, font, strong, em, b, i, u, h1, h2, h3, h4, h5, h6,
      label, pre, code, small, center
    ) {
      color: #d4d4d4 !important;
    }
    a, a :where(span, font, strong, em, b, i, u) { color: #6eb6ff !important; }
    blockquote, blockquote :where(div, p, span, font) { color: #9a9aa0 !important; }
    `;
  const lightCanvasForce = isLight
    ? `
    /* Keep light templates on a white sheet even when the app is dark. */
    :host {
      background: #ffffff !important;
      color: #222222 !important;
    }
    `
    : "";
  return `<style>
    :host {
      display: block;
      color: ${isLight ? "#222222" : "#d4d4d4"};
      background: ${isLight ? "#ffffff" : "transparent"};
      color-scheme: ${isLight ? "light" : "dark"};
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14.4px;
      line-height: 1.55;
      overflow-wrap: anywhere;
      border-radius: 6px;
      overflow: hidden;
    }
    img { max-width: 100%; height: auto; }
    img[src^="cid:"] { visibility: hidden; }
    img[data-inline-cid] { visibility: visible; }
    a { color: ${isLight ? "#0563c1" : "#6eb6ff"}; }
    table { max-width: 100%; }
    blockquote {
      margin: 0.5rem 0 0;
      padding-left: 10px;
      border-left: 2px solid ${isLight ? "#c8c8cc" : "#3a3a3e"};
      color: ${isLight ? "#555555" : "#9a9aa0"};
    }
    ${lightCanvasForce}
    ${darkCanvasForce}
    ${buildEmailQuoteToggleStyles(canvas)}
  </style>`;
}

export function prepareEmailHtmlForDisplay(html: string): string {
  const extracted = extractEmailHtmlBody(html);
  const neutralized = neutralizeEmailHtmlDarkMode(extracted);
  return sanitizeEmailHtml(neutralized).trim();
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
