import type { StripeSettings } from "@backsteros/contracts";

import {
  IntegrationSecretSettingsPanel,
  type IntegrationSecretSettingsConfig,
  type IntegrationSettingsTabProps,
} from "./settings/integration-secret-settings-panel";

const STRIPE_SETTINGS: IntegrationSecretSettingsConfig<
  StripeSettings,
  "secretKey"
> = {
  basePath: "/api/v1/settings/stripe",
  label: "Stripe",
  patchKey: "secretKey",
  configured: (settings) => settings.secretKeyConfigured,
  preview: (settings) => settings.secretKeyPreview,
  envConfigured: (settings) => Boolean(settings.envSecretConfigured),
  heading: "Secret key",
  intro: (
    <>
      Paste a{" "}
      <a
        href="https://dashboard.stripe.com/apikeys"
        target="_blank"
        rel="noreferrer"
      >
        Stripe secret key
      </a>{" "}
      (<code>sk_live_…</code> or <code>sk_test_…</code>) so Finance can load
      Balance Transactions. Stored in core (not via PowerSync); env{" "}
      <code>STRIPE_SECRET_KEY</code> remains a fallback when no Settings key is
      saved.
    </>
  ),
  fieldLabel: "Stripe secret key",
  emptyPlaceholder: "Paste sk_live_… or sk_test_… key…",
  missingHint: (envConfigured) =>
    envConfigured
      ? "No Settings key stored (env STRIPE_SECRET_KEY is still available)."
      : "No Settings key stored.",
  testFailedMessage: "Stripe connection test failed.",
};

export function SettingsStripeTab({
  initialSettings,
}: IntegrationSettingsTabProps<StripeSettings>) {
  return (
    <IntegrationSecretSettingsPanel
      config={STRIPE_SETTINGS}
      initialSettings={initialSettings}
    />
  );
}
