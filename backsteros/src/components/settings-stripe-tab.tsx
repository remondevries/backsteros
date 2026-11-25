import type { StripeSettings } from "@backsteros/contracts";
import {
  SettingsSecretField,
  SettingsTestConnectionSwap,
} from "@backsteros/ui";

import { useWorkspaceIntegrationSettings } from "../lib/settings/use-workspace-integration-settings";
import type { IntegrationSettingsTabProps } from "./settings/integration-secret-settings-panel";

export function SettingsStripeTab({
  initialSettings,
}: IntegrationSettingsTabProps<StripeSettings>) {
  const { settings, settingsError, patchSettings, testConnection } =
    useWorkspaceIntegrationSettings<
      StripeSettings,
      { publishableKey?: string; secretKey?: string }
    >({
      basePath: "/api/v1/settings/stripe",
      label: "Stripe",
      initialSettings,
    });

  const secretConfigured = settings?.secretKeyConfigured ?? false;
  const envConfigured = settings?.envSecretConfigured ?? false;
  const canTest = settings !== null && (secretConfigured || envConfigured);

  return (
    <section className="settings-card settings-card--bare">
      <h2>API keys</h2>
      <p>
        Paste your{" "}
        <a
          href="https://dashboard.stripe.com/apikeys"
          target="_blank"
          rel="noreferrer"
        >
          Stripe API keys
        </a>{" "}
        (<code>pk_…</code> publishable and <code>sk_…</code> secret) so Finance
        can load Balance Transactions. Stored in core (not via PowerSync); env{" "}
        <code>STRIPE_SECRET_KEY</code> remains a secret-key fallback when no
        Settings secret is saved.
      </p>
      <label className="settings-field">
        Publishable key (API)
        <SettingsSecretField
          configured={Boolean(settings?.publishableKeyConfigured)}
          preview={settings?.publishableKeyPreview}
          emptyPlaceholder="Paste pk_live_… or pk_test_… key…"
          onSave={(value) => patchSettings({ publishableKey: value })}
        />
      </label>
      <label className="settings-field">
        Secret key
        <SettingsSecretField
          configured={secretConfigured}
          preview={settings?.secretKeyPreview}
          emptyPlaceholder="Paste sk_live_… or sk_test_… key…"
          onSave={(value) => patchSettings({ secretKey: value })}
          trailing={
            <SettingsTestConnectionSwap
              disabled={!canTest}
              onTest={async () => {
                await testConnection("Stripe connection test failed.");
              }}
            />
          }
        />
      </label>
      {secretConfigured ? null : (
        <p className="settings-hint">
          {envConfigured
            ? "No Settings secret stored (env STRIPE_SECRET_KEY is still available)."
            : "No Settings secret stored. Balance Transactions need the secret key."}
        </p>
      )}
      {settingsError ? (
        <p className="settings-cursor-error" role="alert">
          {settingsError}
        </p>
      ) : null}
    </section>
  );
}
