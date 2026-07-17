import { encodeTaskSlug } from "@/lib/entity-slugs";
import { getJournalHref } from "@/lib/journal/navigation-path";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import {
  getTasksDueListHref,
  parseTasksDueFilter,
  type TasksDueFilter,
} from "@/lib/tasks-due-filters";

export const TASK_REFERRER_SEARCH_PARAM = "from";
export const TASK_REFERRER_JOURNAL_DATE_PARAM = "journalDate";
export const TASK_REFERRER_TASKS = "tasks";
export const TASK_REFERRER_JOURNAL = "journal";

export function getDueTaskHrefFromSummary(input: {
  number: number;
  status?: string;
  project?: { key?: string | null } | null;
  contact?: { key?: string | null } | null;
  dueFilter?: TasksDueFilter;
}) {
  const contextKey = input.project?.key || input.contact?.key || INBOX_TASK_KEY;
  const slug = encodeTaskSlug(contextKey, input.number);
  const dueFilter = input.dueFilter ?? "today";
  return `/tasks/${dueFilter}/${slug}`;
}

export function getTaskReferrerBackHref(
  searchParams: Pick<URLSearchParams, "get">,
  pathname?: string,
): string | null {
  if (pathname) {
    const dueTaskDetail = pathname.match(/^\/tasks\/([^/]+)\/[^/]+$/);
    if (dueTaskDetail) {
      return getTasksDueListHref(parseTasksDueFilter(dueTaskDetail[1]));
    }
  }

  const from = searchParams.get(TASK_REFERRER_SEARCH_PARAM);

  if (from === TASK_REFERRER_TASKS) {
    return getTasksDueListHref(parseTasksDueFilter(searchParams.get("due")));
  }

  if (from === TASK_REFERRER_JOURNAL) {
    const journalDateSlug = searchParams.get(TASK_REFERRER_JOURNAL_DATE_PARAM);
    if (journalDateSlug) {
      return getJournalHref(journalDateSlug);
    }
    return "/journal";
  }

  return null;
}

export function isTaskOpenedFromTasks(
  searchParams: Pick<URLSearchParams, "get">,
  pathname?: string,
): boolean {
  if (searchParams.get(TASK_REFERRER_SEARCH_PARAM) === TASK_REFERRER_TASKS) {
    return true;
  }

  return pathname != null && /^\/tasks\/[^/]+\/[^/]+$/.test(pathname);
}

export function isTaskOpenedFromJournal(
  searchParams: Pick<URLSearchParams, "get">,
): boolean {
  return searchParams.get(TASK_REFERRER_SEARCH_PARAM) === TASK_REFERRER_JOURNAL;
}

/** @deprecated Prefer getTaskReferrerBackHref / isTaskOpenedFromTasks with search params. */
export function getTaskNavigationContext() {
  return null;
}
