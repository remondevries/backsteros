import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  brandfetchApiKeyFromEnv,
  previewBrandfetchApiKey,
} from "./brandfetch-env.js";

afterEach(() => {
  delete process.env.BRANDFETCH_API_KEY;
});

test("brandfetchApiKeyFromEnv reads trimmed key", () => {
  process.env.BRANDFETCH_API_KEY = "  secret_key_value  ";
  assert.equal(brandfetchApiKeyFromEnv(), "secret_key_value");
});

test("brandfetchApiKeyFromEnv is null when unset", () => {
  assert.equal(brandfetchApiKeyFromEnv(), null);
});

test("previewBrandfetchApiKey masks like other integration secrets", () => {
  const preview = previewBrandfetchApiKey("abcdefghijklmnopqrstuvwxyz");
  assert.equal(preview, "abcdefgh…wxyz");
});
