import { scopeProjectRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";

import { readThreadShell } from "~/state/entities";

import { useRightPanelStore } from "./rightPanelStore";

/** Resolve the codebase/project a thread belongs to for project-scoped tools. */
export function resolveProjectRefForThread(
  threadRef: ScopedThreadRef,
  projectRef?: ScopedProjectRef | null,
): ScopedProjectRef | null {
  if (projectRef) return projectRef;
  const shell = readThreadShell(threadRef);
  if (!shell) return null;
  return scopeProjectRef(threadRef.environmentId, shell.projectId);
}

export function openBrowserForThread(
  threadRef: ScopedThreadRef,
  tabId: string | null,
  projectRef?: ScopedProjectRef | null,
): boolean {
  const resolved = resolveProjectRefForThread(threadRef, projectRef);
  if (!resolved) return false;
  useRightPanelStore.getState().openBrowser(resolved, threadRef, tabId);
  return true;
}

export function openTerminalForThread(
  threadRef: ScopedThreadRef,
  terminalId: string,
  projectRef?: ScopedProjectRef | null,
): boolean {
  const resolved = resolveProjectRefForThread(threadRef, projectRef);
  if (!resolved) return false;
  useRightPanelStore.getState().openTerminal(resolved, threadRef, terminalId);
  return true;
}

export function reconcileBrowserSurfacesForThread(
  threadRef: ScopedThreadRef,
  tabIds: readonly string[],
  projectRef?: ScopedProjectRef | null,
): boolean {
  const resolved = resolveProjectRefForThread(threadRef, projectRef);
  if (!resolved) return false;
  useRightPanelStore.getState().reconcileBrowserSurfaces(resolved, threadRef, tabIds);
  return true;
}

export function liftProjectToolsIfNeeded(
  threadRef: ScopedThreadRef,
  projectRef?: ScopedProjectRef | null,
): void {
  const resolved = resolveProjectRefForThread(threadRef, projectRef);
  if (!resolved) return;
  const threadState = useRightPanelStore.getState().byThreadKey[scopedThreadKey(threadRef)];
  if (!threadState?.surfaces.some((surface) => surface.kind === "preview" || surface.kind === "terminal")) {
    return;
  }
  useRightPanelStore.getState().liftProjectToolsFromThread(threadRef, resolved);
}
