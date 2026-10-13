import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractEmailHtmlBody,
  isSubstantiveEmailHtml,
  parseEmailHtmlContentIds,
  plainTextEmailToHtml,
  prepareEmailHtmlForDisplay,
  resolveEmailInlineAttachments,
  sanitizeEmailHtml,
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
