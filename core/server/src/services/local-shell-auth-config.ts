/** Synthetic Clerk id for a workspace that never signed in via Clerk. */
export const LOCAL_SHELL_CLERK_ID = "local_shell";

export const DEFAULT_LOCAL_SHELL_TOKEN = "local";

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

export function getLocalShellToken(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.LOCAL_SHELL_TOKEN?.trim();
  return configured || DEFAULT_LOCAL_SHELL_TOKEN;
}

export function isLocalShellBearerToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return token === getLocalShellToken(env);
}
