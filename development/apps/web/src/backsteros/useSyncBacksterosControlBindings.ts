import { useEffect } from "react";

import { syncControlBindingsFromServer } from "./controlApi";

/**
 * Pull server-side BacksterOS task↔thread bindings (created by the localhost
 * control API) into the local task chat store so the rail stays linked.
 */
export function useSyncBacksterosControlBindings(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const run = () => {
      void syncControlBindingsFromServer(controller.signal).catch(() => undefined);
    };
    run();
    const timer = window.setInterval(run, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled]);
}
