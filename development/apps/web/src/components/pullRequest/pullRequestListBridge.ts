import { useSyncExternalStore, type ReactNode, type RefObject } from "react";

export type PullRequestListBridgeValue = {
  readonly searchInput: ReactNode;
  readonly sortMenu: ReactNode;
  readonly filtersMenu: ReactNode;
  readonly listBody: ReactNode;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
};

let bridge: PullRequestListBridgeValue | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Page publishes list chrome + rows; the Git sidebar renders them. */
export function publishPullRequestListBridge(next: PullRequestListBridgeValue | null): void {
  bridge = next;
  emit();
}

export function subscribePullRequestListBridge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPullRequestListBridge(): PullRequestListBridgeValue | null {
  return bridge;
}

export function usePullRequestListBridge(): PullRequestListBridgeValue | null {
  return useSyncExternalStore(subscribePullRequestListBridge, getPullRequestListBridge, () => null);
}
