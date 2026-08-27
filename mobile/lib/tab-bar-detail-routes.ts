/**
 * Phone: hide the floating tab bar on pushed detail / create screens (back
 * returns to the section list). iPad split panes keep the tray visible.
 */

const PHONE_DETAIL_PATH_PATTERNS: readonly RegExp[] = [
  // Root-stack entity detail + workbench
  /^\/task\/[^/]+$/,
  /^\/meeting\/[^/]+$/,
  /^\/contact\/[^/]+$/,
  /^\/organization\/[^/]+$/,
  /^\/document\/[^/]+$/,
  /^\/letter\/[^/]+$/,
  /^\/project\/.+/,
  /^\/create\/.+/,
  /^\/settings$/,
  // Tab stacks — section item, compose, or create
  /^\/tasks\/new$/,
  /^\/tasks\/[^/]+$/,
  /^\/tasks\/email\/.+/,
  /^\/projects\/new$/,
  /^\/inbox\/new$/,
  /^\/inbox\/[^/]+$/,
  /^\/inbox\/email\/.+/,
  /^\/journal\/[^/]+$/,
  /^\/habits\/[^/]+$/,
  /^\/contacts\/[^/]+$/,
  /^\/organizations\/[^/]+$/,
  /^\/letters\/[^/]+$/,
  /^\/knowledge\/[^/]+$/,
  /^\/projects\/[^/]+$/,
  /^\/email\/compose$/,
  /^\/email\/[^/]+\/[^/]+$/,
  /^\/finance\/(transaction|account|invoice|goal|category|recurring|ledger)\/[^/]+$/,
  /^\/finance\/(recurring-form|goal-form|category-form|account-form)$/,
];

export function normalizeTabBarPathname(pathname: string): string {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery || withoutQuery === "/") return "/";
  return withoutQuery.replace(/\/+$/, "");
}

export function shouldHideTabBarForPathname(pathname: string): boolean {
  const path = normalizeTabBarPathname(pathname);
  return PHONE_DETAIL_PATH_PATTERNS.some((pattern) => pattern.test(path));
}
