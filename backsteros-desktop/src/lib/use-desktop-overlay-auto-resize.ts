import { useLayoutEffect } from "react";

import { resizeDesktopOverlayWindow } from "../lib/desktop-overlay";
import { isTauriRuntime } from "../lib/whoop";

/**
 * Keep the native overlay window height in sync with its content — same approach
 * as Circle's useDesktopOverlayAutoResize (ResizeObserver on the content root).
 *
 * Also remeasures on DOM mutations (async search hits, growing textareas) and
 * when the panel regains focus, so height tracks dynamic loads.
 */
export function useDesktopOverlayAutoResize(
  enabled: boolean,
  contentSelector: string,
) {
  useLayoutEffect(() => {
    if (!enabled || !isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let mutationObserver: MutationObserver | undefined;
    let retryFrame = 0;
    let measureFrame = 0;
    let lastSentHeight = 0;

    const measureHeight = (content: Element) => {
      const rectHeight = content.getBoundingClientRect().height;
      const scrollHeight =
        content instanceof HTMLElement ? content.scrollHeight : 0;
      return Math.ceil(Math.max(rectHeight, scrollHeight, 0));
    };

    const syncHeight = (content: Element) => {
      cancelAnimationFrame(measureFrame);
      // Double-rAF: wait for layout after React commits (search results, etc.).
      measureFrame = requestAnimationFrame(() => {
        measureFrame = requestAnimationFrame(() => {
          if (cancelled) {
            return;
          }
          const height = measureHeight(content);
          if (height <= 0 || height === lastSentHeight) {
            return;
          }
          lastSentHeight = height;
          void resizeDesktopOverlayWindow(height);
        });
      });
    };

    const observeContent = (content: Element) => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();

      resizeObserver = new ResizeObserver(() => syncHeight(content));
      resizeObserver.observe(content);

      // Child boxes that often drive height independently of the root box.
      content
        .querySelectorAll(
          ".command-chrome, .command-list, .create-task-modal-shell, .create-task-modal-dialog",
        )
        .forEach((child) => {
          resizeObserver?.observe(child);
        });

      mutationObserver = new MutationObserver(() => {
        syncHeight(content);
        // New nodes (search hits) — observe freshly added height drivers.
        content
          .querySelectorAll(
            ".command-chrome, .command-list, .create-task-modal-shell, .create-task-modal-dialog",
          )
          .forEach((child) => {
            resizeObserver?.observe(child);
          });
      });
      mutationObserver.observe(content, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      syncHeight(content);
    };

    const attach = () => {
      if (cancelled) {
        return;
      }

      const content = document.querySelector(contentSelector);
      if (!content) {
        retryFrame = requestAnimationFrame(attach);
        return;
      }

      observeContent(content);
    };

    const remeasure = () => {
      const content = document.querySelector(contentSelector);
      if (content) {
        lastSentHeight = 0;
        syncHeight(content);
      }
    };

    window.addEventListener("focus", remeasure);
    attach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(retryFrame);
      cancelAnimationFrame(measureFrame);
      window.removeEventListener("focus", remeasure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [enabled, contentSelector]);
}
