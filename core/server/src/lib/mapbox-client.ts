/**
 * Thin Mapbox REST client (Geocoding + Static Images).
 * Access token stays on the server; never expose to PowerSync.
 * @see https://docs.mapbox.com/api/search/geocoding/
 * @see https://docs.mapbox.com/api/maps/static-images/
 */

const MAPBOX_API_BASE = "https://api.mapbox.com";
const DEFAULT_STATIC_STYLE = "mapbox/dark-v11";

export class MapboxApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message?: string,
  ) {
    super(message ?? `Mapbox API error (${status})`);
    this.name = "MapboxApiError";
  }
}

export type MapboxGeocodeResult = {
  latitude: number;
  longitude: number;
  formatted: string;
  relevance: number | null;
  placeName: string | null;
};

export type MapboxClientOptions = {
  accessToken: string;
};

export class MapboxClient {
  private readonly accessToken: string;

  constructor(options: MapboxClientOptions) {
    this.accessToken = options.accessToken.trim();
  }

  /** Forward-geocode a free-text query; returns the top result or null. */
  async geocodeForward(
    query: string,
    options?: { limit?: number; country?: string },
  ): Promise<MapboxGeocodeResult | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const limit = Math.min(Math.max(options?.limit ?? 1, 1), 5);
    const params = new URLSearchParams({
      access_token: this.accessToken,
      limit: String(limit),
      autocomplete: "false",
    });
    if (options?.country?.trim()) {
      // ISO 3166-1 alpha-2; Mapbox accepts comma-separated list.
      params.set("country", options.country.trim().toLowerCase());
    }

    const encoded = encodeURIComponent(trimmed);
    const url = `${MAPBOX_API_BASE}/geocoding/v5/mapbox.places/${encoded}.json?${params}`;
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) {
      throw new MapboxApiError(
        response.status,
        text,
        response.status === 401
          ? "Mapbox rejected the access token (unauthorized)."
          : `Mapbox geocode failed (${response.status})`,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new MapboxApiError(response.status, text, "Invalid Mapbox JSON");
    }

    const features =
      payload != null &&
      typeof payload === "object" &&
      Array.isArray((payload as { features?: unknown }).features)
        ? ((payload as { features: unknown[] }).features)
        : [];
    const first = features[0];
    if (first == null || typeof first !== "object") return null;

    const feature = first as {
      center?: unknown;
      place_name?: unknown;
      relevance?: unknown;
      text?: unknown;
    };
    const center = Array.isArray(feature.center) ? feature.center : null;
    const lng = typeof center?.[0] === "number" ? center[0] : Number(center?.[0]);
    const lat = typeof center?.[1] === "number" ? center[1] : Number(center?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const placeName =
      typeof feature.place_name === "string" && feature.place_name.trim()
        ? feature.place_name.trim()
        : typeof feature.text === "string" && feature.text.trim()
          ? feature.text.trim()
          : null;

    return {
      latitude: lat,
      longitude: lng,
      formatted: placeName ?? trimmed,
      relevance:
        typeof feature.relevance === "number" && Number.isFinite(feature.relevance)
          ? feature.relevance
          : null,
      placeName,
    };
  }

  /**
   * Fetch a static map PNG centered on lon/lat with a pin.
   * Uses Mapbox dark style to match desktop chrome.
   */
  async fetchStaticMapPng(options: {
    latitude: number;
    longitude: number;
    zoom?: number;
    width?: number;
    height?: number;
    retina?: boolean;
  }): Promise<ArrayBuffer> {
    const lat = options.latitude;
    const lng = options.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new MapboxApiError(400, "", "latitude and longitude are required");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new MapboxApiError(400, "", "latitude/longitude out of range");
    }

    const zoom = Math.min(Math.max(options.zoom ?? 14, 0), 22);
    const width = Math.min(Math.max(options.width ?? 600, 1), 1280);
    const height = Math.min(Math.max(options.height ?? 320, 1), 1280);
    const retina = options.retina !== false ? "@2x" : "";
    const lonLat = `${lng},${lat}`;
    // Blue pin matching accent-ish UI; overlay before camera.
    const overlay = `pin-s+3b82f6(${lonLat})`;
    const path = `/styles/v1/${DEFAULT_STATIC_STYLE}/static/${overlay}/${lonLat},${zoom},0/${width}x${height}${retina}`;
    const params = new URLSearchParams({ access_token: this.accessToken });
    const url = `${MAPBOX_API_BASE}${path}?${params}`;

    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new MapboxApiError(
        response.status,
        text,
        response.status === 401
          ? "Mapbox rejected the access token (unauthorized)."
          : `Mapbox static map failed (${response.status})`,
      );
    }
    return response.arrayBuffer();
  }

  /** Light call used by Settings → Test connection. */
  async testToken(): Promise<void> {
    const result = await this.geocodeForward("Amsterdam", { limit: 1 });
    if (!result) {
      throw new MapboxApiError(
        502,
        "",
        "Mapbox token accepted but geocode returned no results.",
      );
    }
  }
}
