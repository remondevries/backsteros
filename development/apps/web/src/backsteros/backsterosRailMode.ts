import { isShortcutEditableTarget } from "~/keybindings";

import { shouldYieldPlainKeyHotkey } from "./plainKeyShortcutGuard";
import type {
  BacksterosRailMode,
  SidebarModeResumeLocation,
  SidebarModeTaskDetailResume,
} from "./sidebarModeStore";
import { captureSidebarModeResumeLocation } from "./sidebarModeStore";
import type { BacksterosTaskChatBinding } from "./taskChatStore";

export type BacksterosRailResumeSnapshot = {
  readonly location: SidebarModeResumeLocation;
  readonly taskDetail: SidebarModeTaskDetailResume | null;
};

/** Match BacksterOS desktop Go leader timeout (`GO_NAVIGATION_SEQUENCE_TIMEOUT_MS`). */
export const BACKSTEROS_GO_LEADER_TIMEOUT_MS = 1000;

let lastGoLeaderKeyPressAt = 0;

export function registerBacksterosGoLeader(now = Date.now()): void {
  lastGoLeaderKeyPressAt = now;
}

export function isBacksterosGoLeaderPending(now = Date.now()): boolean {
  if (lastGoLeaderKeyPressAt === 0) return false;
  return now - lastGoLeaderKeyPressAt < BACKSTEROS_GO_LEADER_TIMEOUT_MS;
}

export function clearBacksterosGoLeader(): void {
  lastGoLeaderKeyPressAt = 0;
}

/** Test helper — reset chord state between cases. */
export function resetBacksterosGoLeaderForTests(): void {
  lastGoLeaderKeyPressAt = 0;
}

/**
 * Capture where the user was in Projects mode so Inbox ↔ Projects can restore
 * the open task chat (draft/thread) when present, otherwise the project
 * drill-down — instead of dumping them on the bare project list.
 */
export function locationFromTaskChatBinding(
  binding: BacksterosTaskChatBinding | null | undefined,
): Extract<SidebarModeResumeLocation, { kind: "draft" } | { kind: "thread" }> | null {
  if (!binding) return null;
  if (binding.kind === "draft") {
    return { kind: "draft", draftId: binding.draftId };
  }
  return {
    kind: "thread",
    environmentId: binding.environmentId,
    threadId: binding.threadId,
  };
}

export function captureBacksterosProjectsRailResume(input: {
  readonly selectionProjectId?: string | null;
  readonly selectionProjectTitle?: string | null;
  readonly selectionTaskId?: string | null;
  readonly routeProjectId?: string | null;
  readonly routeProjectTitle?: string | null;
  readonly draftId?: string | null;
  readonly environmentId?: string | null;
  readonly threadId?: string | null;
  /** Open task→chat binding — preferred when the URL is still the project page. */
  readonly binding?: BacksterosTaskChatBinding | null;
}): BacksterosRailResumeSnapshot {
  const projectId =
    input.selectionProjectId ?? input.binding?.backsterosProjectId ?? input.routeProjectId ?? null;
  const title =
    (
      input.selectionProjectTitle ??
      input.binding?.projectTitle ??
      input.routeProjectTitle
    )?.trim() || undefined;

  const routeLocation = captureSidebarModeResumeLocation({
    draftId: input.draftId,
    environmentId: input.environmentId,
    threadId: input.threadId,
    backsterosProjectId: projectId,
    backsterosProjectTitle: title ?? null,
  });
  const chatFromBinding = locationFromTaskChatBinding(input.binding);
  // Live chat route wins; otherwise the task's bound draft/thread; else project/home.
  const location =
    routeLocation.kind === "draft" || routeLocation.kind === "thread"
      ? routeLocation
      : (chatFromBinding ?? routeLocation);

  const taskId = typeof input.selectionTaskId === "string" ? input.selectionTaskId : null;
  const taskDetail: SidebarModeTaskDetailResume | null =
    projectId != null && taskId != null
      ? { projectId, taskId }
      : input.selectionProjectId != null
        ? {
            projectId: input.selectionProjectId,
            taskId,
          }
        : null;

  return { location, taskDetail };
}

/**
 * When an older resume only remembered the project page, prefer the task's
 * bound draft/thread so returning to Projects reopens the chat.
 */
export function resolveProjectsRailResumeLocation(input: {
  readonly location: SidebarModeResumeLocation | null;
  readonly taskDetail: SidebarModeTaskDetailResume | null;
  readonly binding: BacksterosTaskChatBinding | null;
}): SidebarModeResumeLocation | null {
  const { location, taskDetail, binding } = input;
  const chatFromBinding = locationFromTaskChatBinding(binding);
  if (chatFromBinding && taskDetail?.taskId) {
    // Bound chat always wins over a stale project-overview resume.
    if (location?.kind === "draft" || location?.kind === "thread") return location;
    return chatFromBinding;
  }
  return location;
}

export function captureBacksterosInboxRailTaskDetail(input: {
  readonly selectionProjectId?: string | null;
  readonly selectionTaskId?: string | null;
}): SidebarModeTaskDetailResume | null {
  if (!input.selectionProjectId) return null;
  return {
    projectId: input.selectionProjectId,
    taskId: typeof input.selectionTaskId === "string" ? input.selectionTaskId : null,
  };
}

/**
 * True when focus is in a field that should receive typed characters
 * (composer, search, terminal, CodeMirror, Pierre file editor) — Go chords
 * and other bare-key hotkeys must yield.
 */
export function isBacksterosGoEditableTarget(target: EventTarget | null): boolean {
  return isShortcutEditableTarget(target);
}

export type BacksterosRailModeGoShortcutResult =
  | { readonly kind: "arm" }
  | { readonly kind: "navigate"; readonly mode: BacksterosRailMode };

/**
 * G then I → Inbox; G then P → Projects — same chords as BacksterOS desktop
 * (`useNavigationShortcuts` / `DEFAULT_GO_NAVIGATION_ITEMS`).
 *
 * Unlike desktop we do not open a Go palette; G only arms a short leader
 * window, then I/P switches the BacksterOS rail.
 */
export function resolveBacksterosRailModeGoShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "target"
  >,
  options?: {
    readonly now?: number;
    readonly editable?: boolean;
  },
): BacksterosRailModeGoShortcutResult | null {
  if (event.repeat) return null;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;

  const key = event.key.toLowerCase();
  const editable = options?.editable ?? shouldYieldPlainKeyHotkey(event);
  const now = options?.now ?? Date.now();
  const pending = isBacksterosGoLeaderPending(now);

  if (key === "g") {
    if (editable && !pending) return null;
    registerBacksterosGoLeader(now);
    return { kind: "arm" };
  }

  if (!pending) return null;

  if (key === "i") {
    clearBacksterosGoLeader();
    return { kind: "navigate", mode: "inbox" };
  }
  if (key === "p") {
    clearBacksterosGoLeader();
    return { kind: "navigate", mode: "projects" };
  }

  // Any other follow-up cancels the chord (except another G, which re-arms above).
  clearBacksterosGoLeader();
  return null;
}

/** UI hint on the Inbox / Projects pill — matches desktop Go hints. */
export function backsterosRailModeShortcutLabel(mode: BacksterosRailMode): string {
  return mode === "inbox" ? "G I" : "G P";
}
