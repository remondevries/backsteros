import type { MapboxSettings } from "@backsteros/contracts";

import {
  IntegrationSecretSettingsPanel,
  type IntegrationSecretSettingsConfig,
  type IntegrationSettingsTabProps,
} from "./settings/integration-secret-settings-panel";

const MAPBOX_SETTINGS: IntegrationSecretSettingsConfig<
  MapboxSettings,
  "accessToken"
> = {
  basePath: "/api/v1/settings/mapbox",
  label: "Mapbox",
  patchKey: "accessToken",
  configured: (settings) => settings.accessTokenConfigured,
  preview: (settings) => settings.accessTokenPreview,
  heading: "Access token",
  intro: (
    <>
      Create a{" "}
      <a
        href="https://account.mapbox.com/access-tokens/"
        target="_blank"
        rel="noreferrer"
      >
        Mapbox access token
      </a>{" "}
      (public <code>pk.</code> with URL restrictions, or secret{" "}
      <code>sk.</code>) with Geocoding and Static Images access so contact
      addresses can geocode and maps can render. Prefer scoping/restricting the
      token in the Mapbox account dashboard. Stored in core (not via PowerSync).
    </>
  ),
  fieldLabel: "Mapbox access token",
  emptyPlaceholder: "Paste pk. or sk. access token…",
  missingHint: () =>
    "No token stored. Contact maps stay unavailable until you save one.",
  testFailedMessage: "Mapbox connection test failed.",
};

export function SettingsMapboxTab({
  initialSettings,
}: IntegrationSettingsTabProps<MapboxSettings>) {
  return (
    <IntegrationSecretSettingsPanel
      config={MAPBOX_SETTINGS}
      initialSettings={initialSettings}
    />
  );
}
