import { useEffect, useRef } from "react";

import { useBacksterosComposerFocusStore } from "./composerFocusStore";
import { useBacksterosTaskKickoffGateStore } from "./taskKickoffGateStore";
import type { DraftId } from "~/composerDraftStore";

type ComposerFocusHandle = {
  focusAtEnd: () => void;
  resetCursorState?: (options: { prompt: string; cursor: number }) => void;
} | null;

/**
 * After opening a BacksterOS task, focus the chat composer once it mounts.
 * Reveals a kickoff "gate" into advanced mode so the message box is present.
 */
export function useBacksterosComposerFocusRequest(options: {
  readonly composerRef: {
    readonly current: ComposerFocusHandle;
  };
  readonly focusComposer: () => void;
  readonly activeBacksterosTaskId: string | null | undefined;
  readonly draftId: DraftId | string | null | undefined;
  readonly setComposerDraftPrompt: (draftId: DraftId | string, prompt: string) => void;
  readonly setBacksterosKickoffMode: (
    taskId: string,
    mode: "gate" | "advanced" | "pending-send",
  ) => void;
  readonly promptRef: { current: string };
}): void {
  const {
    composerRef,
    focusComposer,
    activeBacksterosTaskId,
    draftId,
    setComposerDraftPrompt,
    setBacksterosKickoffMode,
    promptRef,
  } = options;

  const requestId = useBacksterosComposerFocusStore((state) => state.requestId);

  const activeBacksterosTaskIdRef = useRef(activeBacksterosTaskId);
  activeBacksterosTaskIdRef.current = activeBacksterosTaskId;
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const setComposerDraftPromptRef = useRef(setComposerDraftPrompt);
  setComposerDraftPromptRef.current = setComposerDraftPrompt;
  const setBacksterosKickoffModeRef = useRef(setBacksterosKickoffMode);
  setBacksterosKickoffModeRef.current = setBacksterosKickoffMode;
  const promptRefStable = useRef(promptRef);
  promptRefStable.current = promptRef;
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
      const currentDraftId = draftIdRef.current;
      const handle = composerRefStable.current.current;

      if (taskId && currentDraftId) {
        const gate = useBacksterosTaskKickoffGateStore.getState().getGate(taskId);
        if (gate?.mode === "gate") {
          const text = gate.kickoffPrompt;
          setComposerDraftPromptRef.current(currentDraftId, text);
          promptRefStable.current.current = text;
          setBacksterosKickoffModeRef.current(taskId, "advanced");
          handle?.resetCursorState?.({
            prompt: text,
            cursor: text.length,
          });
        }
      }

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
