/**
 * Playwright sets E2E_BYPASS_AUTH / NEXT_PUBLIC_E2E_BYPASS_AUTH for local/CI.
 * Never set those on the Kamal production host — `next start` in CI still uses
 * NODE_ENV=production, so we key only off the explicit flag (and refuse known
 * production app URLs as a belt-and-suspenders guard).
 */
export function isE2eAuthBypassEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flagged =
    env.E2E_BYPASS_AUTH === "1" || env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1";
  if (!flagged) {
    return false;
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
  if (appUrl.includes("backsteros.com")) {
    return false;
  }

  return true;
}
