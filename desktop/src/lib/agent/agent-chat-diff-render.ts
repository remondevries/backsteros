import type { AgentChatActivityDiffLine } from "./agent-acp-activity";
import type { AgentChatChangedFile } from "./agent-chat-timeline";

/** Build a unified diff patch from ACP activity lines for Pierre's PatchDiff. */
export function activityLinesToUnifiedPatch(
  path: string,
  lines: readonly AgentChatActivityDiffLine[],
): string {
  const safePath = path.trim() || "file";
  let oldCount = 0;
  let newCount = 0;
  const body: string[] = [];
  for (const line of lines) {
    if (line.type === "del") {
      oldCount += 1;
      body.push(`-${line.text}`);
    } else if (line.type === "add") {
      newCount += 1;
      body.push(`+${line.text}`);
    } else {
      oldCount += 1;
      newCount += 1;
      body.push(` ${line.text}`);
    }
  }
  if (body.length === 0) {
    return "";
  }
  return [
    `diff --git a/${safePath} b/${safePath}`,
    `--- a/${safePath}`,
    `+++ b/${safePath}`,
    `@@ -1,${Math.max(oldCount, 1)} +1,${Math.max(newCount, 1)} @@`,
    ...body,
    "",
  ].join("\n");
}

export function changedFileToUnifiedPatch(file: AgentChatChangedFile): string {
  return activityLinesToUnifiedPatch(file.path, file.lines);
}
