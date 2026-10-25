import type { ReactNode } from "react";
import {
  SettingsSecretField,
  SettingsTestConnectionSwap,
} from "@backsteros/ui";

import { useWorkspaceIntegrationSettings } from "../../lib/settings/use-workspace-integration-settings";

/** Props every integration settings tab receives from the modal. */
export type IntegrationSettingsTabProps<TSettings> = {
  title: string;
  description: string;
  hideHeader?: boolean;
  /** Settings body already loaded by the integrations overview. */
  initialSettings?: TSettings | null;
};

export type IntegrationSecretSettingsConfig<
  TSettings,
  TPatchKey extends string,
> = {
  /** e.g. `/api/v1/settings/cloudflare` */
  basePath: string;
  /** Used in fallback error copy. */
  label: string;
  patchKey: TPatchKey;
  configured: (settings: TSettings) => boolean;
  preview: (settings: TSettings) => string | null | undefined;
  /** Machine env fallback; when set, testing is allowed without a stored secret. */
  envConfigured?: (settings: TSettings) => boolean;
  heading: string;
  intro: ReactNode;
  fieldLabel: string;
  emptyPlaceholder: string;
  /** Shown while no workspace secret is stored. */
  missingHint: (envConfigured: boolean) => ReactNode;
  testFailedMessage: string;
  errorRole?: "alert";
};

/** One-secret integration tab: secret field, test connection, hint, error. */
export function IntegrationSecretSettingsPanel<
  TSettings,
  TPatchKey extends string,
>({
  config,
  initialSettings,
}: {
  config: IntegrationSecretSettingsConfig<TSettings, TPatchKey>;
  initialSettings?: TSettings | null;
}) {
  const { settings, settingsError, patchSettings, testConnection } =
    useWorkspaceIntegrationSettings<
      TSettings,
      Partial<Record<TPatchKey, string>>
    >({
      basePath: config.basePath,
      label: config.label,
      initialSettings,
    });

  const configured = settings ? config.configured(settings) : false;
  const envConfigured =
    settings && config.envConfigured ? config.envConfigured(settings) : false;
  const canTest = settings !== null && (configured || envConfigured);

  return (
    <section className="settings-card settings-card--bare">
      <h2>{config.heading}</h2>
      <p>{config.intro}</p>
      <label className="settings-field">
        {config.fieldLabel}
        <SettingsSecretField
          configured={configured}
          preview={settings ? config.preview(settings) : undefined}
          emptyPlaceholder={config.emptyPlaceholder}
          onSave={(value) =>
            patchSettings({ [config.patchKey]: value } as Partial<
              Record<TPatchKey, string>
            >)
          }
          trailing={
            <SettingsTestConnectionSwap
              disabled={!canTest}
              onTest={async () => {
                await testConnection(config.testFailedMessage);
              }}
            />
          }
        />
      </label>
      {configured ? null : (
        <p className="settings-hint">{config.missingHint(envConfigured)}</p>
      )}
      {settingsError ? (
        <p className="settings-cursor-error" role={config.errorRole}>
          {settingsError}
        </p>
      ) : null}
    </section>
  );
}
