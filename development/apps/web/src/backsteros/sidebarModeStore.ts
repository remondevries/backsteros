import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

const SIDEBAR_MODE_STORAGE_KEY = "t3code:sidebar-mode";
const SIDEBAR_MODE_STORAGE_VERSION = 2;

/** Last place the user was in vibe (T3 threads) or log (BacksterOS) mode. */
export type SidebarModeResumeLocation =
  | { readonly kind: "home" }
  | { readonly kind: "draft"; readonly draftId: string }
  | {
      readonly kind: "thread";
      readonly environmentId: string;
      readonly threadId: string;
    }
  | {
      readonly kind: "backsteros-project";
      readonly projectId: string;
      readonly title?: string;
    };

export type SidebarModeTaskDetailResume = {
  readonly taskId: string | null;
  readonly projectId: string;
};

/** Top-level BacksterOS rail: attention inbox vs project browser. */
export type BacksterosRailMode = "inbox" | "projects";

interface SidebarModeState {
  readonly logModeEnabled: boolean;
  readonly backsterosRailMode: BacksterosRailMode;
  readonly vibeLocation: SidebarModeResumeLocation | null;
  readonly logLocation: SidebarModeResumeLocation | null;
  readonly logTaskDetail: SidebarModeTaskDetailResume | null;
  readonly setLogModeEnabled: (enabled: boolean) => void;
  readonly setBacksterosRailMode: (mode: BacksterosRailMode) => void;
  readonly rememberVibeLocation: (location: SidebarModeResumeLocation) => void;
  readonly rememberLogLocation: (
    location: SidebarModeResumeLocation,
    taskDetail: SidebarModeTaskDetailResume | null,
  ) => void;
}

function normalizeLocation(raw: unknown): SidebarModeResumeLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.kind === "home") return { kind: "home" };
  if (value.kind === "draft" && typeof value.draftId === "string") {
    return { kind: "draft", draftId: value.draftId };
  }
  if (
    value.kind === "thread" &&
    typeof value.environmentId === "string" &&
    typeof value.threadId === "string"
  ) {
    return {
      kind: "thread",
      environmentId: value.environmentId,
      threadId: value.threadId,
    };
  }
  if (value.kind === "backsteros-project" && typeof value.projectId === "string") {
    return {
      kind: "backsteros-project",
      projectId: value.projectId,
      ...(typeof value.title === "string" && value.title.trim()
        ? { title: value.title }
        : {}),
    };
  }
  return null;
}

function normalizeTaskDetail(raw: unknown): SidebarModeTaskDetailResume | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.projectId !== "string" || !value.projectId.trim()) return null;
  if (value.taskId !== null && typeof value.taskId !== "string") return null;
  return {
    projectId: value.projectId,
    taskId: typeof value.taskId === "string" ? value.taskId : null,
  };
}

function normalizeBacksterosRailMode(raw: unknown): BacksterosRailMode {
  return raw === "inbox" ? "inbox" : "projects";
}

export function captureSidebarModeResumeLocation(input: {
  readonly draftId?: string | null;
  readonly environmentId?: string | null;
  readonly threadId?: string | null;
  readonly backsterosProjectId?: string | null;
  readonly backsterosProjectTitle?: string | null;
}): SidebarModeResumeLocation {
  if (input.draftId) {
    return { kind: "draft", draftId: input.draftId };
  }
  if (input.environmentId && input.threadId) {
    return {
      kind: "thread",
      environmentId: input.environmentId,
      threadId: input.threadId,
    };
  }
  if (input.backsterosProjectId) {
    return {
      kind: "backsteros-project",
      projectId: input.backsterosProjectId,
      ...(input.backsterosProjectTitle?.trim()
        ? { title: input.backsterosProjectTitle.trim() }
        : {}),
    };
  }
  return { kind: "home" };
}

export function sidebarModeResumeLocationsEqual(
  a: SidebarModeResumeLocation | null,
  b: SidebarModeResumeLocation | null,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case "home":
      return true;
    case "draft":
      return b.kind === "draft" && a.draftId === b.draftId;
    case "thread":
      return (
        b.kind === "thread" &&
        a.environmentId === b.environmentId &&
        a.threadId === b.threadId
      );
    case "backsteros-project":
      return b.kind === "backsteros-project" && a.projectId === b.projectId;
  }
}

export const useSidebarModeStore = create<SidebarModeState>()(
  persist(
    (set) => ({
      logModeEnabled: false,
      backsterosRailMode: "projects",
      vibeLocation: null,
      logLocation: null,
      logTaskDetail: null,
      setLogModeEnabled: (enabled) => set({ logModeEnabled: enabled }),
      setBacksterosRailMode: (mode) => set({ backsterosRailMode: mode }),
      rememberVibeLocation: (location) => set({ vibeLocation: location }),
      rememberLogLocation: (location, taskDetail) =>
        set({ logLocation: location, logTaskDetail: taskDetail }),
    }),
    {
      name: SIDEBAR_MODE_STORAGE_KEY,
      version: SIDEBAR_MODE_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        logModeEnabled: state.logModeEnabled,
        backsterosRailMode: state.backsterosRailMode,
        vibeLocation: state.vibeLocation,
        logLocation: state.logLocation,
        logTaskDetail: state.logTaskDetail,
      }),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        return {
          logModeEnabled: state.logModeEnabled === true,
          backsterosRailMode: normalizeBacksterosRailMode(state.backsterosRailMode),
          vibeLocation: normalizeLocation(state.vibeLocation),
          logLocation: normalizeLocation(state.logLocation),
          logTaskDetail: normalizeTaskDetail(state.logTaskDetail),
        };
      },
    },
  ),
);
