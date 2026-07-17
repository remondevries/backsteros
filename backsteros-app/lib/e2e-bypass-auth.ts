/**
 * E2E auth bypass is only allowed outside production builds.
 * Playwright sets E2E_BYPASS_AUTH / NEXT_PUBLIC_E2E_BYPASS_AUTH in local/CI.
 */
export function isE2eAuthBypassEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }
  return (
    env.E2E_BYPASS_AUTH === "1" || env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1"
  );
}
