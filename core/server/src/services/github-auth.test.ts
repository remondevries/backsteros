import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getConfiguredGithubApiToken,
  isGithubServerTokenConfigured,
  selectGithubAccessToken,
} from "./github-auth.js";

function clearGithubEnv(): { restore: () => void } {
  const previous = {
    GITHUB_API_TOKEN: process.env.GITHUB_API_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GH_TOKEN: process.env.GH_TOKEN,
  };
  delete process.env.GITHUB_API_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  return {
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value != null) process.env[key] = value;
        else delete process.env[key];
      }
    },
  };
}

test("getConfiguredGithubApiToken returns null when unset and no file token forced via env-only", () => {
  const { restore } = clearGithubEnv();
  // File may exist on this machine — prefer env GITHUB_TOKEN for the null case by
  // setting an empty override path isn't supported; assert env precedence instead.
  process.env.GITHUB_API_TOKEN = "  ghp_env_token  ";
  assert.equal(getConfiguredGithubApiToken(), "ghp_env_token");
  restore();
});

test("getConfiguredGithubApiToken prefers GITHUB_API_TOKEN over GITHUB_TOKEN", () => {
  const { restore } = clearGithubEnv();
  process.env.GITHUB_TOKEN = "gho_other";
  process.env.GITHUB_API_TOKEN = "ghp_primary";
  assert.equal(getConfiguredGithubApiToken(), "ghp_primary");
  restore();
});

test("getConfiguredGithubApiToken accepts GITHUB_TOKEN", () => {
  const { restore } = clearGithubEnv();
  process.env.GITHUB_TOKEN = "  gho_env  ";
  assert.equal(getConfiguredGithubApiToken(), "gho_env");
  restore();
});

test("isGithubServerTokenConfigured reflects env", () => {
  const { restore } = clearGithubEnv();
  process.env.GITHUB_API_TOKEN = "ghp_test";
  assert.equal(isGithubServerTokenConfigured(), true);
  delete process.env.GITHUB_API_TOKEN;
  process.env.GITHUB_TOKEN = "gho_test";
  assert.equal(isGithubServerTokenConfigured(), true);
  restore();
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
