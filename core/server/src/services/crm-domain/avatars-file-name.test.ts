import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAvatarObjectFileName } from "./avatars.js";

describe("buildAvatarObjectFileName", () => {
  it("versions personal and org marks with a content checksum", () => {
    assert.equal(
      buildAvatarObjectFileName(
        "organization",
        "abcdef0123456789ffffeeee",
      ),
      "avatar-abcdef012345",
    );
    assert.equal(
      buildAvatarObjectFileName("contact", "aaaaaaaaaaaaaaaa"),
      "avatar-aaaaaaaaaaaa",
    );
  });

  it("keeps portal marks on a distinct base name", () => {
    assert.equal(
      buildAvatarObjectFileName("avatar_portal", "bbbbbbbbbbbbbbbb"),
      "avatar-portal-bbbbbbbbbbbb",
    );
  });

  it("changes the file name when the checksum changes (re-upload)", () => {
    const before = buildAvatarObjectFileName("organization", "1111111111111111");
    const after = buildAvatarObjectFileName("organization", "2222222222222222");
    assert.notEqual(before, after);
  });
});
