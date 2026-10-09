import { randomBytes } from "node:crypto";

import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import type {
  ExternalCalendarEvent,
  GoogleCalendarCalendarSummary,
  GoogleCalendarOAuthStartResult,
  GoogleCalendarSettings,
  GoogleCalendarSyncResult,
  GoogleCalendarTestConnectionResult,
  ListExternalCalendarEventsQuery,
  UpdateGoogleCalendarSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  externalCalendarEvents,
  meetings,
  workspaceIntegrationSecrets,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleAuthorizationCode,
  externalCalendarEventId,
  GoogleCalendarApiError,
  GoogleCalendarClient,
  refreshGoogleAccessToken,
  type GoogleCalendarEvent,
} from "../lib/google-calendar-client.js";
import {
  googleCalendarWebhookUrl,
  resolveGoogleCalendarWebhookBaseUrl,
} from "../lib/google-calendar-webhook-url.js";
import { previewCursorApiKey } from "./cursor-settings.js";

export {
  googleCalendarWebhookUrl,
  resolveGoogleCalendarWebhookBaseUrl,
} from "../lib/google-calendar-webhook-url.js";

export const GOOGLE_CALENDAR_PROVIDER = "google_calendar";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 60_000;
const DEFAULT_SYNC_PAST_DAYS = 30;
const DEFAULT_SYNC_FUTURE_DAYS = 90;
/** Renew watch channels when fewer than this many ms remain. */
const WATCH_RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;
/** Ask Google for ~6.5 days (under Calendar’s typical channel max). */
const WATCH_TTL_MS = 6 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000;

export type GoogleCalendarWatchChannel = {
  calendarId: string;
  channelId: string;
  resourceId: string;
  expiration: string;
  token: string;
};

type OAuthPending = {
  workspaceId: string;
  redirectUri: string;
  expiresAt: number;
};

const oauthPendingByState = new Map<string, OAuthPending>();

type SecretRow = {
  googleCalendarClientId: string | null;
  googleCalendarClientSecret: string | null;
  googleCalendarRefreshToken: string | null;
  googleCalendarAccessToken: string | null;
  googleCalendarAccessTokenExpiresAt: Date | null;
  googleCalendarAccountEmail: string | null;
  googleCalendarSelectedCalendarIds: string[] | null;
  googleCalendarLastSyncedAt: Date | null;
  googleCalendarWatchChannels: GoogleCalendarWatchChannel[] | null;
};

function pruneOAuthPending(): void {
  const now = Date.now();
  for (const [state, entry] of oauthPendingByState) {
    if (entry.expiresAt <= now) oauthPendingByState.delete(state);
  }
}

export function resolveGoogleCalendarOAuthRedirectUri(
  requestOrigin?: string | null,
): string {
  const fromEnv =
    process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    process.env.BACKSTEROS_PUBLIC_API_URL?.trim() ||
    "";
  const base = (fromEnv || requestOrigin?.trim() || "http://127.0.0.1:8788").replace(
    /\/$/,
    "",
  );
  if (base.includes("/api/v1/settings/google-calendar/oauth/callback")) {
    return base;
  }
  return `${base}/api/v1/settings/google-calendar/oauth/callback`;
}

function envClientId(): string | null {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || null;
}

function envClientSecret(): string | null {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || null;
}

