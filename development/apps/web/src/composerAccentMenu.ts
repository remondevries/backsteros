import { findBacksterosTaskIdForThread } from "./backsteros/taskChatStore";
import { composerAccentOverrideKey, useComposerAccentStore } from "./composerAccentStore";
import {
  parseComposerColorMenuAction,
  type ThreadActionMenuId,
} from "./components/threadActionMenu.logic";
import { resolveComposerAccentColor } from "./providerAccentColors";

/** Resolve the accent shown in Color menus (override → provider → hash). */
export function resolveComposerAccentForMenu(input: {
  readonly taskId?: string | null | undefined;
  readonly threadId?: string | null | undefined;
  readonly environmentId?: string | null | undefined;
  readonly instanceId?: string | null | undefined;
  readonly accentColor?: string | null | undefined;
}): string {
  const taskId =
    input.taskId?.trim() ||
    (input.threadId
      ? findBacksterosTaskIdForThread({
          threadId: input.threadId,
          environmentId: input.environmentId ?? null,
        })
      : null);
  const key = composerAccentOverrideKey({
    taskId,
    threadId: input.threadId ?? null,
  });
  const overrideColor = useComposerAccentStore.getState().getOverride(key);
  return resolveComposerAccentColor({
    threadId: input.threadId ?? null,
    instanceId: input.instanceId ?? null,
    accentColor: input.accentColor ?? null,
    overrideColor: overrideColor ?? null,
  });
}

/** Persist a Color submenu pick for a task or thread scope. */
export function applyComposerColorMenuAction(input: {
  readonly action: string;
  readonly taskId?: string | null | undefined;
  readonly threadId?: string | null | undefined;
  readonly environmentId?: string | null | undefined;
}): boolean {
  const parsed = parseComposerColorMenuAction(input.action);
  if (!parsed) return false;
  const taskId =
    input.taskId?.trim() ||
    (input.threadId
      ? findBacksterosTaskIdForThread({
          threadId: input.threadId,
          environmentId: input.environmentId ?? null,
        })
      : null);
  const key = composerAccentOverrideKey({
    taskId,
    threadId: input.threadId ?? null,
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
