import { requireOptionalNativeModule } from "expo";

/**
 * Local event shapes — avoid importing from `expo-key-event` at all when the
 * native module is missing (that package `console.error`s before rethrowing,
 * which still paints LogBox even inside try/catch).
 */
export type KeyPressEvent = {
  eventType: "press" | "release" | string;
  key: string;
  character?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type KeyReleaseEvent = KeyPressEvent;

type KeyEventListener = (event: KeyPressEvent | KeyReleaseEvent) => void;

type UseKeyEventListener = (
  listener: KeyEventListener,
  options?: { listenOnMount?: boolean; captureModifiers?: boolean },
) => void;

const noopListener: UseKeyEventListener = () => {};

type ExpoKeyEventNative = {
  startListening: () => void;
  stopListening: () => void;
  __backsterosRefCounted?: boolean;
};

/**
 * expo-key-event's hook calls `stopListening()` on every unmount. That removes
 * the native keyboard view globally, so when one shortcut hook unmounts (e.g.
 * list j/k on tab switch) Go-nav / Escape / other listeners go silent.
 * Ref-count start/stop so the native listener stays up while any hook is live.
 */
function installStartStopRefCounting(native: ExpoKeyEventNative): void {
  if (native.__backsterosRefCounted) return;
  let count = 0;
  const rawStart = native.startListening.bind(native);
  const rawStop = native.stopListening.bind(native);
  native.startListening = () => {
    count += 1;
    if (count === 1) rawStart();
  };
  native.stopListening = () => {
    count = Math.max(0, count - 1);
    if (count === 0) rawStop();
  };
  native.__backsterosRefCounted = true;
}

/**
 * Hardware-keyboard shortcuts (iPad Magic Keyboard, etc.). No-ops when the
 * ExpoKeyEvent native module is not in this binary (common on phone builds
 * that predate the pod, or Expo Go).
 */
const useKeyEventListenerSafe: UseKeyEventListener = (() => {
  const native = requireOptionalNativeModule(
    "ExpoKeyEvent",
  ) as ExpoKeyEventNative | null;
  if (!native) {
    return noopListener;
  }
  try {
    installStartStopRefCounting(native);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-key-event") as {
      useKeyEventListener: UseKeyEventListener;
    };
    return mod.useKeyEventListener;
  } catch {
    return noopListener;
  }
})();

export function useKeyEventListener(
  listener: KeyEventListener,
  options?: { listenOnMount?: boolean; captureModifiers?: boolean },
) {
  useKeyEventListenerSafe(listener, options);
}
