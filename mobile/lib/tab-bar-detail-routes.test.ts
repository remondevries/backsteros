import assert from "node:assert/strict";
import test from "node:test";

import { shouldHideTabBarForPathname } from "./tab-bar-detail-routes";

test("shouldHideTabBarForPathname keeps section list roots visible", () => {
  assert.equal(shouldHideTabBarForPathname("/tasks"), false);
  assert.equal(shouldHideTabBarForPathname("/contacts"), false);
  assert.equal(shouldHideTabBarForPathname("/social"), false);
  assert.equal(shouldHideTabBarForPathname("/calendar"), false);
  assert.equal(shouldHideTabBarForPathname("/finance/transactions"), false);
  assert.equal(shouldHideTabBarForPathname("/compose"), false);
});

test("shouldHideTabBarForPathname hides phone detail and create routes", () => {
  assert.equal(shouldHideTabBarForPathname("/task/abc"), true);
  assert.equal(shouldHideTabBarForPathname("/tasks/new"), true);
  assert.equal(shouldHideTabBarForPathname("/meeting/abc"), true);
  assert.equal(shouldHideTabBarForPathname("/contacts/abc"), true);
  assert.equal(shouldHideTabBarForPathname("/social/abc"), true);
  assert.equal(shouldHideTabBarForPathname("/habits/abc"), true);
  assert.equal(shouldHideTabBarForPathname("/journal/2025-08-26"), true);
  assert.equal(shouldHideTabBarForPathname("/document/abc"), true);
  assert.equal(shouldHideTabBarForPathname("/projects/new"), true);
  assert.equal(shouldHideTabBarForPathname("/inbox/new"), true);
  assert.equal(shouldHideTabBarForPathname("/create/meeting"), true);
  assert.equal(shouldHideTabBarForPathname("/finance/transaction/abc"), true);
});
