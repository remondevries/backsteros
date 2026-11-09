import { useLayoutEffect, useRef, type RefObject } from "react";

import {
  getProductTabUiState,
  patchProductTabCommunicationUi,
  patchProductTabInboxUi,
  patchProductTabTasksUi,
} from "./product-tab-ui-state";
import { getWarmKeepAliveActiveProductTabId } from "./shell-warm-keep-alive";

export type ProductTabScrollSurface = "inbox" | "communication" | "tasks";

type ScrollSlot = "main" | "panel" | "list";

function readScroll(
  tabId: string,
  surface: ProductTabScrollSurface,
  slot: ScrollSlot,
): number {
  const state = getProductTabUiState(tabId);
  if (surface === "inbox") {
    return slot === "panel" ? state.inbox.panelScrollTop : state.inbox.mainScrollTop;
  }
  if (surface === "communication") {
    return slot === "list"
      ? state.communication.listScrollTop
      : state.communication.mainScrollTop;
  }
  return state.tasks.mainScrollTop;
}

function writeScroll(
  tabId: string,
  surface: ProductTabScrollSurface,
  slot: ScrollSlot,
  scrollTop: number,
): void {
  if (surface === "inbox") {
    patchProductTabInboxUi(
      tabId,
      slot === "panel" ? { panelScrollTop: scrollTop } : { mainScrollTop: scrollTop },
    );
    return;
  }
  if (surface === "communication") {
    patchProductTabCommunicationUi(
      tabId,
      slot === "list" ? { listScrollTop: scrollTop } : { mainScrollTop: scrollTop },
    );
    return;
  }
  patchProductTabTasksUi(tabId, { mainScrollTop: scrollTop });
}

/**
 * Persist + restore scrollTop on a scroll container when the active product
 * tab changes (shared keep-alive tree). Saves the leaving tab before restore.
 *
 * Residual (intentionally not redesigned here): Communication list + Tasks list
 * scrollports are not yet wired to this hook — only Inbox panel + main page
 * scroll ({@link usePageScrollProductTabRestore}) are consumers today.
 */
export function useProductTabScrollRestore(
  surface: ProductTabScrollSurface,
  slot: ScrollSlot,
  elementRef: RefObject<HTMLElement | null>,
): void {
  const prevTabIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const tabId = getWarmKeepAliveActiveProductTabId();
    const el = elementRef.current;
    const prevId = prevTabIdRef.current;

    if (prevId && prevId !== tabId && el) {
      writeScroll(prevId, surface, slot, el.scrollTop);
    }

    prevTabIdRef.current = tabId;

    if (!tabId || !el) return;

    const nextTop = readScroll(tabId, surface, slot);
    if (Math.abs(el.scrollTop - nextTop) > 1) {
      el.scrollTop = nextTop;
    }

    const onScroll = () => {
      const active = getWarmKeepAliveActiveProductTabId();
      if (!active || active !== tabId) return;
      writeScroll(active, surface, slot, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      const active = getWarmKeepAliveActiveProductTabId();
      // Persist on unmount/cleanup for the tab that owned this listener.
      if (tabId && el) writeScroll(tabId, surface, slot, el.scrollTop);
      void active;
    };
  }, [surface, slot, elementRef]);
}
