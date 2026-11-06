import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hrefForPlainTextUrl,
  peelPlainTextUrl,
  splitPlainTextWithUrls,
} from "./linkify-plain-text.ts";

describe("peelPlainTextUrl", () => {
  it("strips trailing sentence punctuation from the href source", () => {
    assert.deepEqual(peelPlainTextUrl("https://example.com."), {
      url: "https://example.com",
      trailing: ".",
    });
    assert.deepEqual(peelPlainTextUrl("https://example.com/path),"), {
      url: "https://example.com/path",
      trailing: "),",
    });
  });

  it("keeps balanced parentheses inside the URL", () => {
    assert.deepEqual(peelPlainTextUrl("https://en.wikipedia.org/wiki/Foo_(bar)"), {
      url: "https://en.wikipedia.org/wiki/Foo_(bar)",
      trailing: "",
    });
  });
});

describe("hrefForPlainTextUrl", () => {
  it("prefixes www. with https://", () => {
    assert.equal(hrefForPlainTextUrl("www.example.com"), "https://www.example.com");
    assert.equal(
      hrefForPlainTextUrl("https://example.com"),
      "https://example.com",
    );
  });
});

describe("splitPlainTextWithUrls", () => {
  it("returns text-only when there are no URLs", () => {
    assert.deepEqual(splitPlainTextWithUrls("hello there"), [
      { type: "text", text: "hello there" },
    ]);
  });

  it("splits surrounding text from URLs", () => {
    assert.deepEqual(
      splitPlainTextWithUrls("See https://example.com/docs and www.foo.com please."),
      [
        { type: "text", text: "See " },
        {
          type: "url",
          text: "https://example.com/docs",
          href: "https://example.com/docs",
        },
        { type: "text", text: " and " },
        {
          type: "url",
          text: "www.foo.com",
          href: "https://www.foo.com",
        },
        { type: "text", text: " please." },
      ],
    );
  });

  it("keeps trailing punctuation outside the link href", () => {
    assert.deepEqual(splitPlainTextWithUrls("Go to https://example.com."), [
      { type: "text", text: "Go to " },
      {
        type: "url",
        text: "https://example.com",
        href: "https://example.com",
      },
      { type: "text", text: "." },
    ]);
  });
});
