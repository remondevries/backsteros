import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractLinkedInMentionCandidate,
  wrapLinkedInMentionUrls,
} from "./linkedin-reactions.js";

describe("wrapLinkedInMentionUrls", () => {
  it("wraps bare URLs", () => {
    assert.equal(
      wrapLinkedInMentionUrls("See https://www.linkedin.com/in/jane"),
      "See @[https://www.linkedin.com/in/jane]",
    );
  });
});

describe("extractLinkedInMentionCandidate", () => {
  it("finds a URL before the caret", () => {
    const text = "Hi https://www.linkedin.com/in/jane";
    const found = extractLinkedInMentionCandidate(text, text.length);
    assert.ok(found);
    assert.equal(found?.query, "https://www.linkedin.com/in/jane");
  });

  it("returns null without a LinkedIn URL", () => {
    assert.equal(extractLinkedInMentionCandidate("hello", 5), null);
  });
});
