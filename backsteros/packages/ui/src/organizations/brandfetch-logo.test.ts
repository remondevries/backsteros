import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  brandfetchLogoUrl,
  brandfetchLogoUrlFromWebsite,
  registrableDomainFromWebsite,
  resolveOrganizationAvatarSrc,
} from "./brandfetch-logo.js";

describe("brandfetch-logo", () => {
  it("parses website domains", () => {
    assert.equal(registrableDomainFromWebsite("https://www.acme.com/about"), "acme.com");
    assert.equal(registrableDomainFromWebsite("acme.com"), "acme.com");
    assert.equal(registrableDomainFromWebsite("http://acme.com"), "acme.com");
    assert.equal(registrableDomainFromWebsite(""), null);
    assert.equal(registrableDomainFromWebsite("not a url"), null);
  });

  it("builds CDN URLs with client id", () => {
    const url = brandfetchLogoUrl("nike.com", "client_test");
    assert.ok(url?.startsWith("https://cdn.brandfetch.io/domain/nike.com/"));
    assert.ok(url?.includes("type/icon"));
    assert.ok(url?.includes("fallback/404"));
    assert.ok(url?.includes("c=client_test"));
  });

  it("prefers uploaded avatar over Brandfetch", () => {
    assert.equal(
      resolveOrganizationAvatarSrc({
        uploadedSrc: "blob:manual",
        website: "https://acme.com",
        brandfetchClientId: "client_test",
      }),
      "blob:manual",
    );
    assert.equal(
      resolveOrganizationAvatarSrc({
        avatarStorageKey: "avatars/org/1",
        website: "https://acme.com",
        brandfetchClientId: "client_test",
      }),
      null,
    );
    assert.ok(
      resolveOrganizationAvatarSrc({
        website: "https://acme.com",
        brandfetchClientId: "client_test",
      })?.includes("acme.com"),
    );
  });

  it("returns null without client id", () => {
    assert.equal(
      brandfetchLogoUrlFromWebsite("https://acme.com", null),
      null,
    );
  });
});
