import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSocialFeedHref,
  getSocialFeedTabFromSearch,
  isSocialFeedTabId,
} from "./social-nav.js";

describe("social feed tabs", () => {
  it("recognizes feed tab ids", () => {
    assert.equal(isSocialFeedTabId("inbox"), true);
    assert.equal(isSocialFeedTabId("planned"), true);
    assert.equal(isSocialFeedTabId("liked"), true);
    assert.equal(isSocialFeedTabId("saved"), true);
    assert.equal(isSocialFeedTabId("drafts"), false);
    assert.equal(isSocialFeedTabId("nope"), false);
  });

  it("reads tab from search (drafts aliases to planned)", () => {
    assert.equal(getSocialFeedTabFromSearch(""), "inbox");
    assert.equal(getSocialFeedTabFromSearch("?tab=planned"), "planned");
    assert.equal(getSocialFeedTabFromSearch("tab=drafts&x=1"), "planned");
    assert.equal(getSocialFeedTabFromSearch("?tab=liked"), "liked");
  });

  it("builds feed hrefs with tab query", () => {
    assert.equal(getSocialFeedHref(), "/social");
    assert.equal(getSocialFeedHref({ tab: "planned" }), "/social?tab=planned");
    assert.equal(getSocialFeedHref({ tab: "liked" }), "/social?tab=liked");
    assert.equal(
      getSocialFeedHref({
        pathname: "/social/facebook",
        searchStr: "?foo=1",
        tab: "liked",
      }),
      "/social/facebook?foo=1&tab=liked",
    );
  });
});
