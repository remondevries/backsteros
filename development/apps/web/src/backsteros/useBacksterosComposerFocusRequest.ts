import { useEffect, useRef } from "react";

import { useBacksterosComposerFocusStore } from "./composerFocusStore";
import { useBacksterosTaskKickoffGateStore } from "./taskKickoffGateStore";

type ComposerFocusHandle = {
  focusAtEnd: () => void;
} | null;

/**
 * After reopening a BacksterOS task chat, focus the composer once it mounts.
 * Skips the Start / Advanced kickoff gate so the polished first-chat page stays
 * intact until the user explicitly chooses Advanced or Start working.
 */
export function useBacksterosComposerFocusRequest(options: {
  readonly composerRef: {
    readonly current: ComposerFocusHandle;
  };
  readonly focusComposer: () => void;
  readonly activeBacksterosTaskId: string | null | undefined;
}): void {
  const { composerRef, focusComposer, activeBacksterosTaskId } = options;

  const requestId = useBacksterosComposerFocusStore((state) => state.requestId);

  const activeBacksterosTaskIdRef = useRef(activeBacksterosTaskId);
  activeBacksterosTaskIdRef.current = activeBacksterosTaskId;
  const focusComposerRef = useRef(focusComposer);
  focusComposerRef.current = focusComposer;
  const composerRefStable = useRef(composerRef);
  composerRefStable.current = composerRef;

  useEffect(() => {
    if (requestId === 0) return;

    let attempts = 0;
    let frame = 0;
    let cancelled = false;
    const tryFocus = () => {
      if (cancelled) return;
      attempts += 1;

      const taskId = activeBacksterosTaskIdRef.current;
      if (taskId) {
        const gate = useBacksterosTaskKickoffGateStore.getState().getGate(taskId);
        // Gate UI owns the first page — do not auto-reveal Advanced or steal focus.
        if (gate?.mode === "gate" || gate?.mode === "pending-send") {
          return;
        }
      }

      const handle = composerRefStable.current.current;
      if (handle) {
        focusComposerRef.current();
        return;
      }
      if (attempts < 45) {
        frame = window.requestAnimationFrame(tryFocus);
      }
    };
    frame = window.requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [requestId]);
}
