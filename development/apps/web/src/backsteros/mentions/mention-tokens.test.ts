import { describe, expect, it } from "vite-plus/test";

import {
  collectMentionTokens,
  parseMentionToken,
  segmentMarkdownWithMentions,
} from "./mention-tokens";

describe("parseMentionToken", () => {
  it("parses task, letter, and email display ids", () => {
    expect(parseMentionToken("[@task:PF-43]")).toEqual({
      kind: "task",
      displayId: "PF-43",
      raw: "[@task:PF-43]",
    });
    expect(parseMentionToken("[@letter:L-12]")).toEqual({
      kind: "letter",
      displayId: "L-12",
      raw: "[@letter:L-12]",
    });
    expect(parseMentionToken("[@email:E-9]")).toEqual({
      kind: "email",
      displayId: "E-9",
      raw: "[@email:E-9]",
    });
  });

  it("parses project/contact/organization keys", () => {
    expect(parseMentionToken("[@project:BDV]")?.kind).toBe("project");
    expect(parseMentionToken("[@contact:C-12]")?.kind).toBe("contact");
    expect(parseMentionToken("[@organization:acme]")?.kind).toBe("organization");
  });

  it("parses document project/path tokens", () => {
    expect(parseMentionToken("[@document:OS/docs/plan.md]")).toEqual({
      kind: "document",
      projectKey: "OS",
      relativePath: "docs/plan.md",
      raw: "[@document:OS/docs/plan.md]",
    });
  });

  it("rejects malformed tokens", () => {
    expect(parseMentionToken("[@task:]")).toBeNull();
    expect(parseMentionToken("[@document:noslash]")).toBeNull();
    expect(parseMentionToken("[@not-a-kind:x]")).toBeNull();
    expect(parseMentionToken("plain text")).toBeNull();
  });
});

describe("segmentMarkdownWithMentions", () => {
  it("splits markdown around mention tokens", () => {
    expect(segmentMarkdownWithMentions("See [@task:PF-43] today")).toEqual([
      { type: "markdown", content: "See " },
      {
        type: "mention",
        token: { kind: "task", displayId: "PF-43", raw: "[@task:PF-43]" },
        raw: "[@task:PF-43]",
      },
      { type: "markdown", content: " today" },
    ]);
  });

  it("collects unique tokens from a body", () => {
    const tokens = collectMentionTokens("[@task:PF-43]\nAlso [@task:PF-43] and [@letter:L-1]");
    expect(
      tokens.map((token) => `${token.kind}:${"displayId" in token ? token.displayId : ""}`),
    ).toEqual(["task:PF-43", "letter:L-1"]);
  });
});
