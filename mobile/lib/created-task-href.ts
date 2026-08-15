/**
 * After creating a task, prefer tab-scoped detail routes so the floating tab bar
 * stays mounted.
 *
 * `router.replace("/task/:id")` from inside `(app)` can replace the entire tab
 * navigator on the root stack and leave the user with no bottom navigation
 * (iPhone CI-49). Root `/create/task` is safe to replace onto `/task/:id`
 * because `(app)` remains underneath.
 */
export function createdTaskDetailHref(
  taskId: string,
  segments: readonly string[],
): `/(app)/inbox/${string}` | `/(app)/tasks/${string}` | `/task/${string}` {
  if (segments.includes("tasks")) {
    return `/(app)/tasks/${taskId}`;
  }
  if (segments.includes("inbox") || segments.includes("compose")) {
    return `/(app)/inbox/${taskId}`;
  }
  if (segments.includes("(app)")) {
    return `/(app)/inbox/${taskId}`;
  }
  return `/task/${taskId}`;
}
