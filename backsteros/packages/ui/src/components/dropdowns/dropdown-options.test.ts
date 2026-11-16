import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveOrgDropdownAvatarSrc,
} from "./dropdown-options.js";

test("buildProjectDropdownOptions hides completed canceled duplicated", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active" },
      { key: "DONE", name: "Done", status: "completed" },
      { key: "CXL", name: "Canceled", status: "canceled" },
      { key: "DUP", name: "Dup", status: "duplicated" },
      { key: "HOLD", name: "Hold", status: "on_hold" },
    ],
    { includeNone: false },
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ["OS", "HOLD"],
  );
});

test("buildProjectDropdownOptions includeClosed lists completed and canceled", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active" },
      { key: "DONE", name: "Done", status: "completed" },
      { key: "CXL", name: "Canceled", status: "canceled" },
    ],
    { includeNone: false, includeClosed: true },
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ["OS", "DONE", "CXL"],
  );
});

test("buildProjectDropdownOptions keeps a closed assigned project", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active" },
      { key: "DONE", name: "Done", status: "completed" },
    ],
    { includeNone: true, keepKeys: ["DONE"] },
  );

  assert.equal(options[0]?.value, DROPDOWN_NO_PROJECT_VALUE);
  assert.deepEqual(
    options.slice(1).map((option) => option.value),
    ["OS", "DONE"],
  );
});

test("buildProjectDropdownOptions tags project type filters", () => {
  const options = buildProjectDropdownOptions(
    [
      { key: "OS", name: "Open", status: "active", type: "codebase" },
      {
        key: "DOM",
        name: "Domain",
        status: "active",
        type: "domeinname",
      },
    ],
    { includeNone: true },
  );

  assert.equal(options[0]?.filterValue, undefined);
  assert.equal(options[1]?.filterValue, "codebase");
  assert.equal(options[1]?.filterLabel, "Codebase");
  assert.equal(options[2]?.filterValue, "domeinname");
  assert.equal(options[2]?.filterLabel, "Domains");
});

test("resolveOrgDropdownAvatarSrc prefers blob map over Brandfetch", () => {
  const org = {
    id: "org_1",
    name: "Acme",
    website: "https://acme.com",
    avatarStorageKey: "avatars/org_1",
  };
  assert.equal(
    resolveOrgDropdownAvatarSrc(org, {
      avatarSrcById: { org_1: "blob:manual-upload" },
      brandfetchClientId: "client_test",
    }),
    "blob:manual-upload",
  );
});

test("resolveOrgDropdownAvatarSrc falls back to Brandfetch from website", () => {
  const src = resolveOrgDropdownAvatarSrc(
    {
      id: "org_2",
      name: "Nike",
      website: "https://www.nike.com",
    },
    { brandfetchClientId: "client_test" },
  );
  assert.ok(src?.includes("nike.com"));
  assert.ok(src?.includes("cdn.brandfetch.io"));
});

test("resolveOrgDropdownAvatarSrc uses baked avatarSrc before Brandfetch", () => {
  assert.equal(
    resolveOrgDropdownAvatarSrc(
      {
        id: "org_3",
        name: "Baked",
        website: "https://acme.com",
        avatarSrc: "blob:already-resolved",
      },
      { brandfetchClientId: "client_test" },
    ),
    "blob:already-resolved",
  );
});

test("buildOrganizationDropdownOptions sets avatarSrc on merchant rows", () => {
  const options = buildOrganizationDropdownOptions(
    [
      {
        id: "stripe",
        name: "Stripe",
        website: "https://stripe.com",
        avatarStorageKey: "avatars/stripe",
      },
    ],
    {
      avatarSrcById: { stripe: "blob:stripe-logo" },
      brandfetchClientId: "client_test",
    },
  );
  const stripe = options.find((option) => option.value === "stripe");
  assert.equal(stripe?.avatarSrc, "blob:stripe-logo");
  assert.ok(stripe?.icon);
  assert.equal(options[0]?.value, DROPDOWN_NONE_VALUE);
});
