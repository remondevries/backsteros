import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatEmailSourceSize,
  parseEmailAuthenticationResults,
} from "./email-message-source.js";

test("parseEmailAuthenticationResults extracts spf dkim dmarc verdicts", () => {
  const checks = parseEmailAuthenticationResults([
    { name: "X-Received", value: "by 2002:a17 with SMTP" },
    {
      name: "Authentication-Results",
      value:
        "amazonses.com; spf=pass (spfCheck: domain of lemo-design.com designates 209.85.218.47 as permitted sender) client-ip=209.85.218.47; dkim=pass header.i=@lemo-design.com; dmarc=pass header.from=lemo-design.com;",
    },
  ]);
  assert.deepEqual(checks, [
    { method: "spf", result: "pass", pass: true },
    { method: "dkim", result: "pass", pass: true },
    { method: "dmarc", result: "pass", pass: true },
  ]);
});

test("parseEmailAuthenticationResults keeps first verdict and reports failures", () => {
  const checks = parseEmailAuthenticationResults([
    {
      name: "authentication-results",
      value: "mx.example.com; dkim=fail reason=signature; spf=softfail",
    },
    {
      name: "ARC-Authentication-Results",
      value: "i=1; mx.example.com; dkim=pass; dmarc=none",
    },
  ]);
  assert.deepEqual(checks, [
    { method: "spf", result: "softfail", pass: false },
    { method: "dkim", result: "fail", pass: false },
    { method: "dmarc", result: "none", pass: false },
  ]);
});

test("parseEmailAuthenticationResults returns empty without auth headers", () => {
  assert.deepEqual(
    parseEmailAuthenticationResults([
      { name: "Subject", value: "spf=pass should not count" },
    ]),
    [],
  );
});

test("formatEmailSourceSize formats bytes kilobytes and megabytes", () => {
  assert.equal(formatEmailSourceSize(775), "775 B");
  assert.equal(formatEmailSourceSize(Math.round(310.4 * 1024)), "310.4 KB");
  assert.equal(formatEmailSourceSize(5 * 1024 * 1024), "5.0 MB");
});
