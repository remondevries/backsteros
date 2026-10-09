import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  googleCalendarWebhookUrl,
  resolveGoogleCalendarWebhookBaseUrl,
} from "./google-calendar-webhook-url.js";

describe("google calendar webhook URL", () => {
  it("rejects http and loopback bases", () => {
    assert.equal(
      resolveGoogleCalendarWebhookBaseUrl({
        PUBLIC_API_URL: "http://127.0.0.1:8788",
      }),
      null,
    );
    assert.equal(
      googleCalendarWebhookUrl({
        PUBLIC_API_URL: "http://127.0.0.1:8788",
      }),
      null,
    );
  });

  it("accepts https public hosts", () => {
    assert.equal(
      resolveGoogleCalendarWebhookBaseUrl({
        PUBLIC_API_URL: "https://api.local.backsteros.com/extra",
      }),
      "https://api.local.backsteros.com",
    );
    assert.equal(
      googleCalendarWebhookUrl({
        GOOGLE_CALENDAR_WEBHOOK_BASE_URL: "https://api.local.backsteros.com",
      }),
      "https://api.local.backsteros.com/api/v1/webhooks/google-calendar",
    );
  });
});
