import { create } from "zustand";

/**
 * One-shot focus requests for the chat composer after opening a BacksterOS
 * task via Enter (or click). ChatView consumes `requestId` and focuses.
 */
type BacksterosComposerFocusState = {
  readonly requestId: number;
  readonly requestFocus: () => void;
};

export const useBacksterosComposerFocusStore = create<BacksterosComposerFocusState>((set) => ({
  requestId: 0,
  requestFocus: () => set((state) => ({ requestId: state.requestId + 1 })),
}));

/**
 * One-shot focus requests for the chat composer after opening a BacksterOS
 * task via Enter (or click). ChatView consumes `requestId` and focuses.
 * Multiple bumps are OK — the composer may mount a few frames after navigate.
 */
export function requestBacksterosComposerFocus(): void {
  useBacksterosComposerFocusStore.getState().requestFocus();
}

/** Focus now and again after navigate/mount settles. */
export function requestBacksterosComposerFocusSoon(): void {
  requestBacksterosComposerFocus();
  queueMicrotask(() => requestBacksterosComposerFocus());
  window.setTimeout(() => requestBacksterosComposerFocus(), 50);
  window.setTimeout(() => requestBacksterosComposerFocus(), 200);
}
