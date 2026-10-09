/** Thin Google Calendar / OAuth HTTP client (no googleapis package). */

import { createHash } from "node:crypto";

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

/** Read/write events (title, start, end) — required for Convert to Event sync. */
export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

/** calendarList (readonly) + event read/write. */
export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  GOOGLE_CALENDAR_READONLY_SCOPE,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
].join(" ");

export const GOOGLE_OAUTH_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";
export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";

export class GoogleCalendarApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "GoogleCalendarApiError";
    this.status = status;
    this.body = body;
  }
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  selected?: boolean;
};

export type GoogleCalendarEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  creator?: { email?: string };
  organizer?: { email?: string };
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  iCalUID?: string;
  etag?: string;
  transparency?: string;
  visibility?: string;
  recurringEventId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      error?: string | { message?: string };
      error_description?: string;
    };
    if (typeof json.error === "string") {
      return json.error_description
        ? `${json.error}: ${json.error_description}`
        : json.error;
    }
    if (json.error && typeof json.error === "object" && json.error.message) {
      return json.error.message;
    }
  } catch {
    // fall through
  }
  return text.trim() || `Google API HTTP ${response.status}`;
}

export function buildGoogleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scope ?? GOOGLE_CALENDAR_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new GoogleCalendarApiError(
      await readErrorMessage(response),
      response.status,
      "",
    );
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new GoogleCalendarApiError(
      await readErrorMessage(response),
      response.status,
      "",
    );
  }
  return (await response.json()) as GoogleTokenResponse;
}

export class GoogleCalendarClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(
    path: string,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    const url = new URL(
      path.startsWith("http") ? path : `${GOOGLE_CALENDAR_API_BASE}${path}`,
    );
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new GoogleCalendarApiError(
        await readErrorMessage(response),
        response.status,
        "",
      );
    }
    return (await response.json()) as T;
  }

  async getAccountEmail(): Promise<string | null> {
    try {
      const response = await fetch(GOOGLE_USERINFO_URL, {
        headers: { authorization: `Bearer ${this.accessToken}` },
      });
      if (!response.ok) return null;
      const body = asRecord(await response.json());
      const email = body?.email;
      return typeof email === "string" && email.trim() ? email.trim() : null;
    } catch {
      return null;
    }
  }

  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    const items: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.request<{
        items?: GoogleCalendarListEntry[];
        nextPageToken?: string;
      }>("/users/me/calendarList", {
        maxResults: "250",
        pageToken,
      });
      for (const item of page.items ?? []) {
        if (item.id?.trim()) items.push(item);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  async listEvents(input: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
  }): Promise<GoogleCalendarEvent[]> {
    const items: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    const calendarId = encodeURIComponent(input.calendarId);
    do {
      const page = await this.request<{
        items?: GoogleCalendarEvent[];
        nextPageToken?: string;
      }>(`/calendars/${calendarId}/events`, {
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        maxResults: "2500",
        pageToken,
      });
      for (const item of page.items ?? []) {
        if (item.id?.trim()) items.push(item);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  async watchEvents(input: {
    calendarId: string;
    channelId: string;
    address: string;
    token: string;
    /** Unix ms expiration; Google Calendar max is ~7–14 days. */
    expirationMs?: number;
  }): Promise<{
    channelId: string;
    resourceId: string;
    expiration: string | null;
  }> {
    const calendarId = encodeURIComponent(input.calendarId);
    const body: Record<string, unknown> = {
      id: input.channelId,
      type: "web_hook",
      address: input.address,
      token: input.token,
    };
    if (input.expirationMs) {
      body.expiration = String(input.expirationMs);
    }
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events/watch`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      let message = text.trim() || `Google API HTTP ${response.status}`;
      try {
        const json = JSON.parse(text) as {
          error?: { message?: string };
        };
        if (json.error?.message) message = json.error.message;
      } catch {
        // keep text
      }
      throw new GoogleCalendarApiError(message, response.status, text);
    }
    const json = (await response.json()) as {
      id?: string;
      resourceId?: string;
      expiration?: string;
    };
    return {
      channelId: json.id?.trim() || input.channelId,
      resourceId: json.resourceId?.trim() || "",
      expiration: json.expiration?.trim() || null,
    };
  }

  /**
   * Patch title / start / end on an existing event (including recurring instances).
   * https://developers.google.com/calendar/api/v3/reference/events/patch
   */
  async patchEvent(input: {
    calendarId: string;
    eventId: string;
    summary?: string;
    location?: string | null;
    start?: GoogleCalendarEventDate;
    end?: GoogleCalendarEventDate;
  }): Promise<GoogleCalendarEvent> {
    const calendarId = encodeURIComponent(input.calendarId);
    const eventId = encodeURIComponent(input.eventId);
    const body: Record<string, unknown> = {};
    if (input.summary !== undefined) body.summary = input.summary;
    if (input.location !== undefined) body.location = input.location;
    if (input.start !== undefined) body.start = input.start;
    if (input.end !== undefined) body.end = input.end;
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      let message = text.trim() || `Google API HTTP ${response.status}`;
      try {
        const json = JSON.parse(text) as { error?: { message?: string } };
        if (json.error?.message) message = json.error.message;
      } catch {
        // keep text
      }
      throw new GoogleCalendarApiError(message, response.status, text);
    }
    return (await response.json()) as GoogleCalendarEvent;
  }

  async stopChannel(input: {
    channelId: string;
    resourceId: string;
  }): Promise<void> {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/channels/stop`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        id: input.channelId,
        resourceId: input.resourceId,
      }),
    });
    // 404 = already gone; treat as success.
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new GoogleCalendarApiError(
        text.trim() || `Google API HTTP ${response.status}`,
        response.status,
        text,
      );
    }
  }
}

/** Stable row id for upserts across cores. */
export function externalCalendarEventId(
  workspaceId: string,
  provider: string,
  calendarId: string,
  externalId: string,
): string {
  return createHash("sha256")
    .update(`${workspaceId}:${provider}:${calendarId}:${externalId}`)
    .digest("hex")
    .slice(0, 21);
}
