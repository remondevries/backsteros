import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { wrapLinkedInMentionUrls } from "./feed-mentions.js";

describe("wrapLinkedInMentionUrls", () => {
  it("wraps bare LinkedIn profile and company URLs", () => {
    assert.equal(
      wrapLinkedInMentionUrls(
        "Thanks https://www.linkedin.com/in/jane-doe and https://linkedin.com/company/acme",
      ),
      "Thanks @[https://www.linkedin.com/in/jane-doe] and @[https://linkedin.com/company/acme]",
    );
  });

  it("leaves already-wrapped mentions alone", () => {
    assert.equal(
      wrapLinkedInMentionUrls("Hi @[https://www.linkedin.com/in/jane-doe]"),
      "Hi @[https://www.linkedin.com/in/jane-doe]",
    );
  });
});
