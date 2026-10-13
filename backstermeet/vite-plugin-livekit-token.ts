import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { AccessToken } from "livekit-server-sdk";

type LiveKitConfig = {
  /** WebSocket URL the Director client should connect to (shared SFU with portal guests). */
  url: string;
  apiKey: string;
  apiSecret: string;
  room: string;
};

function parseDotenv(contents: string): Record<string, string> {
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
function resolveClientUrl(file: Record<string, string>): string {
  const configured = (
    process.env.LIVEKIT_CLIENT_URL ??
    file.LIVEKIT_CLIENT_URL ??
    process.env.LIVEKIT_URL ??
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
    // Shared production / remote SFU — never hairpin to loopback.
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
    // Local-only spike: Director and SFU on the same machine.
    const port = parsed.port || "7880";
    return `ws://127.0.0.1:${port}`;
  } catch {
    return configured;
  }
}

function loadLiveKitConfig(): LiveKitConfig {
  const path = join(homedir(), ".config/secrets/livekit.env");
  const file = existsSync(path) ? parseDotenv(readFileSync(path, "utf8")) : {};
  const url = resolveClientUrl(file);
  const apiKey = (process.env.LIVEKIT_API_KEY ?? file.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (
    process.env.LIVEKIT_API_SECRET ??
    file.LIVEKIT_API_SECRET ??
    ""
  ).trim();
  const room = (
    process.env.LIVEKIT_ROOM ??
    file.LIVEKIT_ROOM ??
    "backstermeet-dev"
  ).trim();
  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit secrets missing (~/.config/secrets/livekit.env)");
  }
  return { url, apiKey, apiSecret, room };
}

function resolveHostRoom(configuredRoom: string, meetingId: string | null): string {
  const meeting = meetingId?.trim();
  return meeting || configuredRoom;
}

/** Dev-only host token endpoint (packaged Tauri uses the Rust command). */
export function livekitHostTokenPlugin(): Plugin {
  return {
    name: "livekit-host-token",
    configureServer(server) {
      server.middlewares.use("/api/livekit-host-token", async (req, res) => {
        try {
          const config = loadLiveKitConfig();
          const url = new URL(req.url ?? "", "http://127.0.0.1");
          const meetingId = url.searchParams.get("meetingId")?.trim() || null;
          const room = resolveHostRoom(config.room, meetingId);
          const token = new AccessToken(config.apiKey, config.apiSecret, {
            identity: "host-director",
            name: "BacksterMeet host",
            ttl: "6h",
          });
          token.addGrant({
            roomJoin: true,
            room,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            canUpdateOwnMetadata: true,
          });
          const jwt = await token.toJwt();
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              token: jwt,
              url: config.url,
              room,
              meetingId,
            }),
          );
        } catch (error) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : "LiveKit unavailable",
            }),
          );
        }
      });
    },
  };
}
