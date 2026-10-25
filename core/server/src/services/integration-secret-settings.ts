/**
 * Shared get / update / test logic for integrations that store a single
 * workspace secret (Brandfetch, Mapbox, GitHub, Cloudflare). Kept free of the
 * database module so it can be unit-tested with an in-memory store.
 */

export type IntegrationSecretStore = {
  read(workspaceId: string): Promise<string | null>;
  write(workspaceId: string, value: string | null): Promise<void>;
};

export type IntegrationSecretState = {
  /** A workspace secret is stored (env fallback does not count). */
  configured: boolean;
  preview: string | null;
  /** The env / secrets-file fallback has a value. */
  envConfigured: boolean;
  /** Either the workspace secret or the env fallback is usable. */
  connected: boolean;
};

export type IntegrationSecretSettingsOptions<
  TSettings,
  TPatchKey extends string,
  TTest,
> = {
  store: IntegrationSecretStore;
  patchKey: TPatchKey;
  preview: (secret: string) => string;
  /** Machine-level fallback used when no workspace secret is stored. */
  envFallback?: () => string | null;
  toSettings: (state: IntegrationSecretState) => TSettings;
  /** Receives the resolved secret (workspace, then env fallback). */
  test: (secret: string | null) => Promise<TTest>;
};

export type IntegrationSecretSettingsService<
  TSettings,
  TPatchKey extends string,
  TTest,
> = {
  getWorkspaceSecret(workspaceId: string): Promise<string | null>;
  /** Workspace secret, then the env fallback. */
  getSecret(workspaceId: string): Promise<string | null>;
  getSettings(workspaceId: string): Promise<TSettings>;
  updateSettings(
    workspaceId: string,
    patch: Partial<Record<TPatchKey, string>>,
  ): Promise<TSettings>;
  testConnection(workspaceId: string): Promise<TTest>;
};

function normalizeSecret(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createIntegrationSecretSettingsService<
  TSettings,
  TPatchKey extends string,
  TTest,
>(
  options: IntegrationSecretSettingsOptions<TSettings, TPatchKey, TTest>,
): IntegrationSecretSettingsService<TSettings, TPatchKey, TTest> {
  const envSecret = () => normalizeSecret(options.envFallback?.() ?? null);

  const getWorkspaceSecret = async (workspaceId: string) =>
    normalizeSecret(await options.store.read(workspaceId));

  const getSecret = async (workspaceId: string) =>
    (await getWorkspaceSecret(workspaceId)) ?? envSecret();

  const getSettings = async (workspaceId: string) => {
    const secret = await getWorkspaceSecret(workspaceId);
    const envConfigured = envSecret() != null;
    return options.toSettings({
      configured: secret != null,
      preview: secret ? options.preview(secret) : null,
      envConfigured,
      connected: secret != null || envConfigured,
    });
  };

  return {
    getWorkspaceSecret,
    getSecret,
    getSettings,
    async updateSettings(workspaceId, patch) {
      const incoming = patch[options.patchKey];
      if (incoming !== undefined) {
        await options.store.write(workspaceId, normalizeSecret(incoming));
      }
      return getSettings(workspaceId);
    },
    async testConnection(workspaceId) {
      return options.test(await getSecret(workspaceId));
    },
  };
}
