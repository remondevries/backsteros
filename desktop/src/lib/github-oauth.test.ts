import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGithubOauthReturnUrl } from "./github-oauth.ts";

describe("isGithubOauthReturnUrl", () => {
  it("accepts http(s) and tauri packaged origins", () => {
    assert.equal(isGithubOauthReturnUrl("http://localhost:1420/settings/github"), true);
    assert.equal(
      isGithubOauthReturnUrl("https://tauri.localhost/settings/github"),
      true,
    );
    assert.equal(isGithubOauthReturnUrl("tauri://localhost/settings/github"), true);
  });

  it("rejects relative and unknown schemes", () => {
    assert.equal(isGithubOauthReturnUrl("/settings/github"), false);
    assert.equal(isGithubOauthReturnUrl("file:///tmp/x"), false);
  });
});
