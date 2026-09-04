import type { PendingPageSurface } from "./pending-navigation-routes";

export type RouteSnapshot = {
  pathname: string;
  searchStr: string;
  params: Record<string, string | undefined>;
};

/**
 * Derive keep-alive route params from a pathname. Must stay aligned with the
 * TanStack route tree — warm flips never rematch the router, so nested params
 * like `letterSlug` only exist if we parse them here.
 */
export function snapshotFor(
  surface: PendingPageSurface,
  pathname: string,
  searchStr: string,
): RouteSnapshot {
  const parts = pathname.split("/").filter(Boolean);
  const params: Record<string, string | undefined> = {};
  if (surface === "inbox") {
    params.itemId = parts[0] === "inbox" ? parts[1] : undefined;
  }
  if (surface === "journal-habits") {
    params.habitId = parts[2];
  }
  if (surface === "journal-day") {
    params.dateSlug = parts[1];
  }
  if (surface === "projects") {
    // /projects/$slug/...
    // /organizations/$org/projects/$projectSlug/...
    if (parts[0] === "organizations") {
      params.slug = parts[1];
      params.projectSlug = parts[3];
      params.section = parts[4];
      if (parts[4] === "letters" && parts[5]) {
        params.letterSlug = parts[5];
      }
      if (parts[4] === "tasks" && parts[5]) {
        params.taskSlug = parts[5];
      }
    } else {
      params.slug = parts[1];
      params.section = parts[2];
      // Warm flips previously dropped letterSlug for /projects/:slug/letters/:letterSlug
      // (mention chips from tasks), leaving ProjectsPage stuck on the first letter
      // or an empty letters section.
      if (parts[2] === "letters" && parts[3]) {
        params.letterSlug = parts[3];
      }
      if (parts[2] === "tasks" && parts[3]) {
        params.taskSlug = parts[3];
      }
    }
  }
  if (surface === "contacts") {
    // /contacts/$slug/...
    // /organizations/$org/contacts/$contactSlug/...
    if (parts[0] === "organizations") {
      params.slug = parts[1];
      params.contactSlug = parts[3];
      params.section = parts[4];
      if (parts[4] === "letters" && parts[5]) {
        params.letterSlug = parts[5];
      }
      if (parts[4] === "tasks" && parts[5]) {
        params.taskSlug = parts[5];
      }
      if (parts[4] === "meetings" && parts[5]) {
        params.meetingSlug = parts[5];
      }
    } else {
      params.slug = parts[1];
      params.section = parts[2];
      if (parts[2] === "letters" && parts[3]) {
        params.letterSlug = parts[3];
      }
      if (parts[2] === "tasks" && parts[3]) {
        params.taskSlug = parts[3];
      }
      if (parts[2] === "meetings" && parts[3]) {
        params.meetingSlug = parts[3];
      }
    }
  }
  if (surface === "organizations") {
    params.slug = parts[1];
    params.section = parts[2];
  }
  if (surface === "letters") {
    params.slug = parts[1];
  }
  if (surface === "tasks-list" && parts[0] === "tasks") {
    if (parts.length >= 3) {
      params.dueFilter = parts[1];
      params.taskSlug = parts[2];
    } else if (parts.length === 2) {
      params.taskId = parts[1];
    }
  }
  return { pathname, searchStr, params };
}
