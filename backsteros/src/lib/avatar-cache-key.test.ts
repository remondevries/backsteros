import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { avatarCacheKey } from "./avatar-cache-key";

describe("avatarCacheKey", () => {
  it("stays stable when only avatarUpdatedAt changes", () => {
    const before = avatarCacheKey("contact", {
      id: "c1",
      avatarStorageKey: "avatars/c1.png",
    });
    const after = avatarCacheKey("contact", {
      id: "c1",
      avatarStorageKey: "avatars/c1.png",
    });
    assert.equal(before, after);
    assert.equal(before, "contact:c1:avatars/c1.png");
  });

  it("changes when the storage key changes (re-upload)", () => {
    const before = avatarCacheKey("avatar_portal", {
      id: "c1",
      avatarStorageKey: "avatars/portal-old.png",
    });
    const after = avatarCacheKey("avatar_portal", {
      id: "c1",
      avatarStorageKey: "avatars/portal-new.png",
    });
    assert.notEqual(before, after);
  });
});
