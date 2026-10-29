import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSocialFeedAccountKindFromSearch,
  getSocialFeedHref,
  getSocialFeedPathname,
  getSocialFeedPlatformFromSearch,
  getSocialFeedTabFromSearch,
  getSocialPostHref,
  isSocialFeedAccountKind,
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

describe("social feed account + platform locations", () => {
  it("recognizes account kinds", () => {
    assert.equal(isSocialFeedAccountKind("personal"), true);
    assert.equal(isSocialFeedAccountKind("business"), true);
    assert.equal(isSocialFeedAccountKind("company"), false);
  });

  it("reads account kind from search (default personal)", () => {
    assert.equal(getSocialFeedAccountKindFromSearch(""), "personal");
    assert.equal(
      getSocialFeedAccountKindFromSearch("?account=business"),
      "business",
    );
    assert.equal(
      getSocialFeedAccountKindFromSearch("?tab=planned&account=business"),
      "business",
    );
  });

  it("builds pathnames for platform filters", () => {
    assert.equal(getSocialFeedPathname("all"), "/social");
    assert.equal(getSocialFeedPathname("linkedin"), "/social/linkedin");
  });

  it("builds hrefs with account + platform", () => {
    assert.equal(
      getSocialFeedHref({ platform: "linkedin", accountKind: "business" }),
      "/social/linkedin?account=business",
    );
    assert.equal(
      getSocialFeedHref({
        platform: "linkedin",
        accountKind: "business",
        tab: "planned",
      }),
      "/social/linkedin?tab=planned&account=business",
    );
    assert.equal(
      getSocialFeedHref({
        pathname: "/social/linkedin",
        searchStr: "?account=business&tab=planned",
        accountKind: "personal",
      }),
      "/social/linkedin?tab=planned",
    );
  });

  it("carries feed filters on post hrefs for Back", () => {
    assert.equal(getSocialPostHref("post-1"), "/social/post/post-1");
    assert.equal(
      getSocialPostHref("post-1", {
        accountKind: "business",
        platform: "linkedin",
        tab: "planned",
      }),
      "/social/post/post-1?account=business&platform=linkedin&tab=planned",
    );
    assert.equal(
      getSocialFeedPlatformFromSearch(
        "?account=business&platform=linkedin&tab=planned",
      ),
      "linkedin",
    );
    const backHref = getSocialFeedHref({
      platform: getSocialFeedPlatformFromSearch(
        "?account=business&platform=linkedin&tab=planned",
      ),
      accountKind: getSocialFeedAccountKindFromSearch(
        "?account=business&platform=linkedin&tab=planned",
      ),
      tab: getSocialFeedTabFromSearch(
        "?account=business&platform=linkedin&tab=planned",
      ),
      searchStr: "?account=business&platform=linkedin&tab=planned",
    });
    assert.equal(backHref.startsWith("/social/linkedin?"), true);
    const backParams = new URLSearchParams(backHref.split("?")[1]);
    assert.equal(backParams.get("account"), "business");
    assert.equal(backParams.get("tab"), "planned");
    assert.equal(backParams.has("platform"), false);
  });
});
