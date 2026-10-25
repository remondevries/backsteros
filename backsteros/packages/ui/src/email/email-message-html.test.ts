import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildEmailShadowStyles,
  emailHtmlPrefersLightCanvas,
  extractEmailHtmlBody,
  isSubstantiveEmailHtml,
  neutralizeEmailHtmlDarkMode,
  parseEmailHtmlContentIds,
  plainTextEmailToHtml,
  prepareEmailHtmlForDisplay,
  resolveEmailInlineAttachments,
  sanitizeEmailHtml,
  stripPrefersColorSchemeDarkMedia,
} from "./email-message-html.js";
import { emailMessageHtmlBody } from "./email.js";

test("plainTextEmailToHtml escapes and preserves line breaks", () => {
  assert.equal(
    plainTextEmailToHtml("Hello\n<script>alert(1)</script>"),
    "Hello<br>\n&lt;script&gt;alert(1)&lt;/script&gt;",
  );
});

test("isSubstantiveEmailHtml ignores empty markup shells", () => {
  assert.equal(isSubstantiveEmailHtml("<div><br></div>"), false);
  assert.equal(isSubstantiveEmailHtml("<p>Hello</p>"), true);
  assert.equal(isSubstantiveEmailHtml('<img src="x.png" alt="">'), true);
});

test("extractEmailHtmlBody pulls body content from full documents", () => {
  assert.equal(
    extractEmailHtmlBody(
      "<html><head><title>x</title></head><body><p>Hi</p></body></html>",
    ),
    "<p>Hi</p>",
  );
});

test("extractEmailHtmlBody keeps head styles", () => {
  const extracted = extractEmailHtmlBody(
    "<html><head><style>p{color:red}</style></head><body><p>Hi</p></body></html>",
  );
  assert.match(extracted, /<style>p\{color:red\}<\/style>/);
  assert.match(extracted, /<p>Hi<\/p>/);
});

test("sanitizeEmailHtml strips scripts and inline handlers", () => {
  assert.equal(
    sanitizeEmailHtml('<p onclick="evil()">Hi</p><script>x</script>'),
    "<p>Hi</p>",
  );
});

test("prepareEmailHtmlForDisplay sanitizes extracted body", () => {
  assert.equal(
    prepareEmailHtmlForDisplay("<p onclick='x'>Hi</p>"),
    "<p>Hi</p>",
  );
});

