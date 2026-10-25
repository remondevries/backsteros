import type {
  MapboxGeocodeResult,
  MapboxSettings,
  MapboxTestConnectionResult,
} from "@backsteros/contracts";

import { MapboxApiError, MapboxClient } from "../lib/mapbox-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import { createIntegrationSecretSettingsService } from "./integration-secret-settings.js";
import { workspaceIntegrationSecretStore } from "./integration-secret-store.js";

export function previewMapboxAccessToken(token: string): string {
  return previewCursorApiKey(token);
}

const mapboxSettings = createIntegrationSecretSettingsService({
  store: workspaceIntegrationSecretStore("mapboxAccessToken"),
  patchKey: "accessToken",
  preview: previewMapboxAccessToken,
  toSettings: (state): MapboxSettings => ({
    accessTokenConfigured: state.configured,
    accessTokenPreview: state.preview,
    connected: state.connected,
  }),
  test: testMapboxAccessToken,
});

export const getMapboxAccessToken = mapboxSettings.getWorkspaceSecret;

export const getMapboxSettings = mapboxSettings.getSettings;

export const updateMapboxSettings = mapboxSettings.updateSettings;

export const testMapboxConnection = mapboxSettings.testConnection;

async function testMapboxAccessToken(
  accessToken: string | null,
): Promise<MapboxTestConnectionResult> {
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
