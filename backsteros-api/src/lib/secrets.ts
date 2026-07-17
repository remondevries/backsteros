const EXAMPLE_POWERSYNC_JWT_SECRET = "dev-powersync-secret-change-me";
const MIN_POWERSYNC_JWT_SECRET_LENGTH = 32;

export function assertPowerSyncSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === "production";
  const powerSyncUrl = env.POWERSYNC_URL?.trim();
  const secret = env.POWERSYNC_JWT_SECRET?.trim();
  const powerSyncConfigured = Boolean(powerSyncUrl) || isProduction;

  if (!powerSyncConfigured) {
    return;
  }

  if (!secret) {
    throw new Error(
      "POWERSYNC_JWT_SECRET is required when POWERSYNC_URL is set or NODE_ENV=production",
    );
  }

  if (secret === EXAMPLE_POWERSYNC_JWT_SECRET) {
    throw new Error(
      "POWERSYNC_JWT_SECRET must not be the example value from .env.example. " +
        "Set a real secret in backsteros-api/.env (and note: an exported shell " +
        "POWERSYNC_JWT_SECRET overrides --env-file).",
    );
  }

  if (isProduction && secret.length < MIN_POWERSYNC_JWT_SECRET_LENGTH) {
    throw new Error(
      `POWERSYNC_JWT_SECRET must be at least ${MIN_POWERSYNC_JWT_SECRET_LENGTH} characters in production`,
    );
  }
}
