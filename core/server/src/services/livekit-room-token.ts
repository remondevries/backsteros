/**
 * Mint LiveKit join tokens for BacksterOS meetings.
 * Credentials: env → `~/.config/secrets/livekit.env` (never exposed to clients).
 * Room name is always the meeting id so host + portal guests share one room.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SignJWT } from "jose";

import { isAgentPersonaAuth } from "../lib/bunq-payment-proposal-auth.js";
import { hasScope } from "../lib/crypto.js";
import type { AuthContext } from "../middleware/auth.js";

export type LiveKitRoomConfig = {
  /** WebSocket URL the client should connect to (shared SFU with portal guests). */
  url: string;
  apiKey: string;
  apiSecret: string;
};

export type MintMeetingRoomTokenInput = {
  meetingId: string;
  role?: "host" | "guest";
  displayName?: string;
  /**
   * Stable participant key for reconnects (user id, contact id, etc.).
   * When omitted, a random suffix is used so concurrent joins do not collide.
   */
  participantKey?: string | null;
};

export type MintMeetingRoomTokenResult = {
  token: string;
  url: string;
  room: string;
  meetingId: string;
  identity: string;
  provider: "livekit";
};

export function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Prefer LIVEKIT_CLIENT_URL (portal WSS) so host + guests share one SFU.
 * Fall back to LIVEKIT_URL. Loopback rewrite only for a purely local SFU spike.
 */
export function resolveLiveKitClientUrl(
  file: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = (
    env.LIVEKIT_CLIENT_URL ??
    file.LIVEKIT_CLIENT_URL ??
    env.LIVEKIT_URL ??
    file.LIVEKIT_URL ??
    ""
  ).trim();
  if (!configured) return "";

  try {
    const normalized = configured
      .replace(/^wss:/i, "https:")
      .replace(/^ws:/i, "http:");
    const parsed = new URL(normalized);
    const host = parsed.hostname;
    const isPortalProxy =
      host === "client.lemo-design.com" ||
      host === "client.lemo-design.nl" ||
      parsed.pathname.includes("/livekit");
    if (isPortalProxy || host.endsWith(".lemo-design.com")) {
      return configured;
    }
    const localish =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("100.") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.endsWith(".ts.net");
    if (!localish) return configured;
    const port = parsed.port || "7880";
    return `ws://127.0.0.1:${port}`;
  } catch {
    return configured;
  }
}

export function loadLiveKitRoomConfig(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): LiveKitRoomConfig {
  const path = join(home, ".config/secrets/livekit.env");
  const file = existsSync(path)
    ? parseDotenv(readFileSync(path, "utf8"))
    : {};
  const url = resolveLiveKitClientUrl(file, env);
  const apiKey = (env.LIVEKIT_API_KEY ?? file.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (
    env.LIVEKIT_API_SECRET ??
    file.LIVEKIT_API_SECRET ??
    ""
  ).trim();
  if (!url || !apiKey || !apiSecret) {
    throw new LiveKitNotConfiguredError();
  }
  return { url, apiKey, apiSecret };
}

export class LiveKitNotConfiguredError extends Error {
  readonly code = "livekit_not_configured";

  constructor(
    message = "LiveKit is not configured (set LIVEKIT_* or ~/.config/secrets/livekit.env)",
  ) {
    super(message);
    this.name = "LiveKitNotConfiguredError";
  }
}

/** Room name for a meeting is always the meeting id. */
export function meetingLiveKitRoomName(meetingId: string): string {
  const trimmed = meetingId.trim();
  if (!trimmed) {
    throw new Error("meetingId is required for LiveKit room name");
  }
  return trimmed;
}

/**
 * Host Director tokens: workspace owner session (local-shell) or owner-grade
 * Access API key (`settings:write` + `tasks:write`). Agent persona keys never
 * qualify — they are sanitized without settings:write.
 */
export function canMintMeetingHostRoomToken(
  auth: AuthContext | null | undefined,
): boolean {
  if (!auth?.workspaceId) return false;
  if (isAgentPersonaAuth(auth)) return false;
  if (auth.kind === "local_shell") {
    return Boolean(auth.userId || auth.clerkUserId);
  }
  if (auth.kind === "api_key") {
    return (
      Boolean(auth.userId) &&
      hasScope(auth.scopes, "settings:write") &&
      hasScope(auth.scopes, "tasks:write")
    );
  }
  return false;
}

function sanitizeParticipantKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function randomParticipantSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

/**
 * LiveKit identity must be unique per concurrent participant. Fixed strings
 * like `host-director` cause the SFU to kick the previous join.
 */
export function buildMeetingRoomParticipantIdentity(input: {
  role: "host" | "guest";
  participantKey?: string | null;
  randomSuffix?: () => string;
}): string {
  const fromKey = input.participantKey?.trim()
    ? sanitizeParticipantKey(input.participantKey.trim())
    : "";
  const suffix =
    fromKey ||
    (input.randomSuffix ? input.randomSuffix() : randomParticipantSuffix());
  const safe = suffix || "anon";
  return `${input.role}-${safe}`;
}

export async function mintMeetingLiveKitToken(
  input: MintMeetingRoomTokenInput,
  config: LiveKitRoomConfig = loadLiveKitRoomConfig(),
): Promise<MintMeetingRoomTokenResult> {
  const meetingId = input.meetingId.trim();
  if (!meetingId) {
    throw new Error("meetingId is required");
  }
  const room = meetingLiveKitRoomName(meetingId);
  const role = input.role === "guest" ? "guest" : "host";
  const identity = buildMeetingRoomParticipantIdentity({
    role,
    participantKey: input.participantKey,
  });
  const name =
    input.displayName?.trim() ||
    (role === "host" ? "BacksterOS host" : "Guest");

  const secret = new TextEncoder().encode(config.apiSecret);
  const token = await new SignJWT({
    name,
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.apiKey)
    .setSubject(identity)
    .setNotBefore(0)
    .setExpirationTime("6h")
    .sign(secret);

  return {
    token,
    url: config.url,
    room,
    meetingId,
    identity,
    provider: "livekit",
  };
}
