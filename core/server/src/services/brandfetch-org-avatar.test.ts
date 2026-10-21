import assert from "node:assert/strict";
import { test } from "node:test";

import {
  brandfetchLogoUrl,
  registrableDomainFromWebsite,
} from "./brandfetch-org-avatar.js";

test("registrableDomainFromWebsite strips www and path", () => {
  assert.equal(
    registrableDomainFromWebsite("https://www.acme.com/about"),
    "acme.com",
  );
  assert.equal(registrableDomainFromWebsite("nike.com"), "nike.com");
  assert.equal(registrableDomainFromWebsite(""), null);
  assert.equal(registrableDomainFromWebsite("not a url"), null);
});

test("brandfetchLogoUrl builds CDN path with client id", () => {
  const url = brandfetchLogoUrl("nike.com", "client_test", 256);
  assert.ok(url.startsWith("https://cdn.brandfetch.io/domain/nike.com/"));
  assert.ok(url.includes("/w/256/h/256/"));
  assert.ok(url.includes("type/icon"));
  assert.ok(url.includes("c=client_test"));
});
