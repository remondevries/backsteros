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

function bridgeFieldsEqual(
  previous: PullRequestListBridgeValue | null,
  next: PullRequestListBridgeValue | null,
): boolean {
  if (previous === next) return true;
  if (previous === null || next === null) return false;
  return (
    previous.searchInput === next.searchInput &&
    previous.sortMenu === next.sortMenu &&
    previous.filtersMenu === next.filtersMenu &&
    previous.listBody === next.listBody &&
    previous.scrollRef === next.scrollRef
  );
}

/** Page publishes list chrome + rows; the Git sidebar renders them. */
export function publishPullRequestListBridge(next: PullRequestListBridgeValue | null): void {
  if (bridgeFieldsEqual(bridge, next)) return;
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