async function getSecretRow(workspaceId: string): Promise<SecretRow | null> {
  const [row] = await db
    .select({
      googleCalendarClientId: workspaceIntegrationSecrets.googleCalendarClientId,
      googleCalendarClientSecret:
        workspaceIntegrationSecrets.googleCalendarClientSecret,
      googleCalendarRefreshToken:
        workspaceIntegrationSecrets.googleCalendarRefreshToken,
      googleCalendarAccessToken:
        workspaceIntegrationSecrets.googleCalendarAccessToken,
      googleCalendarAccessTokenExpiresAt:
        workspaceIntegrationSecrets.googleCalendarAccessTokenExpiresAt,
      googleCalendarAccountEmail:
        workspaceIntegrationSecrets.googleCalendarAccountEmail,
      googleCalendarSelectedCalendarIds:
        workspaceIntegrationSecrets.googleCalendarSelectedCalendarIds,
      googleCalendarLastSyncedAt:
        workspaceIntegrationSecrets.googleCalendarLastSyncedAt,
      googleCalendarWatchChannels:
        workspaceIntegrationSecrets.googleCalendarWatchChannels,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

function parseWatchChannels(raw: unknown): GoogleCalendarWatchChannel[] {
  if (!Array.isArray(raw)) return [];
  const out: GoogleCalendarWatchChannel[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const calendarId =
      typeof record.calendarId === "string" ? record.calendarId.trim() : "";
    const channelId =
      typeof record.channelId === "string" ? record.channelId.trim() : "";
    const resourceId =
      typeof record.resourceId === "string" ? record.resourceId.trim() : "";
    const expiration =
      typeof record.expiration === "string" ? record.expiration.trim() : "";
    const token = typeof record.token === "string" ? record.token.trim() : "";
    if (!calendarId || !channelId || !resourceId || !token) continue;
    out.push({ calendarId, channelId, resourceId, expiration, token });
  }
  return out;
}

function resolveClientId(row: SecretRow | null): string | null {
  return row?.googleCalendarClientId?.trim() || envClientId();
}

function resolveClientSecret(row: SecretRow | null): string | null {
  return row?.googleCalendarClientSecret?.trim() || envClientSecret();
}

function selectedCalendarIds(row: SecretRow | null): string[] {
  const raw = row?.googleCalendarSelectedCalendarIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && Boolean(id.trim()));
}

export async function getGoogleCalendarSettings(
  workspaceId: string,
  requestOrigin?: string | null,
): Promise<GoogleCalendarSettings> {
  const row = await getSecretRow(workspaceId);
  const clientId = resolveClientId(row);
  const clientSecret = resolveClientSecret(row);
  const refreshToken = row?.googleCalendarRefreshToken?.trim() || null;
  const channels = parseWatchChannels(row?.googleCalendarWatchChannels);
  const webhookUrl = googleCalendarWebhookUrl();
  const now = Date.now();
  const activeChannels = channels.filter((channel) => {
    const exp = Date.parse(channel.expiration);
    return Number.isFinite(exp) ? exp > now : true;
  });
  return {
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured: Boolean(clientSecret),
    refreshTokenConfigured: Boolean(refreshToken),
    connected: Boolean(clientId && clientSecret && refreshToken),
    accountEmail: row?.googleCalendarAccountEmail?.trim() || null,
    selectedCalendarIds: selectedCalendarIds(row),
    lastSyncedAt: row?.googleCalendarLastSyncedAt?.toISOString() ?? null,
    oauthRedirectUri: resolveGoogleCalendarOAuthRedirectUri(requestOrigin),
    pushEnabled: Boolean(webhookUrl && activeChannels.length > 0),
    pushWebhookUrl: webhookUrl,
    pushChannelCount: activeChannels.length,
    pushError: webhookUrl
      ? null
      : "Push needs a public HTTPS API URL (set GOOGLE_CALENDAR_WEBHOOK_BASE_URL, e.g. https://api.local.backsteros.com).",
  };
}

export async function updateGoogleCalendarSettings(
  workspaceId: string,
  patch: UpdateGoogleCalendarSettingsInput,
  requestOrigin?: string | null,
): Promise<GoogleCalendarSettings> {
  const current = await getSecretRow(workspaceId);
  let nextClientId = current?.googleCalendarClientId ?? null;
  let nextClientSecret = current?.googleCalendarClientSecret ?? null;
  let nextRefresh = current?.googleCalendarRefreshToken ?? null;
  let nextSelected = selectedCalendarIds(current);
  let clearTokens = false;

  if (patch.clientId !== undefined) {
    const trimmed = patch.clientId.trim();
    nextClientId = trimmed.length > 0 ? trimmed : null;
    clearTokens = true;
  }
  if (patch.clientSecret !== undefined) {
    const trimmed = patch.clientSecret.trim();
    nextClientSecret = trimmed.length > 0 ? trimmed : null;
    clearTokens = true;
  }
  if (patch.refreshToken !== undefined) {
    const trimmed = patch.refreshToken.trim();
    nextRefresh = trimmed.length > 0 ? trimmed : null;
    clearTokens = true;
  }
  if (patch.selectedCalendarIds !== undefined) {
    nextSelected = patch.selectedCalendarIds.map((id) => id.trim()).filter(Boolean);
  }

  if (clearTokens && !nextRefresh) {
    await stopGoogleCalendarWatches(workspaceId).catch(() => {});
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      googleCalendarClientId: nextClientId,
      googleCalendarClientSecret: nextClientSecret,
      googleCalendarRefreshToken: nextRefresh,
      googleCalendarAccessToken: clearTokens
        ? null
        : (current?.googleCalendarAccessToken ?? null),
      googleCalendarAccessTokenExpiresAt: clearTokens
        ? null
        : (current?.googleCalendarAccessTokenExpiresAt ?? null),
      googleCalendarAccountEmail: clearTokens
        ? null
        : (current?.googleCalendarAccountEmail ?? null),
      googleCalendarSelectedCalendarIds: nextSelected,
      googleCalendarWatchChannels:
        clearTokens && !nextRefresh
          ? []
          : (current?.googleCalendarWatchChannels ?? []),
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        googleCalendarClientId: nextClientId,
        googleCalendarClientSecret: nextClientSecret,
        googleCalendarRefreshToken: nextRefresh,
        ...(clearTokens
          ? {
              googleCalendarAccessToken: null,
              googleCalendarAccessTokenExpiresAt: null,
              googleCalendarAccountEmail:
                patch.refreshToken !== undefined && nextRefresh
                  ? current?.googleCalendarAccountEmail ?? null
                  : null,
              ...(nextRefresh
                ? {}
                : { googleCalendarWatchChannels: [] }),
            }
          : {}),
        googleCalendarSelectedCalendarIds: nextSelected,
        updatedAt: new Date(),
      },
    });

  return getGoogleCalendarSettings(workspaceId, requestOrigin);
}

