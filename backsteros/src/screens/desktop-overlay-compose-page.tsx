import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { ComposeModal, isComposeTasksPagePathname } from "@backsteros/ui";

import {
  createComposeOverlayDocument,
  createComposeOverlayTask,
  loadComposeOverlayContext,
  type ComposeOverlayContext,
} from "../lib/compose-overlay-data";
import { useDesktopApi } from "../lib/api-context";
import { getDefaultAssigneeId } from "../lib/default-assignee";
import {
  completeDesktopOverlayNavigation,
  DESKTOP_OVERLAY_TOGGLE_COMPOSE_EVENT,
  hideDesktopOverlayWindow,
  requestComposeOverlayContextFromMain,
} from "../lib/desktop-overlay";
import { useDesktopOverlayAutoResize } from "../lib/use-desktop-overlay-auto-resize";
import { DesktopOverlayRoot } from "../shell/desktop-overlay-root";

function ComposeOverlayController() {
  const { client } = useDesktopApi();
  const { searchStr } = useLocation();
  const searchParams = useMemo(
    () =>
      new URLSearchParams(
        searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
      ),
    [searchStr],
  );
  const [open, setOpen] = useState(true);
  const [context, setContext] = useState<ComposeOverlayContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const contextRef = useRef<ComposeOverlayContext | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  useDesktopOverlayAutoResize(open, ".create-task-modal-root");

  const pathname = useMemo(() => {
    const ctx = searchParams.get("ctx")?.trim();
    return ctx && ctx.length > 0 ? ctx : "/";
  }, [searchParams]);

  const ensureContext = useCallback(
    async (options?: { preferFreshMain?: boolean }) => {
      if (loadPromiseRef.current) {
        await loadPromiseRef.current;
        return;
      }

      const hadCache = contextRef.current != null;
      if (hadCache && !options?.preferFreshMain) {
        return;
      }

      if (!hadCache) {
        setContextLoading(true);
        setContextError(null);
      }

      const promise = (async () => {
        // Prefer warm workspace rows from the main window (PowerSync is off here).
        const fromMain = await requestComposeOverlayContextFromMain();
        if (fromMain) {
          contextRef.current = fromMain;
          setContext(fromMain);
          return;
        }
        if (hadCache) {
          return;
        }
        const next = await loadComposeOverlayContext(client);
        contextRef.current = next;
        setContext(next);
      })()
        .catch((error: unknown) => {
          if (hadCache) return;
          setContextError(
            error instanceof Error
              ? error.message
              : "Could not load compose options.",
          );
        })
        .finally(() => {
          setContextLoading(false);
          loadPromiseRef.current = null;
        });

      loadPromiseRef.current = promise;
      await promise;
    },
    [client],
  );

  // Prefetch while the overlay window is still hidden.
  useEffect(() => {
    void ensureContext();
  }, [ensureContext]);

  useEffect(() => {
    if (open) {
      void ensureContext({ preferFreshMain: true });
    }
  }, [ensureContext, open]);

  // Overlay webview is persistent; re-open the modal whenever the panel is shown.
  // Refresh from main when possible; keep cache if main is unavailable.
  useEffect(() => {
    const reopen = () => {
      setOpen(true);
      void ensureContext({ preferFreshMain: true });
    };
    window.addEventListener("focus", reopen);
    return () => window.removeEventListener("focus", reopen);
  }, [ensureContext]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) {
          return;
        }

        unlisten = await listen(DESKTOP_OVERLAY_TOGGLE_COMPOSE_EVENT, () => {
          setOpen((current) => {
            if (current) {
              void hideDesktopOverlayWindow();
              return false;
            }
            return true;
          });
        });
      } catch {
        // Ignore when the desktop shell is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      void hideDesktopOverlayWindow();
    }
  };

  const emptyContext: ComposeOverlayContext = {
    projects: [],
    contacts: [],
    documentFoldersByTarget: {},
    projectsById: new Map(),
    defaultAssigneeId: getDefaultAssigneeId(),
  };
  const active = context ?? emptyContext;

  return (
    <ComposeModal
      open={open}
      onOpenChange={handleOpenChange}
      pathname={pathname}
      projects={active.projects}
      contacts={active.contacts}
      defaultAssigneeId={active.defaultAssigneeId}
      documentFoldersByTarget={active.documentFoldersByTarget}
      contextLoading={contextLoading && !context}
      contextError={contextError}
      projectsHref="/projects"
      onNavigate={(href) => {
        void completeDesktopOverlayNavigation(href);
      }}
      onCreateTask={async (input) =>
        createComposeOverlayTask(client, input, active.projectsById, {
          fromTasksDueList: isComposeTasksPagePathname(pathname),
        })
      }
      onCreateDocument={async (input) =>
        createComposeOverlayDocument(client, input, active.projectsById)
      }
    />
  );
}

export function DesktopOverlayComposePage() {
  return (
    <DesktopOverlayRoot variant="compose">
      <ComposeOverlayController />
    </DesktopOverlayRoot>
  );
}
