import type { BrandfetchSettings } from "@backsteros/contracts";

import {
  IntegrationSecretSettingsPanel,
  type IntegrationSecretSettingsConfig,
  type IntegrationSettingsTabProps,
} from "./settings/integration-secret-settings-panel";

const BRANDFETCH_SETTINGS: IntegrationSecretSettingsConfig<
  BrandfetchSettings,
  "apiKey"
> = {
  basePath: "/api/v1/settings/brandfetch",
  label: "Brandfetch",
  patchKey: "apiKey",
  configured: (settings) => settings.apiKeyConfigured,
  preview: (settings) => settings.apiKeyPreview,
  envConfigured: (settings) => Boolean(settings.envKeyConfigured),
  heading: "Brand API key",
  intro: (
    <>
      Create a{" "}
      <a
        href="https://developers.brandfetch.com"
        target="_blank"
        rel="noreferrer"
      >
        Brandfetch Brand API key
      </a>
      . Core stores the key (not via PowerSync) and uses it to download
      organization logos into stored avatars for CardDAV and the API — missing
      org logos hydrate on CardDAV card GET and via the hydrate script.
      Replacing the workspace key leaves already-stored organization avatars in
      place. Desktop Logo CDN hotlinks stay display-only (
      <code>VITE_BRANDFETCH_CLIENT_ID</code>).
    </>
  ),
  fieldLabel: "Brandfetch API key",
  emptyPlaceholder: "Paste Brand API key…",
  missingHint: (envConfigured) =>
    envConfigured
      ? "No workspace key stored (server env fallback is active — save the same key here so it twin-replicates)."
      : "No workspace key stored. Org logo hydrate stays off until you save one.",
  testFailedMessage: "Brandfetch connection test failed.",
};

export function SettingsBrandfetchTab({
  initialSettings,
}: IntegrationSettingsTabProps<BrandfetchSettings>) {
  return (
    <IntegrationSecretSettingsPanel
      config={BRANDFETCH_SETTINGS}
      initialSettings={initialSettings}
    />
  );
}