export async function startGoogleCalendarOAuth(
  workspaceId: string,
  requestOrigin?: string | null,
): Promise<GoogleCalendarOAuthStartResult> {
  const row = await getSecretRow(workspaceId);
  const clientId = resolveClientId(row);
  const clientSecret = resolveClientSecret(row);
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Calendar OAuth client id and secret are required. Paste them in Settings or set GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET.",
    );
  }
  pruneOAuthPending();
  const redirectUri = resolveGoogleCalendarOAuthRedirectUri(requestOrigin);
  const state = newId();
  oauthPendingByState.set(state, {
    workspaceId,
    redirectUri,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  });
  return {
    authorizeUrl: buildGoogleAuthorizeUrl({
      clientId,
      redirectUri,
      state,
    }),
    redirectUri,
  };
}

export async function completeGoogleCalendarOAuth(input: {
  code: string | null;
  state: string | null;
  error?: string | null;
}): Promise<{ ok: boolean; message: string; workspaceId?: string }> {
  if (input.error?.trim()) {
    return { ok: false, message: input.error.trim() };
  }
  const state = input.state?.trim();
  const code = input.code?.trim();
  if (!state || !code) {
    return { ok: false, message: "Missing OAuth code or state." };
  }
  pruneOAuthPending();
  const pending = oauthPendingByState.get(state);
  oauthPendingByState.delete(state);
  if (!pending || pending.expiresAt <= Date.now()) {
    return { ok: false, message: "OAuth state expired. Start Connect again." };
  }

  const row = await getSecretRow(pending.workspaceId);
  const clientId = resolveClientId(row);
  const clientSecret = resolveClientSecret(row);
  if (!clientId || !clientSecret) {
    return { ok: false, message: "OAuth client credentials are missing." };
  }

  try {
    const tokens = await exchangeGoogleAuthorizationCode({
      clientId,
      clientSecret,
      code,
      redirectUri: pending.redirectUri,
    });
    if (!tokens.refresh_token && !row?.googleCalendarRefreshToken) {
      return {
        ok: false,
        message:
          "Google did not return a refresh token. Revoke BacksterOS access in Google Account → Security → Third-party access, then Connect again.",
      };
    }
    const refreshToken =
      tokens.refresh_token?.trim() ||
      row?.googleCalendarRefreshToken?.trim() ||
      null;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    const client = new GoogleCalendarClient(tokens.access_token);
    const accountEmail = await client.getAccountEmail();

    await db
      .insert(workspaceIntegrationSecrets)
      .values({
        workspaceId: pending.workspaceId,
        googleCalendarRefreshToken: refreshToken,
        googleCalendarAccessToken: tokens.access_token,
        googleCalendarAccessTokenExpiresAt: expiresAt,
        googleCalendarAccountEmail: accountEmail,
      })
      .onConflictDoUpdate({
        target: workspaceIntegrationSecrets.workspaceId,
        set: {
          googleCalendarRefreshToken: refreshToken,
          googleCalendarAccessToken: tokens.access_token,
          googleCalendarAccessTokenExpiresAt: expiresAt,
          googleCalendarAccountEmail: accountEmail,
          updatedAt: new Date(),
        },
      });

    return {
      ok: true,
      message: accountEmail
        ? `Connected as ${accountEmail}. You can close this window.`
        : "Google Calendar connected. You can close this window.",
      workspaceId: pending.workspaceId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OAuth token exchange failed.";
    return { ok: false, message };
  }
}

async function persistAccessToken(
  workspaceId: string,
  accessToken: string,
  expiresAt: Date | null,
  accountEmail?: string | null,
): Promise<void> {
  await db
    .update(workspaceIntegrationSecrets)
    .set({
      googleCalendarAccessToken: accessToken,
      googleCalendarAccessTokenExpiresAt: expiresAt,
      ...(accountEmail !== undefined
        ? { googleCalendarAccountEmail: accountEmail }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
}

export async function getGoogleCalendarAccessToken(
  workspaceId: string,
): Promise<string> {
  const row = await getSecretRow(workspaceId);
  const clientId = resolveClientId(row);
  const clientSecret = resolveClientSecret(row);
  const refreshToken = row?.googleCalendarRefreshToken?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Calendar is not connected.");
  }

  const existing = row?.googleCalendarAccessToken?.trim();
  const expiresAt = row?.googleCalendarAccessTokenExpiresAt;
  if (
    existing &&
    expiresAt &&
    expiresAt.getTime() - ACCESS_TOKEN_SKEW_MS > Date.now()
  ) {
    return existing;
  }

  const tokens = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken,
  });
  const nextExpires = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  await persistAccessToken(workspaceId, tokens.access_token, nextExpires);
  return tokens.access_token;
}

export async function testGoogleCalendarConnection(
  workspaceId: string,
): Promise<GoogleCalendarTestConnectionResult> {
  try {
    const accessToken = await getGoogleCalendarAccessToken(workspaceId);
    const client = new GoogleCalendarClient(accessToken);
    const [calendars, accountEmail] = await Promise.all([
      client.listCalendars(),
      client.getAccountEmail(),
    ]);
    if (accountEmail) {
      await persistAccessToken(
        workspaceId,
        accessToken,
        (
          await getSecretRow(workspaceId)
        )?.googleCalendarAccessTokenExpiresAt ?? null,
        accountEmail,
      );
    }
    return {
      ok: true,
      error: null,
      accountEmail,
      calendarCount: calendars.length,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof GoogleCalendarApiError || error instanceof Error
          ? error.message
          : "Google Calendar connection test failed.",
      accountEmail: null,
      calendarCount: null,
    };
  }
}

export async function listGoogleCalendars(
  workspaceId: string,
): Promise<GoogleCalendarCalendarSummary[]> {
  const row = await getSecretRow(workspaceId);
  const selected = new Set(selectedCalendarIds(row));
  const accessToken = await getGoogleCalendarAccessToken(workspaceId);
  const client = new GoogleCalendarClient(accessToken);
  const calendars = await client.listCalendars();
  return calendars.map((entry) => {
    const id = entry.id;
    const isPrimary = Boolean(entry.primary);
    return {
      id,
      summary: entry.summary?.trim() || id,
      primary: isPrimary,
      selected: selected.size === 0 ? isPrimary : selected.has(id),
    };
  });
}

function mapEventTimes(event: GoogleCalendarEvent): {
  allDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
  startDate: string | null;
  endDate: string | null;
} {
  const startDate = event.start?.date?.trim() || null;
  const endDate = event.end?.date?.trim() || null;
  if (startDate) {
    return {
      allDay: true,
      startAt: new Date(`${startDate}T00:00:00.000Z`),
      endAt: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
      startDate,
      endDate,
    };
  }
  const startAt = event.start?.dateTime
    ? new Date(event.start.dateTime)
    : null;
  const endAt = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  return {
    allDay: false,
    startAt:
      startAt && !Number.isNaN(startAt.getTime()) ? startAt : null,
    endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
    startDate: null,
    endDate: null,
  };
}

export async function syncGoogleCalendar(
  workspaceId: string,
): Promise<GoogleCalendarSyncResult> {
  try {
    const row = await getSecretRow(workspaceId);
    const accessToken = await getGoogleCalendarAccessToken(workspaceId);
    const client = new GoogleCalendarClient(accessToken);
    const calendars = await client.listCalendars();
    const selected = selectedCalendarIds(row);
    const targets =
      selected.length > 0
        ? calendars.filter((cal) => selected.includes(cal.id))
        : calendars.filter((cal) => cal.primary);
    const effectiveTargets =
      targets.length > 0
        ? targets
        : calendars.slice(0, 1).filter((cal) => Boolean(cal.id));

    const now = Date.now();
    const timeMin = new Date(
      now - DEFAULT_SYNC_PAST_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const timeMax = new Date(
      now + DEFAULT_SYNC_FUTURE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    let upserted = 0;
    const seenIds = new Set<string>();

    for (const calendar of effectiveTargets) {
      const events = await client.listEvents({
        calendarId: calendar.id,
        timeMin,
        timeMax,
      });
      for (const event of events) {
        const externalId = event.id?.trim();
        if (!externalId) continue;
        if (event.status === "cancelled") continue;
        const times = mapEventTimes(event);
        if (!times.startAt && !times.startDate) continue;
        const id = externalCalendarEventId(
          workspaceId,
          GOOGLE_CALENDAR_PROVIDER,
          calendar.id,
          externalId,
        );
        seenIds.add(id);
        const title = event.summary?.trim() || "(No title)";
        await db
          .insert(externalCalendarEvents)
          .values({
            id,
            workspaceId,
            provider: GOOGLE_CALENDAR_PROVIDER,
            calendarId: calendar.id,
            externalId,
            icalUid: event.iCalUID?.trim() || null,
            title,
            description: event.description?.trim() || null,
            location: event.location?.trim() || null,
            status: event.status?.trim() || null,
            htmlLink: event.htmlLink?.trim() || null,
            startAt: times.startAt,
            endAt: times.endAt,
            allDay: times.allDay,
            startDate: times.startDate,
            endDate: times.endDate,
            etag: event.etag?.trim() || null,
            raw: event,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: externalCalendarEvents.id,
            set: {
              icalUid: event.iCalUID?.trim() || null,
              title,
              description: event.description?.trim() || null,
              location: event.location?.trim() || null,
              status: event.status?.trim() || null,
              htmlLink: event.htmlLink?.trim() || null,
              startAt: times.startAt,
              endAt: times.endAt,
              allDay: times.allDay,
              startDate: times.startDate,
              endDate: times.endDate,
              etag: event.etag?.trim() || null,
              raw: event,
              deletedAt: null,
              updatedAt: new Date(),
            },
          });
        // Google owns schedule for linked Backster note shells (ADR-037).
        await db
          .update(meetings)
          .set({
            title,
            location: event.location?.trim() || null,
            startAt: times.startAt,
            endAt: times.endAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(meetings.workspaceId, workspaceId),
              eq(meetings.externalCalendarEventId, id),
              isNull(meetings.deletedAt),
            ),
          );
        upserted += 1;
      }
    }

    // Soft-delete previously synced Google events in the window that vanished.
    const existing = await db
      .select({ id: externalCalendarEvents.id })
      .from(externalCalendarEvents)
      .where(
        and(
          eq(externalCalendarEvents.workspaceId, workspaceId),
          eq(externalCalendarEvents.provider, GOOGLE_CALENDAR_PROVIDER),
          isNull(externalCalendarEvents.deletedAt),
          or(
            and(
              gte(externalCalendarEvents.startAt, new Date(timeMin)),
              lte(externalCalendarEvents.startAt, new Date(timeMax)),
            ),
            and(
              isNull(externalCalendarEvents.startAt),
              gte(externalCalendarEvents.startDate, timeMin.slice(0, 10)),
              lte(externalCalendarEvents.startDate, timeMax.slice(0, 10)),
            ),
          ),
        ),
      );

    let removed = 0;
    const nowDate = new Date();
    for (const rowEvent of existing) {
      if (seenIds.has(rowEvent.id)) continue;
      await db
        .update(externalCalendarEvents)
        .set({ deletedAt: nowDate, updatedAt: nowDate })
        .where(eq(externalCalendarEvents.id, rowEvent.id));
      removed += 1;
    }

    const lastSyncedAt = new Date();
    await db
      .update(workspaceIntegrationSecrets)
      .set({
        googleCalendarLastSyncedAt: lastSyncedAt,
        updatedAt: lastSyncedAt,
      })
      .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));

    // Renew watches off the request path so Sync / refresh returns as soon as
    // events are written (watch round-trips otherwise delay the UI list).
    void ensureGoogleCalendarWatches(
      workspaceId,
      effectiveTargets.map((cal) => cal.id),
      client,
    ).catch((error) => {
      console.warn(
        "[google-calendar] watch ensure failed:",
        error instanceof Error ? error.message : error,
      );
    });

    return {
      ok: true,
      error: null,
      upserted,
      removed,
      calendarCount: effectiveTargets.length,
      lastSyncedAt: lastSyncedAt.toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Google Calendar sync failed.",
      upserted: 0,
      removed: 0,
      calendarCount: 0,
      lastSyncedAt: null,
    };
  }
}

async function persistWatchChannels(
  workspaceId: string,
  channels: GoogleCalendarWatchChannel[],
): Promise<void> {
  await db
    .update(workspaceIntegrationSecrets)
    .set({
      googleCalendarWatchChannels: channels,
      updatedAt: new Date(),
    })
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
}

export async function stopGoogleCalendarWatches(
  workspaceId: string,
  client?: GoogleCalendarClient,
): Promise<void> {
  const row = await getSecretRow(workspaceId);
  const channels = parseWatchChannels(row?.googleCalendarWatchChannels);
  if (channels.length === 0) return;

  let api = client;
  if (!api) {
    try {
      const accessToken = await getGoogleCalendarAccessToken(workspaceId);
      api = new GoogleCalendarClient(accessToken);
    } catch {
      await persistWatchChannels(workspaceId, []);
      return;
    }
  }

  for (const channel of channels) {
    try {
      await api.stopChannel({
        channelId: channel.channelId,
        resourceId: channel.resourceId,
      });
    } catch {
      // Best-effort stop.
    }
  }
  await persistWatchChannels(workspaceId, []);
}

export async function ensureGoogleCalendarWatches(
  workspaceId: string,
  calendarIds: string[],
  client?: GoogleCalendarClient,
): Promise<{ ok: boolean; error: string | null; channelCount: number }> {
  const webhookUrl = googleCalendarWebhookUrl();
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "Push needs a public HTTPS API URL (set GOOGLE_CALENDAR_WEBHOOK_BASE_URL).",
      channelCount: 0,
    };
  }

  const row = await getSecretRow(workspaceId);
  const existing = parseWatchChannels(row?.googleCalendarWatchChannels);
  let api = client;
  if (!api) {
    const accessToken = await getGoogleCalendarAccessToken(workspaceId);
    api = new GoogleCalendarClient(accessToken);
  }

  const wanted = new Set(calendarIds.filter(Boolean));
  const now = Date.now();
  const next: GoogleCalendarWatchChannel[] = [];
  const keptIds = new Set<string>();

  for (const channel of existing) {
    const exp = Date.parse(channel.expiration);
    const expired = Number.isFinite(exp) && exp <= now + WATCH_RENEW_WITHIN_MS;
    const stillWanted = wanted.has(channel.calendarId);
    if (!stillWanted || expired) {
      try {
        await api.stopChannel({
          channelId: channel.channelId,
          resourceId: channel.resourceId,
        });
      } catch {
        // ignore
      }
      continue;
    }
    next.push(channel);
    keptIds.add(channel.calendarId);
  }

  for (const calendarId of wanted) {
    if (keptIds.has(calendarId)) continue;
    const channelId = newId();
    const token = randomBytes(24).toString("base64url");
    try {
      const created = await api.watchEvents({
        calendarId,
        channelId,
        address: webhookUrl,
        token,
        expirationMs: now + WATCH_TTL_MS,
      });
      if (!created.resourceId) {
        throw new Error("Google watch response missing resourceId");
      }
      const expiration =
        created.expiration && /^\d+$/.test(created.expiration)
          ? new Date(Number(created.expiration)).toISOString()
          : created.expiration ||
            new Date(now + WATCH_TTL_MS).toISOString();
      next.push({
        calendarId,
        channelId: created.channelId,
        resourceId: created.resourceId,
        expiration,
        token,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create watch channel";
      await persistWatchChannels(workspaceId, next);
      return { ok: false, error: message, channelCount: next.length };
    }
  }

  await persistWatchChannels(workspaceId, next);
  return { ok: true, error: null, channelCount: next.length };
}

/**
 * Google Calendar push webhook. Ack fast; sync in the background.
 * Headers: X-Goog-Channel-ID, X-Goog-Channel-Token, X-Goog-Resource-State.
 */
export async function handleGoogleCalendarWebhook(input: {
  channelId: string | null;
  channelToken: string | null;
  resourceState: string | null;
}): Promise<{ ok: boolean; status: 200 | 401 | 404 }> {
  const channelId = input.channelId?.trim();
  const channelToken = input.channelToken?.trim();
  if (!channelId || !channelToken) {
    return { ok: false, status: 401 };
  }

  // Google may deliver the initial sync before our watch response is persisted.
  if (input.resourceState === "sync") {
    return { ok: true, status: 200 };
  }

  const rows = await db
    .select({
      workspaceId: workspaceIntegrationSecrets.workspaceId,
      googleCalendarWatchChannels:
        workspaceIntegrationSecrets.googleCalendarWatchChannels,
    })
    .from(workspaceIntegrationSecrets);

  let workspaceId: string | null = null;
  for (const row of rows) {
    const channels = parseWatchChannels(row.googleCalendarWatchChannels);
    const match = channels.find(
      (channel) =>
        channel.channelId === channelId && channel.token === channelToken,
    );
    if (match) {
      workspaceId = row.workspaceId;
      break;
    }
  }

  if (!workspaceId) {
    return { ok: false, status: 404 };
  }

  const targetWorkspaceId = workspaceId;
  void syncGoogleCalendar(targetWorkspaceId).catch((error) => {
    console.warn(
      "[google-calendar] webhook sync failed:",
      error instanceof Error ? error.message : error,
    );
  });

  return { ok: true, status: 200 };
}

function toExternalEvent(
  row: typeof externalCalendarEvents.$inferSelect,
  linkedMeetingId: string | null = null,
): ExternalCalendarEvent {
  return {
    id: row.id,
    provider: row.provider,
    calendarId: row.calendarId,
    externalId: row.externalId,
    title: row.title,
    description: row.description,
    location: row.location,
    status: row.status,
    htmlLink: row.htmlLink,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    allDay: row.allDay,
    startDate: row.startDate,
    endDate: row.endDate,
    updatedAt: row.updatedAt.toISOString(),
    linkedMeetingId,
  };
}

export async function listExternalCalendarEvents(
  workspaceId: string,
  query: ListExternalCalendarEventsQuery = {},
): Promise<ExternalCalendarEvent[]> {
  const filters = [
    eq(externalCalendarEvents.workspaceId, workspaceId),
    isNull(externalCalendarEvents.deletedAt),
  ];
  if (query.provider?.trim()) {
    filters.push(eq(externalCalendarEvents.provider, query.provider.trim()));
  }
  if (query.from) {
    const from = new Date(query.from);
    filters.push(
      or(
        gte(externalCalendarEvents.startAt, from),
        and(
          isNull(externalCalendarEvents.startAt),
          gte(externalCalendarEvents.startDate, query.from.slice(0, 10)),
        ),
      )!,
    );
  }
  if (query.to) {
    const to = new Date(query.to);
    filters.push(
      or(
        lte(externalCalendarEvents.startAt, to),
        and(
          isNull(externalCalendarEvents.startAt),
          lte(externalCalendarEvents.startDate, query.to.slice(0, 10)),
        ),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(externalCalendarEvents)
    .where(and(...filters))
    .orderBy(
      sql`coalesce(${externalCalendarEvents.startAt}, (${externalCalendarEvents.startDate} || 'T00:00:00Z')::timestamptz) asc`,
    );

  const linkedByEventId = new Map<string, string>();
  if (rows.length > 0) {
    const links = await db
      .select({
        meetingId: meetings.id,
        externalCalendarEventId: meetings.externalCalendarEventId,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          isNull(meetings.deletedAt),
          inArray(
            meetings.externalCalendarEventId,
            rows.map((row) => row.id),
          ),
        ),
      );
    for (const link of links) {
      if (link.externalCalendarEventId) {
        linkedByEventId.set(link.externalCalendarEventId, link.meetingId);
      }
    }
  }

  return rows.map((row) =>
    toExternalEvent(row, linkedByEventId.get(row.id) ?? null),
  );
}

type LinkedMeetingSchedule = {
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  location: string | null;
  externalCalendarEventId: string | null;
};

/**
 * Mirror linked meeting title/schedule into `external_calendar_events` immediately
 * so clients do not wait on the Google API round-trip.
 */
export async function mirrorLinkedMeetingScheduleLocally(
  workspaceId: string,
  meeting: LinkedMeetingSchedule,
): Promise<typeof externalCalendarEvents.$inferSelect | null> {
  const linkId = meeting.externalCalendarEventId?.trim();
  if (!linkId || !meeting.startAt) return null;

  const [external] = await db
    .select()
    .from(externalCalendarEvents)
    .where(
      and(
        eq(externalCalendarEvents.id, linkId),
        eq(externalCalendarEvents.workspaceId, workspaceId),
        isNull(externalCalendarEvents.deletedAt),
      ),
    )
    .limit(1);
  if (!external) return null;

  const endAt =
    meeting.endAt && !Number.isNaN(meeting.endAt.getTime())
      ? meeting.endAt
      : new Date(meeting.startAt.getTime() + 60 * 60 * 1000);

  let startAt = meeting.startAt;
  let endAtValue: Date | null = endAt;
  let allDay = external.allDay;
  let startDate = external.startDate;
  let endDate = external.endDate;
  if (external.allDay) {
    startDate = meeting.startAt.toISOString().slice(0, 10);
    endDate = endAt.toISOString().slice(0, 10);
    if (endDate <= startDate) {
      const next = new Date(`${startDate}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      endDate = next.toISOString().slice(0, 10);
    }
    startAt = meeting.startAt;
    endAtValue = endAt;
    allDay = true;
  } else {
    startDate = null;
    endDate = null;
    allDay = false;
  }

  const [updated] = await db
    .update(externalCalendarEvents)
    .set({
      title: meeting.title,
      location: meeting.location,
      startAt,
      endAt: endAtValue,
      allDay,
      startDate,
      endDate,
      updatedAt: new Date(),
    })
    .where(eq(externalCalendarEvents.id, external.id))
    .returning();
  return updated ?? null;
}

/**
 * Push title / start / end / location from a linked Backster meeting to Google.
 * Prefer {@link mirrorLinkedMeetingScheduleLocally} first so the UI stays snappy;
 * this call updates etag/raw after Google accepts.
 */
export async function pushLinkedMeetingScheduleToGoogle(
  workspaceId: string,
  meeting: LinkedMeetingSchedule,
): Promise<void> {
  const linkId = meeting.externalCalendarEventId?.trim();
  if (!linkId || !meeting.startAt) return;

  const [external] = await db
    .select()
    .from(externalCalendarEvents)
    .where(
      and(
        eq(externalCalendarEvents.id, linkId),
        eq(externalCalendarEvents.workspaceId, workspaceId),
        isNull(externalCalendarEvents.deletedAt),
      ),
    )
    .limit(1);
  if (!external?.externalId?.trim() || !external.calendarId?.trim()) return;

  const endAt =
    meeting.endAt && !Number.isNaN(meeting.endAt.getTime())
      ? meeting.endAt
      : new Date(meeting.startAt.getTime() + 60 * 60 * 1000);

  let start: { date?: string; dateTime?: string };
  let end: { date?: string; dateTime?: string };
  if (external.allDay) {
    const startDate = meeting.startAt.toISOString().slice(0, 10);
    let endDate = endAt.toISOString().slice(0, 10);
    // Google all-day end is exclusive.
    if (endDate <= startDate) {
      const next = new Date(`${startDate}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      endDate = next.toISOString().slice(0, 10);
    }
    start = { date: startDate };
    end = { date: endDate };
  } else {
    start = { dateTime: meeting.startAt.toISOString() };
    end = { dateTime: endAt.toISOString() };
  }

  const accessToken = await getGoogleCalendarAccessToken(workspaceId);
  const client = new GoogleCalendarClient(accessToken);
  const patched = await client.patchEvent({
    calendarId: external.calendarId,
    eventId: external.externalId,
    summary: meeting.title,
    location: meeting.location,
    start,
    end,
  });

  const times = mapEventTimes(patched);
  await db
    .update(externalCalendarEvents)
    .set({
      title: meeting.title,
      location: meeting.location,
      startAt: times.startAt ?? meeting.startAt,
      endAt: times.endAt ?? endAt,
      allDay: times.allDay,
      startDate: times.startDate,
      endDate: times.endDate,
      etag: patched.etag?.trim() || null,
      htmlLink: patched.htmlLink?.trim() || external.htmlLink,
      raw: patched,
      updatedAt: new Date(),
    })
    .where(eq(externalCalendarEvents.id, external.id));
}

/** Test helper — clear in-memory OAuth state. */
export function clearGoogleCalendarOAuthPendingForTests(): void {
  oauthPendingByState.clear();
}

export function previewGoogleCalendarSecret(value: string): string {
  return previewCursorApiKey(value);
}
