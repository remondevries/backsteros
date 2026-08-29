import { eq } from "drizzle-orm";

import type {
  MapboxGeocodeResult,
  MapboxSettings,
  MapboxTestConnectionResult,
  UpdateMapboxSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import { MapboxApiError, MapboxClient } from "../lib/mapbox-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";

export function previewMapboxAccessToken(token: string): string {
  return previewCursorApiKey(token);
}

async function getSecretRow(
  workspaceId: string,
): Promise<{ mapboxAccessToken: string | null } | null> {
  const [row] = await db
    .select({
      mapboxAccessToken: workspaceIntegrationSecrets.mapboxAccessToken,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getMapboxAccessToken(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const token = row?.mapboxAccessToken?.trim();
  return token || null;
}

export async function getMapboxSettings(
  workspaceId: string,
): Promise<MapboxSettings> {
  const accessToken = await getMapboxAccessToken(workspaceId);
  return {
    accessTokenConfigured: Boolean(accessToken),
    accessTokenPreview: accessToken
      ? previewMapboxAccessToken(accessToken)
      : null,
    connected: Boolean(accessToken),
  };
}

export async function updateMapboxSettings(
  workspaceId: string,
  patch: UpdateMapboxSettingsInput,
): Promise<MapboxSettings> {
  const current = await getMapboxAccessToken(workspaceId);
  let nextToken = current;

  if (patch.accessToken !== undefined) {
    const trimmed = patch.accessToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      mapboxAccessToken: nextToken,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        mapboxAccessToken: nextToken,
        updatedAt: new Date(),
      },
    });

  return getMapboxSettings(workspaceId);
}

export async function testMapboxConnection(
  workspaceId: string,
): Promise<MapboxTestConnectionResult> {
  const accessToken = await getMapboxAccessToken(workspaceId);
  if (!accessToken) {
    return {
      ok: false,
      error: "Mapbox access token is not configured.",
    };
  }

  try {
    await new MapboxClient({ accessToken }).testToken();
    return { ok: true, error: null };
  } catch (error) {
    const message =
      error instanceof MapboxApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Mapbox connection test failed.";
    return { ok: false, error: message };
  }
}

function requireMapboxClient(workspaceId: string): Promise<MapboxClient> {
  return getMapboxAccessToken(workspaceId).then((accessToken) => {
    if (!accessToken) {
      throw new MapboxApiError(
        400,
        "",
        "Mapbox access token is not configured",
      );
    }
    return new MapboxClient({ accessToken });
  });
}

export async function geocodeQuery(
  workspaceId: string,
  query: string,
  options?: { country?: string },
): Promise<MapboxGeocodeResult | null> {
  const client = await requireMapboxClient(workspaceId);
  const result = await client.geocodeForward(query, {
    country: options?.country,
  });
  if (!result) return null;
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    formatted: result.formatted,
    relevance: result.relevance,
    placeName: result.placeName,
  };
}

export async function fetchStaticMapPng(
  workspaceId: string,
  options: {
    latitude: number;
    longitude: number;
    zoom?: number;
    width?: number;
    height?: number;
  },
): Promise<ArrayBuffer> {
  const client = await requireMapboxClient(workspaceId);
  return client.fetchStaticMapPng(options);
}
