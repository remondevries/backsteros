import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOpenableExternalHref } from "./open-external-url.ts";

describe("isOpenableExternalHref", () => {
  it("accepts http(s), mailto, and tel", () => {
    assert.equal(isOpenableExternalHref("https://example.com/path"), true);
    assert.equal(isOpenableExternalHref("http://example.com"), true);
    assert.equal(isOpenableExternalHref("mailto:a@b.com"), true);
    assert.equal(isOpenableExternalHref("tel:+15551212"), true);
  });

  it("rejects in-app paths and non-openable schemes", () => {
    assert.equal(isOpenableExternalHref("/tasks/1"), false);
    assert.equal(isOpenableExternalHref("#section"), false);
    assert.equal(isOpenableExternalHref("javascript:alert(1)"), false);
    assert.equal(isOpenableExternalHref("blob:https://x/1"), false);
    assert.equal(isOpenableExternalHref("readdle-spark://bl=1"), false);
  });
});
