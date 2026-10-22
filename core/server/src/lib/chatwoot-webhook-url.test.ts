import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  chatwootWebhookUrl,
  resolveChatwootWebhookBaseUrl,
} from "./chatwoot-webhook-url.js";

describe("chatwoot webhook url", () => {
  test("prefers CHATWOOT_WEBHOOK_BASE_URL", () => {
    assert.equal(
      resolveChatwootWebhookBaseUrl({
        CHATWOOT_WEBHOOK_BASE_URL: "https://api.example.com/",
        BACKSTEROS_PUBLIC_API_URL: "https://other.example.com",
      }),
      "https://api.example.com",
    );
  });

  test("rejects localhost", () => {
    assert.equal(
      resolveChatwootWebhookBaseUrl({
        BACKSTEROS_PUBLIC_API_URL: "https://localhost:8788",
      }),
      null,
    );
  });

  test("builds webhook path", () => {
    assert.equal(
      chatwootWebhookUrl({
        BACKSTEROS_PUBLIC_API_URL: "https://api.local.backsteros.com",
      }),
      "https://api.local.backsteros.com/api/v1/webhooks/chatwoot",
    );
  });
});
