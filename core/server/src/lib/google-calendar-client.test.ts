import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  buildGoogleAuthorizeUrl,
  externalCalendarEventId,
  GoogleCalendarClient,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
} from "./google-calendar-client.js";

describe("google-calendar-client", () => {
  afterEach(() => {
    mock.restoreAll();
  });

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

  it("deleteEvent treats 404 and 410 as success", async () => {
    const statuses = [204, 404, 410];
    for (const status of statuses) {
      mock.method(globalThis, "fetch", async () => new Response(null, { status }));
      const client = new GoogleCalendarClient("token");
      await assert.doesNotReject(() =>
        client.deleteEvent({ calendarId: "primary", eventId: "evt-1" }),
      );
      mock.restoreAll();
    }
  });

  it("deleteEvent throws on unexpected Google errors", async () => {
    mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "quota" } }), {
          status: 403,
        }),
    );
    const client = new GoogleCalendarClient("token");
    await assert.rejects(
      () => client.deleteEvent({ calendarId: "primary", eventId: "evt-1" }),
      /quota/,
    );
  });
});
