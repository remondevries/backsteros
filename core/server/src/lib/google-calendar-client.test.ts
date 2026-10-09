import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGoogleAuthorizeUrl,
  externalCalendarEventId,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
} from "./google-calendar-client.js";

describe("google-calendar-client", () => {
  it("builds an authorize URL with offline consent", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: "client.apps.googleusercontent.com",
        redirectUri:
          "http://127.0.0.1:8788/api/v1/settings/google-calendar/oauth/callback",
        state: "abc",
      }),
    );
    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("client_id"), "client.apps.googleusercontent.com");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.equal(url.searchParams.get("scope"), GOOGLE_CALENDAR_OAUTH_SCOPES);
    assert.equal(url.searchParams.get("state"), "abc");
  });

  it("hashes a stable external event id", () => {
    const a = externalCalendarEventId(
      "ws",
      "google_calendar",
      "primary",
      "evt-1",
    );
    const b = externalCalendarEventId(
      "ws",
      "google_calendar",
      "primary",
      "evt-1",
    );
    const c = externalCalendarEventId(
      "ws",
      "google_calendar",
      "primary",
      "evt-2",
    );
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 21);
  });
});
