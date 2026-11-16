import { timingSafeEqual } from "node:crypto";

/** Synthetic Clerk id for a workspace that never signed in via Clerk. */
export const LOCAL_SHELL_CLERK_ID = "local_shell";

/**
 * Test-only default bearer. Never used outside test runs: production /
 * local-core must set LOCAL_SHELL_TOKEN (see `describeLocalShellTokenStatus`).
 */
export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

/** True under unit/integration test runners (never in a normal core start). */
export function isLocalShellTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.NODE_ENV === "test" ||
    env.VITEST !== undefined ||
    env.BACKSTEROS_INTEGRATION_TEST === "1" ||
    env.NODE_TEST_CONTEXT !== undefined
  );
}

/** Enabled on local-core by default; never on cloud-core. */
export function isLocalShellAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.LOCAL_SHELL_AUTH?.trim() === "0") return false;
  if (env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
    return false;
  }
  return true;
}

/**
 * Configured shared bearer. Outside tests there is NO default: when
 * LOCAL_SHELL_TOKEN is unset the local-shell bearer is rejected outright
 * (a literal `Bearer local` must not grant owner access).
 */
export function getLocalShellToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = env.LOCAL_SHELL_TOKEN?.trim();
  if (configured) return configured;
  return isLocalShellTestEnvironment(env) ? DEFAULT_LOCAL_SHELL_TOKEN : null;
}

export function isLocalShellBearerToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = getLocalShellToken(env);
  if (!expected) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Startup guidance (no secret values). Null when nothing needs attention. */
export function describeLocalShellTokenStatus(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isLocalShellAuthEnabled(env)) return null;
  if (env.LOCAL_SHELL_TOKEN?.trim()) return null;
  if (isLocalShellTestEnvironment(env)) return null;
  return (
    "LOCAL_SHELL_TOKEN is not set — local-shell bearer auth is DISABLED (no default token). " +
    "Generate one (e.g. `openssl rand -hex 32`), set LOCAL_SHELL_TOKEN in the core env and " +
    "VITE_LOCAL_SHELL_TOKEN for the desktop, then restart."
  );
}