test("stripPrefersColorSchemeDarkMedia removes nested dark media blocks", () => {
  const css = `
    p { color: #222; }
    @media (prefers-color-scheme: dark) {
      p { color: #fff; }
      @supports (color: color(display-p3 1 1 1)) {
        p { color: #eee; }
      }
    }
    a { color: blue; }
    @media screen and (prefers-color-scheme: dark) {
      a { color: #9cf; }
    }
  `;
  const stripped = stripPrefersColorSchemeDarkMedia(css);
  assert.match(stripped, /p \{ color: #222; \}/);
  assert.match(stripped, /a \{ color: blue; \}/);
  assert.doesNotMatch(stripped, /prefers-color-scheme\s*:\s*dark/i);
  assert.doesNotMatch(stripped, /color: #fff/);
  assert.doesNotMatch(stripped, /color: #9cf/);
});

test("prepareEmailHtmlForDisplay strips dark-mode email CSS", () => {
  const prepared = prepareEmailHtmlForDisplay(`
    <html><head><style>
      p { color: #111; }
      @media (prefers-color-scheme: dark) {
        p { color: #f5f5f5 !important; }
      }
    </style></head><body><p>Hello</p></body></html>
  `);
  assert.match(prepared, /color:\s*#111/);
  assert.match(prepared, /<p>Hello<\/p>/);
  assert.doesNotMatch(prepared, /prefers-color-scheme\s*:\s*dark/i);
  assert.doesNotMatch(prepared, /#f5f5f5/);
});

test("neutralizeEmailHtmlDarkMode rewrites color-scheme declarations", () => {
  const html = neutralizeEmailHtmlDarkMode(
    "<style>:root{color-scheme:light dark;supported-color-schemes:light dark;}</style><p>x</p>",
  );
  assert.match(html, /color-scheme:\s*light;/);
  assert.match(html, /supported-color-schemes:\s*light;/);
  assert.doesNotMatch(html, /light dark/);
});

test("emailHtmlPrefersLightCanvas needs light fill plus table layout", () => {
  assert.equal(
    emailHtmlPrefersLightCanvas("<div>Hi Remon,<br>See you soon.</div>"),
    false,
  );
  // Body white alone is not a template.
  assert.equal(
    emailHtmlPrefersLightCanvas(
      '<body bgcolor="#ffffff"><div>Hi Remon</div></body>',
    ),
    false,
  );
  // Signature table without a light fill stays dark.
  assert.equal(
    emailHtmlPrefersLightCanvas(
      '<table role="presentation" width="600" cellpadding="0"><tr><td>Signature</td></tr></table>',
    ),
    false,
  );
  assert.equal(
    emailHtmlPrefersLightCanvas(
      '<table role="presentation" width="600" bgcolor="#ffffff"><tr><td>Hello</td></tr></table>',
    ),
    true,
  );
  assert.equal(
    emailHtmlPrefersLightCanvas(
      "<div style='background:#fff;padding:16px'><p>Invoice</p></div>",
    ),
    false,
  );
});

test("buildEmailShadowStyles light canvas uses a white sheet", () => {
  const styles = buildEmailShadowStyles("light");
  assert.match(styles, /background:\s*#ffffff/);
  assert.match(styles, /color:\s*#222222/);
  assert.match(styles, /color-scheme:\s*light/);
  assert.doesNotMatch(styles, /color:\s*#d4d4d4\s*!important/);
});

test("buildEmailShadowStyles dark canvas only clears outer wrappers", () => {
  const styles = buildEmailShadowStyles("dark");
  assert.match(styles, /:host > :where/);
  assert.match(styles, /background:\s*transparent\s*!important/);
  assert.match(styles, /color:\s*#d4d4d4\s*!important/);
  assert.match(styles, /color-scheme:\s*dark/);
  // Must not blanket-clear every nested surface (charts / banners).
  assert.doesNotMatch(
    styles,
    /:host :where\(html, body, div, table, thead/,
  );
});

test("emailMessageHtmlBody falls back to formatted plain text", () => {
  assert.equal(
    emailMessageHtmlBody({
      extractedText: "Line one\nLine two",
      html: null,
      extractedHtml: null,
    }),
    "Line one<br>\nLine two",
  );
});

test("emailMessageHtmlBody prefers substantive raw html over empty extracted html", () => {
  assert.equal(
    emailMessageHtmlBody({
      extractedHtml: "<div><br></div>",
      html: "<p>Invoice attached</p>",
      extractedText: "Invoice attached",
    }),
    "<p>Invoice attached</p>",
  );
});

test("emailMessageHtmlBody prefers full html when extracted omits quotes", () => {
  assert.equal(
    emailMessageHtmlBody({
      extractedHtml: "<p>New reply</p>",
      html: "<p>New reply</p><blockquote>Earlier message</blockquote>",
    }),
    "<p>New reply</p><blockquote>Earlier message</blockquote>",
  );
});

test("parseEmailHtmlContentIds normalizes angle-bracket cids", () => {
  assert.deepEqual(
    parseEmailHtmlContentIds(
      '<img src="cid:backsteros-signoff-avatar"><img src="cid:<logo@example.com>">',
    ),
    ["backsteros-signoff-avatar", "logo@example.com"],
  );
});

test("resolveEmailInlineAttachments keeps only referenced inline rows", () => {
  const resolved = resolveEmailInlineAttachments(
    [
      {
        attachmentId: "att_1",
        contentId: "backsteros-signoff-avatar",
      },
      {
        attachmentId: "att_2",
        contentId: "unused",
      },
    ],
    '<img src="cid:backsteros-signoff-avatar" alt="">',
  );
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.attachmentId, "att_1");
});
