import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeAvatarMimeType,
  resolveAvatarContentType,
  sniffAvatarContentType,
} from "./content-type";

test("normalizeAvatarMimeType accepts aliases and strips params", () => {
  assert.equal(normalizeAvatarMimeType("image/jpg"), "image/jpeg");
  assert.equal(normalizeAvatarMimeType("image/png; charset=binary"), "image/png");
  assert.equal(normalizeAvatarMimeType("image/svg+xml"), null);
});

test("sniffAvatarContentType detects common rasters", () => {
  assert.equal(
    sniffAvatarContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
    "image/jpeg",
  );
  assert.equal(
    sniffAvatarContentType(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
});

test("resolveAvatarContentType prefers sniff over a wrong declared type", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(resolveAvatarContentType("image/jpeg", png), "image/png");
  assert.equal(resolveAvatarContentType("", png), "image/png");
  assert.equal(resolveAvatarContentType("application/octet-stream", png), "image/png");
});
