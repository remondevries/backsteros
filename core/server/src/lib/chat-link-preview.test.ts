import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearChatLinkPreviewCache,
  extractHttpUrls,
  faviconFromHtml,
  isBlockedIpAddress,
  resolveChatLinkPreviews,
} from "./chat-link-preview.js";

describe("extractHttpUrls", () => {
  it("dedupes and caps urls", () => {
    const text =
      "See https://example.com/a and https://example.com/a again plus https://example.com/b.";
    assert.deepEqual(extractHttpUrls(text, 5), [
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
});

describe("isBlockedIpAddress", () => {
  it("blocks private / loopback / Tailscale", () => {
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("10.0.0.5"), true);
    assert.equal(isBlockedIpAddress("192.168.1.1"), true);
    assert.equal(isBlockedIpAddress("172.16.0.1"), true);
    assert.equal(isBlockedIpAddress("100.64.1.2"), true);
    assert.equal(isBlockedIpAddress("169.254.1.1"), true);
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  });
});

describe("resolveChatLinkPreviews", () => {
  it("skips when requested", async () => {
    clearChatLinkPreviewCache();
    const previews = await resolveChatLinkPreviews("https://example.com", {
      skip: true,
    });
    assert.deepEqual(previews, []);
  });

  it("parses og tags from html", async () => {
    clearChatLinkPreviewCache();
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Hello &amp; Co" />
      <meta property="og:description" content="Desc" />
      <meta property="og:image" content="/og.png" />
      <meta property="og:site_name" content="Example" />
      <link rel="icon" href="/favicon.ico" />
      <title>Fallback</title>
    </head><body></body></html>`;
    const previews = await resolveChatLinkPreviews("https://example.com/post", {
      fetchImpl: async () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    assert.equal(previews.length, 1);
    assert.equal(previews[0]?.title, "Hello & Co");
    assert.equal(previews[0]?.description, "Desc");
    assert.equal(previews[0]?.imageUrl, "https://example.com/og.png");
    assert.equal(previews[0]?.siteName, "Example");
  });
});

describe("faviconFromHtml", () => {
  it("uses href (not data-base-href) for GitHub-style icon markup", () => {
    const html = `<!doctype html><html><head>
      <link rel="alternate icon" class="js-site-favicon" type="image/png" href="https://github.githubassets.com/favicons/favicon.png">
      <link rel="icon" class="js-site-favicon" type="image/svg+xml" href="https://github.githubassets.com/favicons/favicon.svg" data-base-href="https://github.githubassets.com/favicons/favicon">
      <title>GitHub</title>
    </head></html>`;
    const base = new URL("https://github.com/backsteros/backsteros");
    const favicon = faviconFromHtml(html, base);
    assert.equal(
      favicon,
      "https://github.githubassets.com/favicons/favicon.svg",
    );
    assert.notEqual(
      favicon,
      "https://github.githubassets.com/favicons/favicon",
    );
  });

  it("does not treat data-base-href as href when href is first", () => {
    const html = `<link rel="icon" href="/real-icon.svg" data-base-href="/mangled">`;
    const favicon = faviconFromHtml(html, new URL("https://example.com/"));
    assert.equal(favicon, "https://example.com/real-icon.svg");
  });

  it("prefers png/svg icon over apple-touch-icon", () => {
    const html = `
      <link rel="apple-touch-icon" href="/apple.png">
      <link rel="icon" type="image/png" href="/icon.png">
    `;
    const favicon = faviconFromHtml(html, new URL("https://example.com/x"));
    assert.equal(favicon, "https://example.com/icon.png");
  });

  it("falls back to null so caller can use /favicon.ico", () => {
    const html = `<html><head><title>No icons</title></head></html>`;
    assert.equal(faviconFromHtml(html, new URL("https://example.com/")), null);
  });
});
