import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withEntityDetailPageLayout } from "./entity-detail-page-layout-href.ts";

describe("withEntityDetailPageLayout", () => {
  it("adds contactLayout=page for standalone contact detail hrefs", () => {
    assert.equal(
      withEntityDetailPageLayout("/contacts/acme-corp"),
      "/contacts/acme-corp?contactLayout=page",
    );
    assert.equal(
      withEntityDetailPageLayout("/contacts/acme-corp/details"),
      "/contacts/acme-corp/details?contactLayout=page",
    );
  });

  it("adds orgLayout=page for standalone organization detail hrefs", () => {
    assert.equal(
      withEntityDetailPageLayout("/organizations/acme"),
      "/organizations/acme?orgLayout=page",
    );
  });

  it("leaves hrefs that already request page layout unchanged", () => {
    assert.equal(
      withEntityDetailPageLayout("/contacts/acme-corp?contactLayout=page"),
      "/contacts/acme-corp?contactLayout=page",
    );
  });

  it("does not change list roots or unrelated paths", () => {
    assert.equal(withEntityDetailPageLayout("/contacts"), "/contacts");
    assert.equal(withEntityDetailPageLayout("/calendar"), "/calendar");
    assert.equal(
      withEntityDetailPageLayout("/contacts/new"),
      "/contacts/new",
    );
  });
});
