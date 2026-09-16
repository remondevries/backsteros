import { findBacksterosTaskIdForThread } from "./backsteros/taskChatStore";
import { composerAccentOverrideKey, useComposerAccentStore } from "./composerAccentStore";
import {
  parseComposerColorMenuAction,
  type ThreadActionMenuId,
} from "./components/threadActionMenu.logic";
import { resolveComposerAccentColor } from "./providerAccentColors";

/** Resolve the accent shown in Color menus (override → provider → hash). */
export function resolveComposerAccentForMenu(input: {
  readonly taskId?: string | null;
  readonly threadId?: string | null;
  readonly environmentId?: string | null;
  readonly instanceId?: string | null;
  readonly accentColor?: string | null;
}): string {
  const taskId =
    input.taskId?.trim() ||
    (input.threadId
      ? findBacksterosTaskIdForThread({
          threadId: input.threadId,
          environmentId: input.environmentId,
        })
      : null);
  const key = composerAccentOverrideKey({
    taskId,
    threadId: input.threadId,
  });
  const overrideColor = useComposerAccentStore.getState().getOverride(key);
  return resolveComposerAccentColor({
    threadId: input.threadId,
    instanceId: input.instanceId,
    accentColor: input.accentColor,
    overrideColor,
  });
}

/** Persist a Color submenu pick for a task or thread scope. */
export function applyComposerColorMenuAction(input: {
  readonly action: string;
  readonly taskId?: string | null;
  readonly threadId?: string | null;
  readonly environmentId?: string | null;
}): boolean {
  const parsed = parseComposerColorMenuAction(input.action);
  if (!parsed) return false;
  const taskId =
    input.taskId?.trim() ||
    (input.threadId
      ? findBacksterosTaskIdForThread({
          threadId: input.threadId,
          environmentId: input.environmentId,
        })
      : null);
  const key = composerAccentOverrideKey({
    taskId,
    threadId: input.threadId,
  });
  if (!key) return false;
  useComposerAccentStore.getState().setOverride(key, parsed.kind === "clear" ? null : parsed.hex);
  return true;
}

export function isComposerColorMenuAction(
  action: string,
): action is Extract<ThreadActionMenuId, `color:${string}` | "color:clear"> {
  return parseComposerColorMenuAction(action) != null;
}
