import assert from "node:assert/strict";
import { test } from "node:test";

import type { AuthContext } from "../middleware/auth.js";

const apiKeyAuth: AuthContext = {
  kind: "api_key",
  userId: null,
  clerkUserId: null,
  apiKeyId: "key_test",
  contactId: null,
  workspaceId: "ws_test",
  membershipRole: null,
  scopes: ["projects:read"],
};

test("resolveGithubAccessToken uses GITHUB_API_TOKEN for api_key auth", async () => {
  process.env.GITHUB_API_TOKEN = "ghp_cloud_test_token";
  const { resolveGithubAccessToken } = await import("./github-auth.js");

  const token = await resolveGithubAccessToken(apiKeyAuth);
  assert.equal(token, "ghp_cloud_test_token");

  delete process.env.GITHUB_API_TOKEN;
});

test("getConfiguredGithubApiToken returns null when unset", async () => {
  delete process.env.GITHUB_API_TOKEN;
  const { getConfiguredGithubApiToken } = await import("./github-auth.js");
  assert.equal(getConfiguredGithubApiToken(), null);
});

test("isGithubServerTokenConfigured reflects env", async () => {
  const { isGithubServerTokenConfigured } = await import("./github-auth.js");

  delete process.env.GITHUB_API_TOKEN;
  assert.equal(isGithubServerTokenConfigured(), false);

  process.env.GITHUB_API_TOKEN = "ghp_test";
  assert.equal(isGithubServerTokenConfigured(), true);

  delete process.env.GITHUB_API_TOKEN;
});
