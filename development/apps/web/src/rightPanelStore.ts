/**
 * Right-panel surface state.
 *
 * Browser and terminal tabs are scoped to a project/codebase so switching
 * conversations within the same project keeps those tools. Diff, files, file,
 * pull-request, and agents stay thread-scoped.
 *
 * Durable resources (preview sessions, PTYs) remain owned by the creating
 * thread; surfaces carry `ownerThreadId` so render/RPC paths use that owner.
 */
import {
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type {
  ChatFileAttachment,
  ScopedProjectRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const RIGHT_PANEL_KINDS = [
  "diff",
  "files",
  "file",
  "preview",
  "terminal",
  "pull-request",
  "agents",
] as const;
export type RightPanelKind = (typeof RIGHT_PANEL_KINDS)[number];

export type RightPanelSurface =
  | {
      id: `browser:${string}`;
      kind: "preview";
      resourceId: string;
      ownerThreadId: string;
    }
  | {
      id: "browser:new";
      kind: "preview";
      resourceId: null;
      ownerThreadId: string;
    }
  | {
      id: `terminal:${string}`;
      kind: "terminal";
      resourceId: string;
      terminalIds: string[];
      activeTerminalId: string;
      splitDirection?: "horizontal" | "vertical";
      ownerThreadId: string;
    }
  | { id: "diff"; kind: "diff" }
  | { id: "files"; kind: "files" }
  | {
      id: `file:${string}` | `attachment:${string}`;
      kind: "file";
      /** Workspace-relative, or absolute for a host file outside the workspace. */
      relativePath: string;
      revealLine: number | null;
      revealRequestId: number;
      /** Present when the file lives in the thread's attachment store rather
          than at a workspace or host path. */
      attachment?: ChatFileAttachment;
    }
  | {
      /**
       * A change request opened beside a thread or in the pull-request list's shared panel.
       * The reference lives in the id so several pull requests can remain open as peer tabs.
       */
      id: `pull-request:${string}`;
      kind: "pull-request";
      /**
       * Which server the change request was read from. The list spans every connected one, so
       * two of them can hold the same project id; a panel beside a thread leaves this out and
       * takes the environment from its own ref.
       */
      environmentId?: string;
      projectId: string;
      repository: string;
      number: number;
    }
  | { id: "agents"; kind: "agents" };

const RIGHT_PANEL_STORAGE_KEY = "t3code:right-panel-state:v2";
// v9 removed the "plan" surface kind (plans render inline in the transcript).
// v10 keys pull-request surfaces by reference instead of a singleton tab.
// v11 stops persisting the pull-request list's shared panel, so a restart opens the page fresh.
// v12 moves browser/terminal surfaces to byProjectKey with ownerThreadId.
const RIGHT_PANEL_STORAGE_VERSION = 12;

/**
 * The pull-request list's shared panel (see PULL_REQUESTS_PANEL_ID in the route) is session
 * state: reopening the app should show the list, not last session's tabs and detail fetches.
 */
const isPullRequestsPanelKey = (threadKey: string) => threadKey.endsWith(":pull-requests-panel");

export interface ThreadRightPanelState {
  isOpen: boolean;
  activeSurfaceId: string | null;
  /** Bumped when this bag's active surface changes so composed selection can prefer it. */
  activeGeneration: number;
  surfaces: RightPanelSurface[];
}

export type ProjectRightPanelState = ThreadRightPanelState;

interface RightPanelStoreState {
  byThreadKey: Record<string, ThreadRightPanelState>;
  byProjectKey: Record<string, ProjectRightPanelState>;
  /** Monotonic clock shared by both bags so composed selection prefers the latest activation. */
  activationClock: number;
  open: (
    ref: ScopedThreadRef,
    kind: Exclude<RightPanelKind, "file" | "terminal" | "pull-request" | "preview">,
  ) => void;
  openBrowser: (
    projectRef: ScopedProjectRef,
    ownerThreadRef: ScopedThreadRef,
    tabId: string | null,
  ) => void;
  openFile: (ref: ScopedThreadRef, relativePath: string, line?: number) => void;
  openAttachment: (ref: ScopedThreadRef, attachment: ChatFileAttachment) => void;
  openPullRequest: (
    ref: ScopedThreadRef,
    target: { environmentId?: string; projectId: string; repository: string; number: number },
  ) => void;
  openTerminal: (
    projectRef: ScopedProjectRef,
    ownerThreadRef: ScopedThreadRef,
    terminalId: string,
  ) => void;
  splitTerminal: (
    projectRef: ScopedProjectRef,
    surfaceId: string,
    terminalId: string,
    direction?: "horizontal" | "vertical",
  ) => void;
  activateTerminal: (
    projectRef: ScopedProjectRef,
    surfaceId: string,
    terminalId: string,
  ) => void;
  closeTerminal: (projectRef: ScopedProjectRef, surfaceId: string, terminalId: string) => void;
  activateSurface: (
    threadRef: ScopedThreadRef,
    surfaceId: string,
    projectRef?: ScopedProjectRef | null,
  ) => void;
  closeSurface: (
    threadRef: ScopedThreadRef,
    surfaceId: string,
    projectRef?: ScopedProjectRef | null,
  ) => void;
  closeOtherSurfaces: (
    threadRef: ScopedThreadRef,
    surfaceId: string,
    projectRef?: ScopedProjectRef | null,
  ) => void;
  closeSurfacesToRight: (
    threadRef: ScopedThreadRef,
    surfaceId: string,
    projectRef?: ScopedProjectRef | null,
  ) => void;
  closeAllSurfaces: (threadRef: ScopedThreadRef, projectRef?: ScopedProjectRef | null) => void;
  reconcileBrowserSurfaces: (
    projectRef: ScopedProjectRef,
    ownerThreadRef: ScopedThreadRef,
    tabIds: readonly string[],
  ) => void;
  reconcileFileSurfaces: (ref: ScopedThreadRef, workspaceAvailable: boolean) => void;
  show: (threadRef: ScopedThreadRef, projectRef?: ScopedProjectRef | null) => void;
  close: (threadRef: ScopedThreadRef, projectRef?: ScopedProjectRef | null) => void;
  toggleVisibility: (threadRef: ScopedThreadRef, projectRef?: ScopedProjectRef | null) => void;
  toggle: (
    ref: ScopedThreadRef,
    kind: Exclude<RightPanelKind, "file" | "terminal" | "pull-request" | "preview">,
  ) => void;
  removeThread: (ref: ScopedThreadRef) => void;
  /** Move legacy thread-scoped browser/terminal surfaces into the project bag. */
  liftProjectToolsFromThread: (threadRef: ScopedThreadRef, projectRef: ScopedProjectRef) => void;
}

const EMPTY_PANEL_STATE: ThreadRightPanelState = {
  isOpen: false,
  activeSurfaceId: null,
  activeGeneration: 0,
  surfaces: [],
};

export function isProjectToolSurface(
  surface: RightPanelSurface,
): surface is Extract<RightPanelSurface, { kind: "preview" | "terminal" }> {
  return surface.kind === "preview" || surface.kind === "terminal";
}

export function browserSurfaceId(
  ownerThreadId: string,
  tabId: string,
): `browser:${string}` {
  return `browser:${ownerThreadId}:${tabId}`;
}

export function terminalSurfaceId(
  ownerThreadId: string,
  terminalId: string,
): `terminal:${string}` {
  return `terminal:${ownerThreadId}:${terminalId}`;
}

const singletonSurface = (
  kind: Exclude<RightPanelKind, "file" | "preview" | "terminal" | "pull-request">,
): RightPanelSurface => {
  switch (kind) {
    case "diff":
      return { id: "diff", kind };
    case "files":
      return { id: "files", kind };
    case "agents":
      return { id: "agents", kind };
  }
};

const browserSurface = (
  ownerThreadId: string,
  tabId: string | null,
): Extract<RightPanelSurface, { kind: "preview" }> =>
  tabId
    ? {
        id: browserSurfaceId(ownerThreadId, tabId),
        kind: "preview",
        resourceId: tabId,
        ownerThreadId,
      }
    : { id: "browser:new", kind: "preview", resourceId: null, ownerThreadId };

const fileSurface = (
  relativePath: string,
  revealLine: number | null,
  revealRequestId: number,
): RightPanelSurface => ({
  id: `file:${relativePath}`,
  kind: "file",
  relativePath,
  revealLine,
  revealRequestId,
});

const attachmentSurface = (attachment: ChatFileAttachment): RightPanelSurface => ({
  id: `attachment:${attachment.id}`,
  kind: "file",
  relativePath: attachment.name,
  revealLine: null,
  revealRequestId: 0,
  attachment,
});

const terminalSurface = (
  ownerThreadId: string,
  terminalId: string,
): Extract<RightPanelSurface, { kind: "terminal" }> => ({
  id: terminalSurfaceId(ownerThreadId, terminalId),
  kind: "terminal",
  resourceId: terminalId,
  terminalIds: [terminalId],
  activeTerminalId: terminalId,
  ownerThreadId,
});

export type PullRequestSurface = Extract<RightPanelSurface, { kind: "pull-request" }>;

export function pullRequestSurfaceId(target: {
  environmentId?: string;
  projectId: string;
  repository: string;
  number: number;
}): PullRequestSurface["id"] {
  // The environment leads the id where there is one, so the same change request read from two
  // servers is two tabs rather than one tab that changes its mind about which server it is on.
  const scope =
    target.environmentId === undefined ? "" : `${encodeURIComponent(target.environmentId)}:`;
  return `pull-request:${scope}${encodeURIComponent(target.projectId)}:${encodeURIComponent(target.repository)}:${target.number}`;
}

export function pullRequestSurface(target: {
  environmentId?: string;
  projectId: string;
  repository: string;
  number: number;
}): PullRequestSurface {
  return {
    id: pullRequestSurfaceId(target),
    kind: "pull-request",
    ...(target.environmentId === undefined ? {} : { environmentId: target.environmentId }),
    projectId: target.projectId,
    repository: target.repository,
    number: target.number,
  };
}

const upsertSurface = (
  current: ThreadRightPanelState,
  surface: RightPanelSurface,
  generation: number,
  activate = true,
): ThreadRightPanelState => ({
  isOpen: true,
  surfaces: current.surfaces.some((entry) => entry.id === surface.id)
    ? current.surfaces
    : [...current.surfaces, surface],
  activeSurfaceId: activate ? surface.id : current.activeSurfaceId,
  activeGeneration: activate ? generation : current.activeGeneration,
});

const bumpClock = (state: Pick<RightPanelStoreState, "activationClock">) =>
  state.activationClock + 1;

const updateBagBag = (
  bag: Record<string, ThreadRightPanelState>,
  key: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): Record<string, ThreadRightPanelState> => {
  const current = bag[key] ?? EMPTY_PANEL_STATE;
  const next = updater(current);
  if (!next.isOpen && next.activeSurfaceId === null && next.surfaces.length === 0) {
    if (!(key in bag)) return bag;
    const { [key]: _removed, ...rest } = bag;
    return rest;
  }
  if (next === current) return bag;
  return { ...bag, [key]: next };
};

function normalizeRevealLine(line: number | undefined): number | null {
  if (line === undefined || !Number.isFinite(line)) return null;
  return Math.max(1, Math.trunc(line));
}

function normalizeTerminalSurface(
  surface: RightPanelSurface,
  ownerThreadId: string | null,
): Extract<RightPanelSurface, { kind: "terminal" }> | null {
  if (surface.kind !== "terminal") return null;
  if (
    !("resourceId" in surface) ||
    typeof surface.resourceId !== "string" ||
    (surface.id !== `terminal:${surface.resourceId}` &&
      !(
        ownerThreadId !== null &&
        surface.id === terminalSurfaceId(ownerThreadId, surface.resourceId)
      ) &&
      !surface.id.startsWith("terminal:"))
  ) {
    // Accept legacy `terminal:${id}` and project-scoped `terminal:${owner}:${id}`.
    if (!surface.id.startsWith("terminal:")) return null;
    if (!("resourceId" in surface) || typeof surface.resourceId !== "string") return null;
  }
  const resolvedOwner =
    "ownerThreadId" in surface && typeof surface.ownerThreadId === "string"
      ? surface.ownerThreadId
      : ownerThreadId;
  if (resolvedOwner === null) return null;
  const terminalIds =
    "terminalIds" in surface && Array.isArray(surface.terminalIds)
      ? [
          ...new Set(
            surface.terminalIds.filter(
              (terminalId): terminalId is string => typeof terminalId === "string",
            ),
          ),
        ]
      : [surface.resourceId];
  const activeTerminalId =
    "activeTerminalId" in surface &&
    typeof surface.activeTerminalId === "string" &&
    terminalIds.includes(surface.activeTerminalId)
      ? surface.activeTerminalId
      : (terminalIds[0] ?? surface.resourceId);
  return {
    id: terminalSurfaceId(resolvedOwner, surface.resourceId),
    kind: "terminal",
    resourceId: surface.resourceId,
    terminalIds: terminalIds.length > 0 ? terminalIds : [surface.resourceId],
    activeTerminalId,
    ownerThreadId: resolvedOwner,
    ...("splitDirection" in surface && surface.splitDirection === "vertical"
      ? { splitDirection: "vertical" as const }
      : {}),
  };
}

function normalizePreviewSurface(
  surface: RightPanelSurface,
  ownerThreadId: string | null,
): Extract<RightPanelSurface, { kind: "preview" }> | null {
  if (surface.kind !== "preview") return null;
  const resolvedOwner =
    "ownerThreadId" in surface && typeof surface.ownerThreadId === "string"
      ? surface.ownerThreadId
      : ownerThreadId;
  if (resolvedOwner === null) return null;
  if (surface.id === "browser:new" || surface.resourceId === null) {
    return { id: "browser:new", kind: "preview", resourceId: null, ownerThreadId: resolvedOwner };
  }
  if (typeof surface.resourceId !== "string") return null;
  return {
    id: browserSurfaceId(resolvedOwner, surface.resourceId),
    kind: "preview",
    resourceId: surface.resourceId,
    ownerThreadId: resolvedOwner,
  };
}

function normalizePersistedSurfaces(
  surfaces: unknown,
  ownerThreadIdFromKey: string | null,
): RightPanelSurface[] {
  if (!Array.isArray(surfaces)) return [];
  return surfaces.flatMap<RightPanelSurface>((surface) => {
    if (!surface || typeof surface !== "object") return [];
    const kind = (surface as { kind?: string }).kind;
    // Dropped surface kind: plans now render inline in the transcript (v9).
    if (kind === "plan") return [];
    if (kind === "file") {
      const file = surface as Extract<RightPanelSurface, { kind: "file" }>;
      const revealLine =
        typeof file.revealLine === "number" && Number.isFinite(file.revealLine)
          ? Math.max(1, Math.trunc(file.revealLine))
          : null;
      const revealRequestId =
        typeof file.revealRequestId === "number" &&
        Number.isSafeInteger(file.revealRequestId) &&
        file.revealRequestId >= 0
          ? file.revealRequestId
          : 0;
      return [{ ...file, revealLine, revealRequestId }];
    }
    if (kind === "pull-request") {
      const pr = surface as PullRequestSurface;
      if (
        typeof pr.projectId !== "string" ||
        typeof pr.repository !== "string" ||
        typeof pr.number !== "number" ||
        !Number.isSafeInteger(pr.number) ||
        pr.number < 1
      ) {
        return [];
      }
      const { environmentId, ...rest } = pr;
      return [
        pullRequestSurface({
          ...rest,
          ...(typeof environmentId === "string" ? { environmentId } : {}),
        }),
      ];
    }
    if (kind === "preview") {
      const preview = normalizePreviewSurface(
        surface as RightPanelSurface,
        ownerThreadIdFromKey,
      );
      return preview ? [preview] : [];
    }
    if (kind === "terminal") {
      const terminal = normalizeTerminalSurface(
        surface as RightPanelSurface,
        ownerThreadIdFromKey,
      );
      return terminal ? [terminal] : [];
    }
    if (kind === "diff" || kind === "files" || kind === "agents") {
      return [surface as RightPanelSurface];
    }
    return [];
  });
}

function normalizePersistedPanelState(
  threadState: unknown,
  ownerThreadIdFromKey: string | null,
  keepProjectTools: boolean,
): ThreadRightPanelState | null {
  const validThreadState = threadState && typeof threadState === "object" ? threadState : null;
  if (!validThreadState) return null;
  const rawSurfaces = normalizePersistedSurfaces(
    (validThreadState as { surfaces?: unknown }).surfaces,
    ownerThreadIdFromKey,
  );
  const surfaces = keepProjectTools
    ? rawSurfaces.filter(isProjectToolSurface)
    : rawSurfaces.filter((surface) => !isProjectToolSurface(surface));
  const rawActiveSurfaceId = (validThreadState as { activeSurfaceId?: unknown }).activeSurfaceId;
  const persistedActiveSurfaceId = surfaces.some((surface) => surface.id === rawActiveSurfaceId)
    ? (rawActiveSurfaceId as string)
    : rawActiveSurfaceId === "pull-request"
      ? (surfaces.find((surface) => surface.kind === "pull-request")?.id ?? null)
      : null;
  const isOpen =
    surfaces.length > 0 &&
    (typeof (validThreadState as { isOpen?: unknown }).isOpen === "boolean"
      ? Boolean((validThreadState as { isOpen: boolean }).isOpen)
      : persistedActiveSurfaceId !== null);
  const activeSurfaceId =
    persistedActiveSurfaceId ?? (isOpen ? (surfaces[0]?.id ?? null) : null);
  const activeGeneration =
    typeof (validThreadState as { activeGeneration?: unknown }).activeGeneration === "number" &&
    Number.isSafeInteger((validThreadState as { activeGeneration: number }).activeGeneration)
      ? Math.max(0, (validThreadState as { activeGeneration: number }).activeGeneration)
      : 0;
  return { isOpen, surfaces, activeSurfaceId, activeGeneration };
}

export function migratePersistedRightPanelState(persistedState: unknown): {
  byThreadKey: Record<string, ThreadRightPanelState>;
  byProjectKey: Record<string, ProjectRightPanelState>;
  activationClock: number;
} {
  if (!persistedState || typeof persistedState !== "object") {
    return { byThreadKey: {}, byProjectKey: {}, activationClock: 0 };
  }

  const byThreadKey =
    "byThreadKey" in persistedState &&
    persistedState.byThreadKey &&
    typeof persistedState.byThreadKey === "object"
      ? Object.fromEntries(
          Object.entries(persistedState.byThreadKey as Record<string, unknown>)
            .filter(([threadKey]) => !isPullRequestsPanelKey(threadKey))
            .flatMap(([threadKey, threadState]) => {
              const ownerThreadId = threadKey.includes(":")
                ? threadKey.slice(threadKey.indexOf(":") + 1)
                : null;
              // Keep legacy browser/terminal on the thread bag until lift runs with a projectRef.
              const normalized = normalizePersistedPanelState(threadState, ownerThreadId, true);
              const threadOnly = normalizePersistedPanelState(threadState, ownerThreadId, false);
              if (!threadOnly && !normalized) return [];
              const legacyTools = normalized?.surfaces.filter(isProjectToolSurface) ?? [];
              const surfaces = [
                ...(threadOnly?.surfaces ?? []),
                // Temporarily retain tools on the thread bag for lift-on-visit.
                ...legacyTools,
              ];
              if (surfaces.length === 0 && !threadOnly?.isOpen && !normalized?.isOpen) {
                return [];
              }
              const activeSurfaceId =
                (threadOnly?.activeSurfaceId &&
                surfaces.some((surface) => surface.id === threadOnly.activeSurfaceId)
                  ? threadOnly.activeSurfaceId
                  : null) ??
                (normalized?.activeSurfaceId &&
                surfaces.some((surface) => surface.id === normalized.activeSurfaceId)
                  ? normalized.activeSurfaceId
                  : null) ??
                null;
              const isOpen =
                surfaces.length > 0 &&
                Boolean(threadOnly?.isOpen || normalized?.isOpen || activeSurfaceId !== null);
              return [
                [
                  threadKey,
                  {
                    isOpen,
                    surfaces,
                    activeSurfaceId:
                      activeSurfaceId ?? (isOpen ? (surfaces[0]?.id ?? null) : null),
                    activeGeneration: Math.max(
                      threadOnly?.activeGeneration ?? 0,
                      normalized?.activeGeneration ?? 0,
                    ),
                  } satisfies ThreadRightPanelState,
                ],
              ];
            }),
        )
      : {};

  const byProjectKey =
    "byProjectKey" in persistedState &&
    persistedState.byProjectKey &&
    typeof persistedState.byProjectKey === "object"
      ? Object.fromEntries(
          Object.entries(persistedState.byProjectKey as Record<string, unknown>).flatMap(
            ([projectKey, projectState]) => {
              const normalized = normalizePersistedPanelState(projectState, null, true);
              if (!normalized || normalized.surfaces.length === 0) return [];
              return [[projectKey, normalized]];
            },
          ),
        )
      : {};

  return { byThreadKey, byProjectKey, activationClock: 0 };
}

function findSurfaceBag(
  state: Pick<RightPanelStoreState, "byThreadKey" | "byProjectKey">,
  threadRef: ScopedThreadRef,
  surfaceId: string,
  projectRef?: ScopedProjectRef | null,
): "project" | "thread" | null {
  if (projectRef) {
    const projectState = state.byProjectKey[scopedProjectKey(projectRef)];
    if (projectState?.surfaces.some((surface) => surface.id === surfaceId)) return "project";
  }
  const threadState = state.byThreadKey[scopedThreadKey(threadRef)];
  if (threadState?.surfaces.some((surface) => surface.id === surfaceId)) return "thread";
  return null;
}

export function selectProjectRightPanelState(
  byProjectKey: Record<string, ProjectRightPanelState>,
  ref: ScopedProjectRef | null | undefined,
): ProjectRightPanelState {
  if (!ref) return EMPTY_PANEL_STATE;
  return byProjectKey[scopedProjectKey(ref)] ?? EMPTY_PANEL_STATE;
}

export function selectThreadRightPanelState(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): ThreadRightPanelState {
  if (!ref) return EMPTY_PANEL_STATE;
  return byThreadKey[scopedThreadKey(ref)] ?? EMPTY_PANEL_STATE;
}

export function selectComposedRightPanelState(
  byThreadKey: Record<string, ThreadRightPanelState>,
  byProjectKey: Record<string, ProjectRightPanelState>,
  threadRef: ScopedThreadRef | null | undefined,
  projectRef: ScopedProjectRef | null | undefined,
): ThreadRightPanelState {
  const threadState = selectThreadRightPanelState(byThreadKey, threadRef);
  const projectState = selectProjectRightPanelState(byProjectKey, projectRef);
  const threadSurfaces = threadState.surfaces.filter((surface) => !isProjectToolSurface(surface));
  // Prefer project-bag tools; also surface any not-yet-lifted tools still on the thread.
  const lingeringThreadTools = threadState.surfaces.filter(isProjectToolSurface);
  const projectToolIds = new Set(projectState.surfaces.map((surface) => surface.id));
  const surfaces = [
    ...projectState.surfaces,
    ...lingeringThreadTools.filter((surface) => !projectToolIds.has(surface.id)),
    ...threadSurfaces,
  ];

  const threadActive =
    threadState.activeSurfaceId &&
    surfaces.some((surface) => surface.id === threadState.activeSurfaceId)
      ? {
          id: threadState.activeSurfaceId,
          generation: threadState.activeGeneration,
        }
      : null;
  const projectActive =
    projectState.activeSurfaceId &&
    surfaces.some((surface) => surface.id === projectState.activeSurfaceId)
      ? {
          id: projectState.activeSurfaceId,
          generation: projectState.activeGeneration,
        }
      : null;

  let activeSurfaceId: string | null = null;
  if (threadActive && projectActive) {
    activeSurfaceId =
      projectActive.generation >= threadActive.generation ? projectActive.id : threadActive.id;
  } else {
    activeSurfaceId = projectActive?.id ?? threadActive?.id ?? null;
  }

  // Match upstream: the panel can open with zero surfaces (empty launcher). Do not
  // infer open from a leftover activeSurfaceId — close must be able to hide the panel.
  const isOpen = projectState.isOpen || threadState.isOpen;

  if (!isOpen) {
    return {
      isOpen: false,
      activeSurfaceId,
      activeGeneration: Math.max(threadState.activeGeneration, projectState.activeGeneration),
      surfaces,
    };
  }

  return {
    isOpen: true,
    surfaces,
    activeSurfaceId: activeSurfaceId ?? surfaces[0]?.id ?? null,
    activeGeneration: Math.max(threadState.activeGeneration, projectState.activeGeneration),
  };
}

export function selectActiveRightPanel(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
  byProjectKey: Record<string, ProjectRightPanelState> = {},
  projectRef?: ScopedProjectRef | null,
): RightPanelKind | null {
  const state = selectComposedRightPanelState(byThreadKey, byProjectKey, ref, projectRef);
  if (!state.isOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId)?.kind ?? null;
}

export function selectActiveRightPanelSurface(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
  byProjectKey: Record<string, ProjectRightPanelState> = {},
  projectRef?: ScopedProjectRef | null,
): RightPanelSurface | null {
  const state = selectComposedRightPanelState(byThreadKey, byProjectKey, ref, projectRef);
  if (!state.isOpen) return null;
  return selectSelectedRightPanelSurface(byThreadKey, ref, byProjectKey, projectRef);
}

/** The selected surface even while the panel is hidden, so a layout control can restore it. */
export function selectSelectedRightPanelSurface(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
  byProjectKey: Record<string, ProjectRightPanelState> = {},
  projectRef?: ScopedProjectRef | null,
): RightPanelSurface | null {
  const state = selectComposedRightPanelState(byThreadKey, byProjectKey, ref, projectRef);
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}

export function ownerThreadRefForSurface(
  surface: RightPanelSurface,
  fallbackThreadRef: ScopedThreadRef,
): ScopedThreadRef {
  if (!isProjectToolSurface(surface)) return fallbackThreadRef;
  return {
    environmentId: fallbackThreadRef.environmentId,
    threadId: surface.ownerThreadId as ScopedThreadRef["threadId"],
  };
}

export const useRightPanelStore = create<RightPanelStoreState>()(
  persist(
    (set) => ({
      byThreadKey: {},
      byProjectKey: {},
      activationClock: 0,
      open: (ref, kind) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(ref), (current) =>
              upsertSurface(current, singletonSurface(kind), generation),
            ),
          };
        }),
      openBrowser: (projectRef, ownerThreadRef, tabId) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byProjectKey: updateBagBag(
              state.byProjectKey,
              scopedProjectKey(projectRef),
              (current) => {
                const surface = browserSurface(ownerThreadRef.threadId, tabId);
                const withoutPlaceholder = tabId
                  ? current.surfaces.filter(
                      (entry) =>
                        !(
                          entry.kind === "preview" &&
                          entry.id === "browser:new" &&
                          entry.ownerThreadId === ownerThreadRef.threadId
                        ),
                    )
                  : current.surfaces;
                return upsertSurface(
                  { ...current, surfaces: withoutPlaceholder },
                  surface,
                  generation,
                );
              },
            ),
          };
        }),
      openPullRequest: (ref, target) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(ref), (current) =>
              upsertSurface(current, pullRequestSurface(target), generation),
            ),
          };
        }),
      openFile: (ref, relativePath, line) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
          activationClock: generation,
          byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const withoutStandaloneExplorer = current.surfaces.filter(
              (surface) => surface.kind !== "files",
            );
            const surfaceId = `file:${relativePath}` as const;
            const existing = withoutStandaloneExplorer.find(
              (surface): surface is Extract<RightPanelSurface, { kind: "file" }> =>
                surface.id === surfaceId && surface.kind === "file",
            );
            const surface = fileSurface(
              relativePath,
              normalizeRevealLine(line),
              (existing?.revealRequestId ?? 0) + 1,
            );
            return {
              isOpen: true,
              activeSurfaceId: surface.id,
              activeGeneration: generation,
              surfaces: existing
                ? withoutStandaloneExplorer.map((entry) =>
                    entry.id === surface.id ? surface : entry,
                  )
                : [...withoutStandaloneExplorer, surface],
              };
            }),
          };
        }),
      openAttachment: (ref, attachment) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(ref), (current) => {
              const withoutStandaloneExplorer = current.surfaces.filter(
                (surface) => surface.kind !== "files",
              );
              return upsertSurface(
                { ...current, surfaces: withoutStandaloneExplorer },
                attachmentSurface(attachment),
                generation,
              );
            }),
          };
        }),
      openTerminal: (projectRef, ownerThreadRef, terminalId) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byProjectKey: updateBagBag(
              state.byProjectKey,
              scopedProjectKey(projectRef),
              (current) =>
                upsertSurface(
                  current,
                  terminalSurface(ownerThreadRef.threadId, terminalId),
                  generation,
                ),
            ),
          };
        }),
      splitTerminal: (projectRef, surfaceId, terminalId, direction = "horizontal") =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byProjectKey: updateBagBag(
              state.byProjectKey,
              scopedProjectKey(projectRef),
              (current) => ({
                ...current,
                isOpen: true,
                activeSurfaceId: surfaceId,
                activeGeneration: generation,
                surfaces: current.surfaces.map((surface) => {
                  if (surface.id !== surfaceId || surface.kind !== "terminal") return surface;
                  const { splitDirection: _splitDirection, ...baseSurface } = surface;
                  return {
                    ...baseSurface,
                    terminalIds: surface.terminalIds.includes(terminalId)
                      ? surface.terminalIds
                      : [...surface.terminalIds, terminalId],
                    activeTerminalId: terminalId,
                    ...(direction === "vertical" ? { splitDirection: "vertical" as const } : {}),
                  };
                }),
              }),
            ),
          };
        }),
      activateTerminal: (projectRef, surfaceId, terminalId) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byProjectKey: updateBagBag(
              state.byProjectKey,
              scopedProjectKey(projectRef),
              (current) => ({
                ...current,
                activeSurfaceId: surfaceId,
                activeGeneration: generation,
                surfaces: current.surfaces.map((surface) =>
                  surface.id === surfaceId &&
                  surface.kind === "terminal" &&
                  surface.terminalIds.includes(terminalId)
                    ? { ...surface, activeTerminalId: terminalId }
                    : surface,
                ),
              }),
            ),
          };
        }),
      closeTerminal: (projectRef, surfaceId, terminalId) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byProjectKey: updateBagBag(
              state.byProjectKey,
              scopedProjectKey(projectRef),
              (current) => {
                const surface = current.surfaces.find(
                  (entry) => entry.id === surfaceId && entry.kind === "terminal",
                );
                if (!surface || surface.kind !== "terminal") return current;
                const terminalIds = surface.terminalIds.filter((id) => id !== terminalId);
                if (terminalIds.length === 0) {
                  const index = current.surfaces.findIndex((entry) => entry.id === surfaceId);
                  const surfaces = current.surfaces.filter((entry) => entry.id !== surfaceId);
                  const fallback = surfaces[Math.min(index, surfaces.length - 1)] ?? null;
                  return {
                    ...current,
                    isOpen: surfaces.length > 0 && current.isOpen,
                    surfaces,
                    activeSurfaceId:
                      current.activeSurfaceId === surfaceId
                        ? (fallback?.id ?? null)
                        : current.activeSurfaceId,
                    activeGeneration:
                      current.activeSurfaceId === surfaceId
                        ? generation
                        : current.activeGeneration,
                  };
                }
                return {
                  ...current,
                  surfaces: current.surfaces.map((entry) =>
                    entry.id === surfaceId && entry.kind === "terminal"
                      ? {
                          ...entry,
                          terminalIds,
                          activeTerminalId:
                            entry.activeTerminalId === terminalId
                              ? (terminalIds.at(-1) ?? terminalIds[0]!)
                              : entry.activeTerminalId,
                        }
                      : entry,
                  ),
                };
              },
            ),
          };
        }),
      activateSurface: (threadRef, surfaceId, projectRef) =>
        set((state) => {
          const generation = bumpClock(state);
          const bag = findSurfaceBag(state, threadRef, surfaceId, projectRef);
          if (bag === "project" && projectRef) {
            return {
              activationClock: generation,
              byProjectKey: updateBagBag(
                state.byProjectKey,
                scopedProjectKey(projectRef),
                (current) =>
                  current.surfaces.some((surface) => surface.id === surfaceId)
                    ? {
                        ...current,
                        isOpen: true,
                        activeSurfaceId: surfaceId,
                        activeGeneration: generation,
                      }
                    : current,
              ),
            };
          }
          if (bag === "thread") {
            return {
              activationClock: generation,
              byThreadKey: updateBagBag(
                state.byThreadKey,
                scopedThreadKey(threadRef),
                (current) =>
                  current.surfaces.some((surface) => surface.id === surfaceId)
                    ? {
                        ...current,
                        isOpen: true,
                        activeSurfaceId: surfaceId,
                        activeGeneration: generation,
                      }
                    : current,
              ),
            };
          }
          return state;
        }),
      closeSurface: (threadRef, surfaceId, projectRef) =>
        set((state) => {
          const generation = bumpClock(state);
          const closeInBag = (current: ThreadRightPanelState): ThreadRightPanelState => {
            const index = current.surfaces.findIndex((surface) => surface.id === surfaceId);
            if (index < 0) return current;
            const surfaces = current.surfaces.filter((surface) => surface.id !== surfaceId);
            if (current.activeSurfaceId !== surfaceId) {
              return { ...current, isOpen: surfaces.length > 0 && current.isOpen, surfaces };
            }
            const fallback = surfaces[Math.min(index, surfaces.length - 1)] ?? null;
            return {
              ...current,
              isOpen: surfaces.length > 0 && current.isOpen,
              surfaces,
              activeSurfaceId: fallback?.id ?? null,
              activeGeneration: generation,
            };
          };
          const bag = findSurfaceBag(state, threadRef, surfaceId, projectRef);
          if (bag === "project" && projectRef) {
            return {
              activationClock: generation,
              byProjectKey: updateBagBag(
                state.byProjectKey,
                scopedProjectKey(projectRef),
                closeInBag,
              ),
            };
          }
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), closeInBag),
          };
        }),
      closeOtherSurfaces: (threadRef, surfaceId, projectRef) =>
        set((state) => {
          const generation = bumpClock(state);
          const composedPanel = selectComposedRightPanelState(
            state.byThreadKey,
            state.byProjectKey,
            threadRef,
            projectRef,
          );
          const surface = composedPanel.surfaces.find((entry) => entry.id === surfaceId);
          if (!surface || composedPanel.surfaces.length === 1) return state;
          const keepProject = isProjectToolSurface(surface);
          return {
            activationClock: generation,
            byProjectKey:
              projectRef && keepProject
                ? updateBagBag(state.byProjectKey, scopedProjectKey(projectRef), (current) => ({
                    ...current,
                    isOpen: true,
                    surfaces: [surface],
                    activeSurfaceId: surface.id,
                    activeGeneration: generation,
                  }))
                : projectRef
                  ? updateBagBag(state.byProjectKey, scopedProjectKey(projectRef), (current) => ({
                      ...current,
                      isOpen: false,
                      surfaces: [],
                      activeSurfaceId: null,
                    }))
                  : state.byProjectKey,
            byThreadKey: keepProject
              ? updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) => ({
                  ...current,
                  isOpen: false,
                  surfaces: current.surfaces.filter(isProjectToolSurface),
                  activeSurfaceId: null,
                }))
              : updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) => ({
                  ...current,
                  isOpen: true,
                  surfaces: [surface],
                  activeSurfaceId: surface.id,
                  activeGeneration: generation,
                })),
          };
        }),
      closeSurfacesToRight: (threadRef, surfaceId, projectRef) =>
        set((state) => {
          const composedPanel = selectComposedRightPanelState(
            state.byThreadKey,
            state.byProjectKey,
            threadRef,
            projectRef,
          );
          const index = composedPanel.surfaces.findIndex((surface) => surface.id === surfaceId);
          if (index < 0 || index === composedPanel.surfaces.length - 1) return state;
          const kept = new Set<string>(
            composedPanel.surfaces.slice(0, index + 1).map((surface) => surface.id),
          );
          const filterKept = (surfaces: RightPanelSurface[]) =>
            surfaces.filter((surface) => kept.has(surface.id));
          return {
            byProjectKey: projectRef
              ? updateBagBag(state.byProjectKey, scopedProjectKey(projectRef), (current) => {
                  const surfaces = filterKept(current.surfaces);
                  const activeStillExists = surfaces.some(
                    (surface) => surface.id === current.activeSurfaceId,
                  );
                  return {
                    ...current,
                    surfaces,
                    isOpen: surfaces.length > 0 && current.isOpen,
                    activeSurfaceId: activeStillExists
                      ? current.activeSurfaceId
                      : kept.has(surfaceId)
                        ? surfaceId
                        : (surfaces[0]?.id ?? null),
                  };
                })
              : state.byProjectKey,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) => {
              const surfaces = filterKept(current.surfaces);
              const activeStillExists = surfaces.some(
                (surface) => surface.id === current.activeSurfaceId,
              );
              return {
                ...current,
                surfaces,
                isOpen: surfaces.length > 0 && current.isOpen,
                activeSurfaceId: activeStillExists
                  ? current.activeSurfaceId
                  : kept.has(surfaceId)
                    ? surfaceId
                    : (surfaces[0]?.id ?? null),
              };
            }),
          };
        }),
      closeAllSurfaces: (threadRef, projectRef) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) =>
              current.surfaces.length === 0
                ? current
                : {
                    ...current,
                    isOpen: false,
                    surfaces: [],
                    activeSurfaceId: null,
                    activeGeneration: generation,
                  },
            ),
            byProjectKey: projectRef
              ? updateBagBag(state.byProjectKey, scopedProjectKey(projectRef), (current) =>
                  current.surfaces.length === 0
                    ? current
                    : {
                        ...current,
                        isOpen: false,
                        surfaces: [],
                        activeSurfaceId: null,
                        activeGeneration: generation,
                      },
                )
              : state.byProjectKey,
          };
        }),
      reconcileBrowserSurfaces: (projectRef, ownerThreadRef, tabIds) =>
        set((state) => {
          const projectKey = scopedProjectKey(projectRef);
          const current = state.byProjectKey[projectKey] ?? EMPTY_PANEL_STATE;
          const validIds = new Set(
            tabIds.map((tabId) => browserSurfaceId(ownerThreadRef.threadId, tabId)),
          );
          const otherSurfaces = current.surfaces.filter(
            (surface) =>
              !(surface.kind === "preview" && surface.ownerThreadId === ownerThreadRef.threadId),
          );
          const existingBrowser = current.surfaces.filter(
            (
              surface,
            ): surface is Extract<RightPanelSurface, { kind: "preview"; resourceId: string }> =>
              surface.kind === "preview" &&
              surface.ownerThreadId === ownerThreadRef.threadId &&
              surface.id !== "browser:new" &&
              surface.resourceId !== null &&
              validIds.has(surface.id),
          );
          const knownIds = new Set(existingBrowser.map((surface) => surface.id));
          const added = tabIds
            .filter((tabId) => !knownIds.has(browserSurfaceId(ownerThreadRef.threadId, tabId)))
            .map((tabId) => browserSurface(ownerThreadRef.threadId, tabId));
          const surfaces = [...otherSurfaces, ...existingBrowser, ...added];
          const removedOwnerBrowser =
            current.surfaces.length - otherSurfaces.length - existingBrowser.length;
          if (added.length === 0 && removedOwnerBrowser === 0) {
            return state;
          }
          const activeStillExists = surfaces.some(
            (surface) => surface.id === current.activeSurfaceId,
          );
          const fallbackBrowser = surfaces.find((surface) => surface.kind === "preview");
          return {
            byProjectKey: updateBagBag(state.byProjectKey, projectKey, () => ({
              ...current,
              surfaces,
              activeSurfaceId: activeStillExists
                ? current.activeSurfaceId
                : (fallbackBrowser?.id ?? surfaces[0]?.id ?? null),
            })),
          };
        }),
      reconcileFileSurfaces: (ref, workspaceAvailable) =>
        set((state) => ({
          byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(ref), (current) => {
            if (workspaceAvailable) return current;
            const surfaces = current.surfaces.filter(
              (surface) =>
                surface.kind !== "files" &&
                (surface.kind !== "file" || surface.attachment !== undefined),
            );
            if (surfaces.length === current.surfaces.length) return current;
            const activeStillExists = surfaces.some(
              (surface) => surface.id === current.activeSurfaceId,
            );
            return {
              ...current,
              isOpen: surfaces.length > 0 ? current.isOpen : false,
              surfaces,
              activeSurfaceId: activeStillExists
                ? current.activeSurfaceId
                : (surfaces.at(-1)?.id ?? null),
            };
          }),
        })),
      show: (threadRef, projectRef) =>
        set((state) => {
          const generation = bumpClock(state);
          const composedPanel = selectComposedRightPanelState(
            state.byThreadKey,
            state.byProjectKey,
            threadRef,
            projectRef,
          );
          if (composedPanel.isOpen) return state;
          const selected = composedPanel.surfaces.find(
            (surface) => surface.id === composedPanel.activeSurfaceId,
          );
          if (selected && isProjectToolSurface(selected) && projectRef) {
            return {
              activationClock: generation,
              byProjectKey: updateBagBag(
                state.byProjectKey,
                scopedProjectKey(projectRef),
                (current) =>
                  current.isOpen
                    ? current
                    : {
                        ...current,
                        isOpen: true,
                        activeGeneration: generation,
                      },
              ),
            };
          }
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) =>
              current.isOpen
                ? current
                : { ...current, isOpen: true, activeGeneration: generation },
            ),
          };
        }),
      close: (threadRef, projectRef) =>
        set((state) => ({
          byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) =>
            current.isOpen ? { ...current, isOpen: false } : current,
          ),
          byProjectKey: projectRef
            ? updateBagBag(state.byProjectKey, scopedProjectKey(projectRef), (current) =>
                current.isOpen ? { ...current, isOpen: false } : current,
              )
            : state.byProjectKey,
        })),
      toggleVisibility: (threadRef, projectRef) =>
        set((state) => {
          const generation = bumpClock(state);
          const composedPanel = selectComposedRightPanelState(
            state.byThreadKey,
            state.byProjectKey,
            threadRef,
            projectRef,
          );
          if (composedPanel.isOpen) {
            return {
              byThreadKey: updateBagBag(
                state.byThreadKey,
                scopedThreadKey(threadRef),
                (current) => ({ ...current, isOpen: false }),
              ),
              byProjectKey: projectRef
                ? updateBagBag(state.byProjectKey, scopedProjectKey(projectRef), (current) => ({
                    ...current,
                    isOpen: false,
                  }))
                : state.byProjectKey,
            };
          }
          const selected = composedPanel.surfaces.find(
            (surface) => surface.id === composedPanel.activeSurfaceId,
          );
          if (selected && isProjectToolSurface(selected) && projectRef) {
            return {
              activationClock: generation,
              byProjectKey: updateBagBag(
                state.byProjectKey,
                scopedProjectKey(projectRef),
                (current) => ({
                  ...current,
                  isOpen: true,
                  activeGeneration: generation,
                }),
              ),
            };
          }
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(threadRef), (current) => ({
              ...current,
              isOpen: true,
              activeGeneration: generation,
            })),
          };
        }),
      toggle: (ref, kind) =>
        set((state) => {
          const generation = bumpClock(state);
          return {
            activationClock: generation,
            byThreadKey: updateBagBag(state.byThreadKey, scopedThreadKey(ref), (current) => {
              const active = current.surfaces.find(
                (surface) => surface.id === current.activeSurfaceId,
              );
              if (current.isOpen && active?.kind === kind) {
                return { ...current, isOpen: false };
              }
              return upsertSurface(current, singletonSurface(kind), generation);
            }),
          };
        }),
      removeThread: (ref) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          const nextByThreadKey =
            threadKey in state.byThreadKey
              ? (() => {
                  const { [threadKey]: _removed, ...rest } = state.byThreadKey;
                  return rest;
                })()
              : state.byThreadKey;
          const nextByProjectKey = Object.fromEntries(
            Object.entries(state.byProjectKey).flatMap(([projectKey, projectState]) => {
              const surfaces = projectState.surfaces.filter(
                (surface) =>
                  !isProjectToolSurface(surface) || surface.ownerThreadId !== ref.threadId,
              );
              if (surfaces.length === 0) return [];
              const activeStillExists = surfaces.some(
                (surface) => surface.id === projectState.activeSurfaceId,
              );
              return [
                [
                  projectKey,
                  {
                    ...projectState,
                    surfaces,
                    isOpen: surfaces.length > 0 && projectState.isOpen,
                    activeSurfaceId: activeStillExists
                      ? projectState.activeSurfaceId
                      : (surfaces[0]?.id ?? null),
                  } satisfies ProjectRightPanelState,
                ],
              ];
            }),
          );
          return { byThreadKey: nextByThreadKey, byProjectKey: nextByProjectKey };
        }),
      liftProjectToolsFromThread: (threadRef, projectRef) =>
        set((state) => {
          const threadKey = scopedThreadKey(threadRef);
          const projectKey = scopedProjectKey(projectRef);
          const threadState = state.byThreadKey[threadKey];
          if (!threadState) return state;
          const tools = threadState.surfaces.filter(isProjectToolSurface);
          if (tools.length === 0) return state;
          const stampedTools = tools.map((surface) => {
            if (surface.kind === "preview") {
              return normalizePreviewSurface(surface, threadRef.threadId) ?? surface;
            }
            return normalizeTerminalSurface(surface, threadRef.threadId) ?? surface;
          });
          const threadSurfaces = threadState.surfaces.filter(
            (surface) => !isProjectToolSurface(surface),
          );
          const projectState = state.byProjectKey[projectKey] ?? EMPTY_PANEL_STATE;
          const existingIds = new Set(projectState.surfaces.map((surface) => surface.id));
          const mergedProjectSurfaces = [
            ...projectState.surfaces,
            ...stampedTools.filter((surface) => !existingIds.has(surface.id)),
          ];
          const liftedActive =
            threadState.activeSurfaceId &&
            stampedTools.some((surface) => surface.id === threadState.activeSurfaceId)
              ? threadState.activeSurfaceId
              : null;
          return {
            byThreadKey: updateBagBag(state.byThreadKey, threadKey, (current) => ({
              ...current,
              surfaces: threadSurfaces,
              activeSurfaceId:
                current.activeSurfaceId &&
                threadSurfaces.some((surface) => surface.id === current.activeSurfaceId)
                  ? current.activeSurfaceId
                  : (threadSurfaces[0]?.id ?? null),
              isOpen:
                threadSurfaces.length > 0 &&
                current.isOpen &&
                !(liftedActive !== null && current.activeSurfaceId === liftedActive),
            })),
            byProjectKey: updateBagBag(state.byProjectKey, projectKey, (current) => ({
              ...current,
              surfaces: mergedProjectSurfaces,
              isOpen: current.isOpen || Boolean(liftedActive) || threadState.isOpen,
              activeSurfaceId:
                liftedActive ?? current.activeSurfaceId ?? mergedProjectSurfaces[0]?.id ?? null,
              activeGeneration: Math.max(
                current.activeGeneration,
                liftedActive ? threadState.activeGeneration : current.activeGeneration,
              ),
            })),
          };
        }),
    }),
    {
      name: RIGHT_PANEL_STORAGE_KEY,
      version: RIGHT_PANEL_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        byThreadKey: Object.fromEntries(
          Object.entries(state.byThreadKey).filter(
            ([threadKey]) => !isPullRequestsPanelKey(threadKey),
          ),
        ),
        byProjectKey: state.byProjectKey,
      }),
      migrate: migratePersistedRightPanelState,
    },
  ),
);
