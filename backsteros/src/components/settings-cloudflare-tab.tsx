import type { CloudflareSettings } from "@backsteros/contracts";

import {
  IntegrationSecretSettingsPanel,
  type IntegrationSecretSettingsConfig,
  type IntegrationSettingsTabProps,
} from "./settings/integration-secret-settings-panel";

const CLOUDFLARE_SETTINGS: IntegrationSecretSettingsConfig<
  CloudflareSettings,
  "apiToken"
> = {
  basePath: "/api/v1/settings/cloudflare",
  label: "Cloudflare",
  patchKey: "apiToken",
  configured: (settings) => settings.apiTokenConfigured,
  preview: (settings) => settings.apiTokenPreview,
  envConfigured: (settings) => Boolean(settings.envTokenConfigured),
  heading: "API token",
  intro: (
    <>
      Store a Cloudflare API token with Zone read (and later DNS edit)
      permissions so Catalog Domains can match each hostname to its Cloudflare
      zone id. Stored in core (not via PowerSync); machine env /{" "}
      <code>~/.config/secrets/cloudflare.env</code> remains a fallback when no
      workspace token is saved.
    </>
  ),
  fieldLabel: "Cloudflare API token",
  emptyPlaceholder: "Paste Cloudflare API token",
  missingHint: (envConfigured) =>
    envConfigured
      ? "No workspace token stored (env fallback is active)."
      : "No workspace token stored.",
  testFailedMessage: "Cloudflare connection test failed",
  errorRole: "alert",
};

export function SettingsCloudflareTab({
  initialSettings,
}: IntegrationSettingsTabProps<CloudflareSettings>) {
  return (
    <IntegrationSecretSettingsPanel
      config={CLOUDFLARE_SETTINGS}
      initialSettings={initialSettings}
    />
  );
}
