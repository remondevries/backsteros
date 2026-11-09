import { useLayoutEffect, useRef } from "react";

import {
  getProductTabUiState,
  patchProductTabPageScroll,
} from "./product-tab-ui-state";
import {
  getWarmKeepAliveActiveProductTabId,
  getWarmKeepAliveEpoch,
  subscribeWarmKeepAlive,
} from "./shell-warm-keep-alive";

/**
 * Persist/restore the shell `.page-scroll` main column per product tab.
 * Mount once under AppShell — the element is owned by ProductContentShell.
 */
export function usePageScrollProductTabRestore(): void {
  const prevTabIdRef = useRef<string | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const syncElement = () => {
      elementRef.current = document.querySelector(".page-scroll");
    };
    syncElement();

    const applyForActiveTab = () => {
      syncElement();
      const el = elementRef.current;
      const tabId = getWarmKeepAliveActiveProductTabId();
      const prevId = prevTabIdRef.current;

      if (prevId && prevId !== tabId && el) {
        patchProductTabPageScroll(prevId, el.scrollTop);
      }
      prevTabIdRef.current = tabId;

      if (!tabId || !el) return;
      const nextTop = getProductTabUiState(tabId).pageScrollTop;
      if (Math.abs(el.scrollTop - nextTop) > 1) {
        el.scrollTop = nextTop;
      }
    };

    applyForActiveTab();

    const onScroll = () => {
      const el = elementRef.current;
      const tabId = getWarmKeepAliveActiveProductTabId();
      if (!el || !tabId) return;
      patchProductTabPageScroll(tabId, el.scrollTop);
    };

    const el = elementRef.current;
    el?.addEventListener("scroll", onScroll, { passive: true });
    const unsubWarm = subscribeWarmKeepAlive(() => {
      void getWarmKeepAliveEpoch();
      applyForActiveTab();
    });

    return () => {
      el?.removeEventListener("scroll", onScroll);
      unsubWarm();
      const tabId = getWarmKeepAliveActiveProductTabId();
      const current = elementRef.current;
      if (tabId && current) {
        patchProductTabPageScroll(tabId, current.scrollTop);
      }
    };
  }, []);
}
