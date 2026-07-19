import { encodeTaskSlug } from "../inbox-items.js";
import { INBOX_TASK_KEY } from "../task-display-id.js";
import { appendNavigationTrailNode } from "./codec.js";

/** Append a stable task leaf under a journal (or other) source path. */
export function buildJournalTaskTrailHref(
  sourceHref: string,
  task: {
    id: string;
    number: number;
    projectKey?: string | null;
    contactKey?: string | null;
  },
): string {
  return appendNavigationTrailNode(sourceHref, {
    kind: "task",
    entityId: task.id,
    routeParam: encodeTaskSlug(
      task.projectKey || task.contactKey || INBOX_TASK_KEY,
      task.number,
    ),
  });
}
