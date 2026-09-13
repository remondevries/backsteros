import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAvatarSignedUrl,
  clampAvatarSignedTtlSeconds,
  signAvatarPayload,
  verifyAvatarSignature,
  AVATAR_SIGNED_URL_DEFAULT_TTL_SECONDS,
  AVATAR_SIGNED_URL_MAX_TTL_SECONDS,
} from "./avatar-signed-url.js";

const SECRET = "test-avatar-signing-secret";

describe("avatar-signed-url", () => {
  it("signs and verifies a valid payload", () => {
    const now = 1_700_000_000;
    const built = buildAvatarSignedUrl({
      origin: "https://api.example.com",
      workspaceId: "ws_1",
      entityType: "contact",
      entityId: "contact_1",
      secret: SECRET,
      nowSeconds: now,
      ttlSeconds: 3600,
    });

    assert.equal(built.payload.exp, now + 3600);
    assert.match(
      built.url,
      /^https:\/\/api\.example\.com\/api\/v1\/public\/avatars\/contact\/contact_1\?/,
    );
    assert.equal(
      verifyAvatarSignature(built.payload, built.signature, SECRET, now),
      true,
    );
  });

  it("rejects expired signatures", () => {
    const payload = {
      workspaceId: "ws_1",
      entityType: "contact" as const,
      entityId: "contact_1",
      exp: 100,
    };
    const sig = signAvatarPayload(payload, SECRET);
    assert.equal(verifyAvatarSignature(payload, sig, SECRET, 101), false);
  });

  it("rejects tampered entity id", () => {
    const payload = {
      workspaceId: "ws_1",
      entityType: "contact" as const,
      entityId: "contact_1",
      exp: 1_700_000_000,
    };
    const sig = signAvatarPayload(payload, SECRET);
    assert.equal(
      verifyAvatarSignature(
        { ...payload, entityId: "contact_2" },
        sig,
        SECRET,
        1_699_999_000,
      ),
      false,
    );
  });

  it("rejects wrong secret", () => {
    const payload = {
      workspaceId: "ws_1",
      entityType: "organization" as const,
      entityId: "org_1",
      exp: 1_700_000_000,
    };
    const sig = signAvatarPayload(payload, SECRET);
    assert.equal(
      verifyAvatarSignature(payload, sig, "other-secret", 1_699_999_000),
      false,
    );
  });

  it("clamps TTL", () => {
    assert.equal(clampAvatarSignedTtlSeconds(), AVATAR_SIGNED_URL_DEFAULT_TTL_SECONDS);
    assert.equal(clampAvatarSignedTtlSeconds(10), 60);
    assert.equal(
      clampAvatarSignedTtlSeconds(AVATAR_SIGNED_URL_MAX_TTL_SECONDS + 100),
      AVATAR_SIGNED_URL_MAX_TTL_SECONDS,
    );
  });
});
