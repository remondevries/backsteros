import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailWebViewDocument,
  emailMessageHtmlBody,
  emailMessagePlainBody,
  extractEmailHtmlBody,
  isSubstantiveEmailHtml,
  plainTextEmailToHtml,
  prepareEmailHtmlForDisplay,
  sanitizeEmailHtml,
} from "./email-message-html.ts";

describe("sanitizeEmailHtml", () => {
  it("strips scripts, iframes, and inline handlers", () => {
    const dirty =
      '<div onclick="steal()"><script>alert(1)</script><iframe src="x"></iframe>ok</div>';
    const clean = sanitizeEmailHtml(dirty);
    assert.equal(clean.includes("<script"), false);
    assert.equal(clean.includes("<iframe"), false);
    assert.equal(clean.includes("onclick"), false);
    assert.equal(clean.includes("ok"), true);
  });
});

describe("extractEmailHtmlBody", () => {
  it("pulls body and styles out of a full document", () => {
    const doc =
      "<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><p>Hi</p></body></html>";
    const extracted = extractEmailHtmlBody(doc);
    assert.equal(extracted.includes("<p>Hi</p>"), true);
    assert.equal(extracted.includes("color:red"), true);
    assert.equal(extracted.includes("<html"), false);
  });

  it("returns fragments unchanged", () => {
    assert.equal(extractEmailHtmlBody("<p>Hi</p>"), "<p>Hi</p>");
  });
});

describe("body pickers", () => {
  it("prefers extracted text for plain body", () => {
    assert.equal(
      emailMessagePlainBody({ extractedText: "clean", text: "raw" }),
      "clean",
    );
  });

  it("strips tags when only html exists", () => {
    assert.equal(
      emailMessagePlainBody({ html: "<p>Hello <b>world</b></p>" }),
      "Hello world",
    );
  });

  it("falls back to escaped plain text as html", () => {
    assert.equal(
      emailMessageHtmlBody({ text: "a < b\nnext" }),
      "a &lt; b<br>\nnext",
    );
  });

  it("treats empty html as non-substantive", () => {
    assert.equal(isSubstantiveEmailHtml("<div>&nbsp;</div>"), false);
    assert.equal(isSubstantiveEmailHtml('<img src="x">'), true);
  });
});

describe("buildEmailWebViewDocument", () => {
  it("wraps the body in a full document with a height reporter", () => {
    const doc = buildEmailWebViewDocument("<p>Hi</p>");
    assert.equal(doc.includes("<p>Hi</p>"), true);
    assert.equal(doc.includes("email-body-height"), true);
    assert.equal(doc.includes("viewport"), true);
  });
});

describe("prepareEmailHtmlForDisplay", () => {
  it("extracts and sanitizes in one pass", () => {
    const doc =
      "<html><body><script>x()</script><p>Safe</p></body></html>";
    assert.equal(prepareEmailHtmlForDisplay(doc), "<p>Safe</p>");
  });
});

describe("plainTextEmailToHtml", () => {
  it("escapes and converts newlines", () => {
    assert.equal(plainTextEmailToHtml("a & b\nc"), "a &amp; b<br>\nc");
  });
});
