import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSvgAvatarUri } from "./avatar-uri.ts";

describe("isSvgAvatarUri", () => {
  it("detects cached SVG avatar files", () => {
    assert.equal(
      isSvgAvatarUri("file:///cache/avatar-contact-c1.svg"),
      true,
    );
    assert.equal(isSvgAvatarUri("file:///cache/AVATAR-ORG-O1.SVG"), true);
  });

  it("ignores query strings", () => {
    assert.equal(isSvgAvatarUri("https://x.test/logo.svg?v=2"), true);
    assert.equal(isSvgAvatarUri("https://x.test/photo.jpg?name=a.svg"), false);
  });

  it("treats extensionless cached avatars as raster images", () => {
    assert.equal(isSvgAvatarUri("file:///cache/avatar-contact-c1"), false);
  });
});
