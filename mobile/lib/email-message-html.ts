/**
 * Email HTML body helpers for the mobile WebView renderer.
 * Mirrors the desktop `email-message-html.ts` sanitize/extract logic (no
 * DOMParser on RN — regex extraction only).
 */

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
  return /^\s*<!doctype/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed);
}

/** Pull body markup (and head styles) out of a full HTML document. */
export function extractEmailHtmlBody(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (!isFullEmailHtmlDocument(trimmed)) return trimmed;

  const styleBlocks = Array.from(trimmed.matchAll(/<style[\s\S]*?<\/style>/gi))
    .map((match) => match[0])
    .join("");
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch?.[1]?.trim() ?? "";
  return body ? `${styleBlocks}${body}` : trimmed;
}

export function prepareEmailHtmlForDisplay(html: string): string {
  return sanitizeEmailHtml(extractEmailHtmlBody(html)).trim();
}

/** Message body pickers — same fallbacks as desktop `email.ts`. */
export function emailMessagePlainBody(message: {
  extractedText?: string | null;
  text?: string | null;
  extractedHtml?: string | null;
  html?: string | null;
}): string {
  const extracted = message.extractedText?.trim();
  if (extracted) return extracted;
  const text = message.text?.trim();
  if (text) return text;
  const html = (message.extractedHtml ?? message.html ?? "").trim();
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function emailMessageHtmlBody(message: {
  extractedText?: string | null;
  text?: string | null;
  extractedHtml?: string | null;
  html?: string | null;
}): string | null {
  const extractedHtml = message.extractedHtml?.trim();
  const rawHtml = message.html?.trim();
  if (isSubstantiveEmailHtml(extractedHtml)) return extractedHtml!;
  if (isSubstantiveEmailHtml(rawHtml)) return rawHtml!;

  const plain = message.extractedText?.trim() || message.text?.trim() || "";
  if (!plain) return null;
  return plainTextEmailToHtml(plain);
}

/**
 * Full HTML document for `react-native-webview` message cards, with a height
 * reporter so the WebView can size to its content (codemirror-file-webview
 * pattern). `cid:` images are hidden until inline resolution is supported.
 */
export function buildEmailWebViewDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  :root { color-scheme: dark; }
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: #d4d4d4;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.55;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  img { max-width: 100%; height: auto; }
  img[src^="cid:"] { display: none; }
  a { color: #6eb6ff; }
  table { max-width: 100% !important; }
  blockquote {
    margin: 0 0 0 8px;
    padding-left: 10px;
    border-left: 2px solid #3a3a3e;
    color: #9a9aa0;
  }
</style>
</head>
<body>${bodyHtml}
<script>
  (function () {
    function post() {
      var height = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "email-body-height", height: height }));
      }
    }
    window.addEventListener("load", post);
    setTimeout(post, 60);
    setTimeout(post, 400);
    setTimeout(post, 1200);
  })();
</script>
</body>
</html>`;
}
