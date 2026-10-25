import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MapboxGeocodeResult,
  MapboxSettings,
} from "@backsteros/contracts";
import {
  coordinatesKey,
  formatContactAddressLine,
  resolveCountryOption,
  sameCoordinates,
  type ContactLocationParts,
} from "@backsteros/ui";

import { useDesktopApi } from "../api-context";

export type EntityCoordinatesPatch = {
  latitude: number | null;
  longitude: number | null;
};

const MAPBOX_MISSING_HINT =
  "Add a Mapbox token in Settings → Mapbox to show this on a map.";

function revokeObjectUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

/**
 * Static map tile + address geocoding for a contact / organization card.
 * Tiles are cached per coordinate pair; geocodes are deduped per address.
 */
export function useMapboxEntityLocation({
  active,
  entityId,
  address,
  latitude,
  longitude,
  readCoordinates,
  patchCoordinates,
  autoGeocodeMissingCoordinates = false,
}: {
  /** Keep-alive active; settings are fetched only while active. */
  active: boolean;
  /** Entity shown on the card — resets geocode state when it changes. */
  entityId: string | null;
  address: ContactLocationParts | null;
  latitude: number | null;
  longitude: number | null;
  /** Latest stored coordinates for an entity (skips no-op patches). */
  readCoordinates: (
    entityId: string,
  ) => { latitude?: unknown; longitude?: unknown } | null | undefined;
  patchCoordinates: (
    entityId: string,
    coordinates: EntityCoordinatesPatch,
    reason: { addressCleared: boolean },
  ) => Promise<unknown>;
  /** Geocode once when an address exists but coordinates were never written. */
  autoGeocodeMissingCoordinates?: boolean;
}) {
  const { client } = useDesktopApi();
  /** `null` while the Mapbox settings request is in flight. */
  const [mapboxConfigured, setMapboxConfigured] = useState<boolean | null>(
    null,
  );
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const geocodeAttemptKeyRef = useRef<string | null>(null);
  const mapCoordsKeyRef = useRef<string | null>(null);
  const mapImageSrcRef = useRef<string | null>(null);
  const readCoordinatesRef = useRef(readCoordinates);
  readCoordinatesRef.current = readCoordinates;
  const patchCoordinatesRef = useRef(patchCoordinates);
  patchCoordinatesRef.current = patchCoordinates;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<MapboxSettings>(
          "/api/v1/settings/mapbox",
        );
        if (!cancelled) setMapboxConfigured(body.accessTokenConfigured);
      } catch {
        if (!cancelled) setMapboxConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, client]);

  useEffect(() => {
    setGeocodeFailed(false);
    geocodeAttemptKeyRef.current = null;
    mapCoordsKeyRef.current = null;
    mapImageSrcRef.current = null;
  }, [entityId]);

  useEffect(() => {
    let cancelled = false;

    const clearTile = () => {
      mapCoordsKeyRef.current = null;
      mapImageSrcRef.current = null;
      setMapImageSrc((current) => {
        revokeObjectUrl(current);
        return null;
      });
    };

    if (latitude == null || longitude == null) {
      clearTile();
      setMapLoading(false);
      return;
    }
    // Settings still loading — keep any existing tile; don't flash empty.
    if (mapboxConfigured == null) return;
    if (!mapboxConfigured) {
      clearTile();
      setMapLoading(false);
      return;
    }

    const coordsKey = coordinatesKey(latitude, longitude);
    if (mapCoordsKeyRef.current === coordsKey && mapImageSrcRef.current) {
      return;
    }

    setMapLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          lat: String(latitude),
          lng: String(longitude),
          width: "640",
          height: "320",
        });
        const blob = await client.requestBinary(
          `/api/v1/mapbox/static-map?${params}`,
        );
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        mapCoordsKeyRef.current = coordsKey;
        mapImageSrcRef.current = objectUrl;
        setMapImageSrc((current) => {
          revokeObjectUrl(current);
          return objectUrl;
        });
        setMapHint(null);
      } catch {
        if (cancelled) return;
        clearTile();
        setMapHint("Couldn’t load the map image.");
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, latitude, longitude, mapboxConfigured]);

  useEffect(
    () => () => {
      revokeObjectUrl(mapImageSrcRef.current);
    },
    [],
  );

  const addressLine = address ? formatContactAddressLine(address) : "";

  useEffect(() => {
    if (mapImageSrc) {
      setMapHint(null);
      return;
    }
    if (latitude != null && longitude != null) {
      // Coordinates present — the tile effect owns load / error hints.
      if (mapboxConfigured === false) setMapHint(MAPBOX_MISSING_HINT);
      return;
    }
    if (!addressLine || mapboxConfigured == null) {
      setMapHint(null);
      return;
    }
    if (!mapboxConfigured) {
      setMapHint(MAPBOX_MISSING_HINT);
      return;
    }
    if (geocodeFailed) {
      setMapHint("Couldn’t locate this address.");
      return;
    }
    setMapHint(autoGeocodeMissingCoordinates ? "Locating address…" : null);
  }, [
    addressLine,
    autoGeocodeMissingCoordinates,
    geocodeFailed,
    latitude,
    longitude,
    mapImageSrc,
    mapboxConfigured,
  ]);

  const resolveLocation = useCallback(
    async (
      targetId: string,
      parts: ContactLocationParts,
      options?: { force?: boolean },
    ) => {
      const line = formatContactAddressLine(parts);
      if (!line) {
        setGeocodeFailed(false);
        geocodeAttemptKeyRef.current = null;
        await patchCoordinatesRef.current(
          targetId,
          { latitude: null, longitude: null },
          { addressCleared: true },
        );
        return;
      }
      if (!mapboxConfigured) {
        setGeocodeFailed(false);
        return;
      }
      const attemptKey = `${targetId}:${line}:${parts.country ?? ""}`;
      if (!options?.force && geocodeAttemptKeyRef.current === attemptKey) {
        return;
      }
      geocodeAttemptKeyRef.current = attemptKey;
      try {
        const params = new URLSearchParams({ q: line });
        const countryCode = resolveCountryOption(parts.country)?.code;
        if (countryCode) params.set("country", countryCode);
        const body = await client.requestJson<{
          result: MapboxGeocodeResult | null;
        }>(`/api/v1/mapbox/geocode?${params}`);
        if (!body.result) {
          setGeocodeFailed(true);
          await patchCoordinatesRef.current(
            targetId,
            { latitude: null, longitude: null },
            { addressCleared: false },
          );
          return;
        }
        setGeocodeFailed(false);
        const next = {
          latitude: body.result.latitude,
          longitude: body.result.longitude,
        };
        if (sameCoordinates(readCoordinatesRef.current(targetId), next)) return;
        await patchCoordinatesRef.current(targetId, next, {
          addressCleared: false,
        });
      } catch {
        setGeocodeFailed(true);
        geocodeAttemptKeyRef.current = null;
      }
    },
    [client, mapboxConfigured],
  );

  const addressRef = useRef(address);
  addressRef.current = address;
  useEffect(() => {
    if (!autoGeocodeMissingCoordinates || !active || !entityId) return;
    if (!mapboxConfigured || !addressLine) return;
    if (latitude != null && longitude != null) return;
    const parts = addressRef.current;
    if (parts) void resolveLocation(entityId, parts);
  }, [
    active,
    addressLine,
    autoGeocodeMissingCoordinates,
    entityId,
    latitude,
    longitude,
    mapboxConfigured,
    resolveLocation,
  ]);

  return {
    mapboxConfigured,
    mapImageSrc,
    mapLoading,
    mapHint,
    resolveLocation,
  };
}
