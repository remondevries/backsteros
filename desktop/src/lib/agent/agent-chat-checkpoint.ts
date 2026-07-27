import {
  activityLinesToUnifiedPatch,
  changedFileToUnifiedPatch,
} from "./agent-chat-diff-render";
import type { AgentChatActivityItem } from "./agent-acp-activity";
import { collectChangedFilesFromActivities } from "./agent-chat-timeline";

/** Build reverse-applicable unified patches from a turn's tool diffs. */
export function buildCheckpointPatchesFromActivities(
  activities: readonly AgentChatActivityItem[] | undefined,
): string[] {
  if (!activities || activities.length === 0) return [];
  const files = collectChangedFilesFromActivities(activities);
  const patches: string[] = [];
  for (const file of files) {
    const patch = changedFileToUnifiedPatch(file);
    if (patch.trim()) patches.push(patch);
  }
  // Fallback: per-activity diffs if merge missed something.
  if (patches.length === 0) {
    for (const item of activities) {
      if (!item.diff?.path || item.diff.lines.length === 0) continue;
      const patch = activityLinesToUnifiedPatch(item.diff.path, item.diff.lines);
      if (patch.trim()) patches.push(patch);
    }
  }
  return patches;
}

export function collectPathsFromPatches(patches: readonly string[]): string[] {
  const paths = new Set<string>();
  for (const patch of patches) {
    for (const line of patch.split("\n")) {
      if (line.startsWith("+++ b/")) {
        const path = line.slice("+++ b/".length).trim();
        if (path && path !== "/dev/null") paths.add(path);
      } else if (line.startsWith("--- a/")) {
        const path = line.slice("--- a/".length).trim();
        if (path && path !== "/dev/null") paths.add(path);
      }
    }
  }
  return [...paths];
}
