import assert from "node:assert/strict";
import { test } from "node:test";

import {
  API_KEY_LOOKUP_RANDOM_CHARS,
  API_KEY_SECRET_PREFIX_BY_KIND,
  API_KEY_SECRET_PREFIX_LEGACY,
} from "@backsteros/contracts";

import {
  apiKeyLookupPrefix,
  generateApiKeySecret,
  isApiKeySecretFormat,
} from "./crypto.js";

test("generateApiKeySecret uses a distinct prefix per kind", () => {
  assert.ok(generateApiKeySecret("access").startsWith("sk_access_"));
  assert.ok(generateApiKeySecret("agent").startsWith("sk_agent_"));
  assert.ok(
    generateApiKeySecret("applications").startsWith("sk_applications_"),
  );
  assert.ok(generateApiKeySecret("tv").startsWith("sk_tv_"));
  assert.ok(generateApiKeySecret("carddav").startsWith("sk_contacts_"));
  assert.ok(generateApiKeySecret("legacy").startsWith("sk_live_"));
  assert.ok(generateApiKeySecret().startsWith("sk_live_"));
});

test("apiKeyLookupPrefix keeps fixed random entropy after long prefixes", () => {
  for (const [kind, prefix] of Object.entries(API_KEY_SECRET_PREFIX_BY_KIND)) {
    const secret = generateApiKeySecret(kind as keyof typeof API_KEY_SECRET_PREFIX_BY_KIND);
    const lookup = apiKeyLookupPrefix(secret);
    assert.equal(lookup.length, prefix.length + API_KEY_LOOKUP_RANDOM_CHARS);
    assert.ok(secret.startsWith(lookup));
    assert.equal(lookup.slice(0, prefix.length), prefix);
  }
  const legacy = `${API_KEY_SECRET_PREFIX_LEGACY}${"a".repeat(32)}`;
  assert.equal(
    apiKeyLookupPrefix(legacy).length,
    API_KEY_SECRET_PREFIX_LEGACY.length + API_KEY_LOOKUP_RANDOM_CHARS,
  );
});

test("isApiKeySecretFormat accepts typed and legacy prefixes", () => {
  assert.equal(isApiKeySecretFormat("sk_access_abc"), true);
  assert.equal(isApiKeySecretFormat("sk_applications_abc"), true);
  assert.equal(isApiKeySecretFormat("sk_live_abc"), true);
  assert.equal(isApiKeySecretFormat("sk_space_abc"), false);
  assert.equal(isApiKeySecretFormat("local"), false);
});
