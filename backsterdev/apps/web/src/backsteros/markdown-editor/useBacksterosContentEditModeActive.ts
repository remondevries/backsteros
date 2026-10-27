import { useSyncExternalStore } from "react";

import {
  isBacksterosContentEditModeActive,
  subscribeBacksterosContentEditMode,
} from "./contentViewMode";

/** Reactive: true while a visible BacksterOS markdown surface is in Edit mode. */
export function useBacksterosContentEditModeActive(): boolean {
  return useSyncExternalStore(
    subscribeBacksterosContentEditMode,
    isBacksterosContentEditModeActive,
    () => false,
  );
}
