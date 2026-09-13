import { useParams } from "@tanstack/react-router";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useEffect, useMemo, useRef } from "react";

import { resolveSidebarThreadStatus } from "~/components/Sidebar.logic";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useThreadShells } from "~/state/entities";
import {
  resolveActiveThreadRouteRef,
  resolveThreadRouteTarget,
} from "~/threadRoutes";

import {
  playAgentFinishedSound,
  shouldPlayAgentFinishedSound,
  unlockAgentFinishedSound,
} from "../agentFinishedSound";

/**
 * Plays {@link playAgentFinishedSound} when any thread leaves the Working
 * state for Ready or Failed (agent finished). Skips the initial mount so
 * already-idle threads do not chime on load. Skips when the user already has
 * that chat focused in a visible window.
 */
export function useAgentFinishedSound(): void {
  const shells = useThreadShells();
  const previousWorkingKeysRef = useRef<ReadonlySet<string> | null>(null);
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeDraftThread = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const activeThreadKey = useMemo(() => {
    const threadRef = resolveActiveThreadRouteRef(routeTarget, routeDraftThread);
    if (threadRef) return scopedThreadKey(threadRef);
    if (routeTarget?.kind === "draft" && routeDraftThread) {
      return scopedThreadKey({
        environmentId: routeDraftThread.environmentId,
        threadId: routeDraftThread.threadId,
      });
    }
    return null;
  }, [routeDraftThread, routeTarget]);
  const activeThreadKeyRef = useRef(activeThreadKey);
  activeThreadKeyRef.current = activeThreadKey;

  useEffect(() => {
    const unlock = () => unlockAgentFinishedSound();
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const workingKeys = new Set<string>();
    for (const shell of shells) {
      if (resolveSidebarThreadStatus(shell) === "working") {
        workingKeys.add(`${shell.environmentId}:${shell.id}`);
      }
    }

    const previous = previousWorkingKeysRef.current;
    previousWorkingKeysRef.current = workingKeys;
    if (previous == null) return;

    for (const key of previous) {
      if (workingKeys.has(key)) continue;
      const sep = key.indexOf(":");
      if (sep <= 0) continue;
      const environmentId = key.slice(0, sep);
      const threadId = key.slice(sep + 1);
      const shell = shells.find(
        (entry) => entry.environmentId === environmentId && entry.id === threadId,
      );
      if (!shell) continue;
      const status = resolveSidebarThreadStatus(shell);
      // Ready = turn done; failed = agent stopped with an error. Both are
      // "finished working" from the user's point of view.
      if (status !== "ready" && status !== "failed") continue;
      if (
        !shouldPlayAgentFinishedSound({
          finishedThreadKey: key,
          activeThreadKey: activeThreadKeyRef.current,
        })
      ) {
        continue;
      }
      playAgentFinishedSound();
      return;
    }
  }, [shells]);
}
