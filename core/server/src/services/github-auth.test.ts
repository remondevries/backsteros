import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getConfiguredGithubApiToken,
  isGithubServerTokenConfigured,
  selectGithubAccessToken,
} from "./github-auth.js";

test("getConfiguredGithubApiToken returns null when unset", () => {
  const previous = process.env.GITHUB_API_TOKEN;
  delete process.env.GITHUB_API_TOKEN;
  assert.equal(getConfiguredGithubApiToken(), null);
  if (previous != null) process.env.GITHUB_API_TOKEN = previous;
});

test("getConfiguredGithubApiToken returns trimmed env token", () => {
  const previous = process.env.GITHUB_API_TOKEN;
  process.env.GITHUB_API_TOKEN = "  ghp_env_token  ";
  assert.equal(getConfiguredGithubApiToken(), "ghp_env_token");
  if (previous != null) process.env.GITHUB_API_TOKEN = previous;
  else delete process.env.GITHUB_API_TOKEN;
});

test("isGithubServerTokenConfigured reflects env", () => {
  const previous = process.env.GITHUB_API_TOKEN;

  delete process.env.GITHUB_API_TOKEN;
  assert.equal(isGithubServerTokenConfigured(), false);

  process.env.GITHUB_API_TOKEN = "ghp_test";
  assert.equal(isGithubServerTokenConfigured(), true);

  if (previous != null) process.env.GITHUB_API_TOKEN = previous;
  else delete process.env.GITHUB_API_TOKEN;
});

test("selectGithubAccessToken prefers workspace PAT over env", () => {
  assert.equal(
    selectGithubAccessToken({
      workspaceToken: "ghp_workspace",
      envToken: "ghp_env",
    }),
    "ghp_workspace",
  );
});

test("selectGithubAccessToken uses env PAT when workspace unset", () => {
  assert.equal(
    selectGithubAccessToken({
      workspaceToken: null,
      envToken: "ghp_env",
    }),
    "ghp_env",
  );
});

test("selectGithubAccessToken returns null when no PAT is set", () => {
  assert.equal(
    selectGithubAccessToken({
      workspaceToken: null,
      envToken: null,
    }),
    null,
  );
});
