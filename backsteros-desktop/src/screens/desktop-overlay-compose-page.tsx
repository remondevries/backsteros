import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ComposeModal } from "@backsteros/ui";

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
} from "../lib/desktop-overlay";
import { useDesktopOverlayAutoResize } from "../lib/use-desktop-overlay-auto-resize";
import { DesktopOverlayRoot } from "../shell/desktop-overlay-root";

function ComposeOverlayController() {
  const { client } = useDesktopApi();
  const [searchParams] = useSearchParams();
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

  const ensureContext = useCallback(async () => {
    if (contextRef.current) {
      return;
    }

    if (loadPromiseRef.current) {
      await loadPromiseRef.current;
      return;
    }

    setContextLoading(true);
    setContextError(null);

    const promise = loadComposeOverlayContext(client)
      .then((next) => {
        contextRef.current = next;
        setContext(next);
      })
      .catch((error: unknown) => {
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
  }, [client]);

  // Prefetch while the overlay window is still hidden.
  useEffect(() => {
    void ensureContext();
  }, [ensureContext]);

  useEffect(() => {
    if (open) {
      void ensureContext();
    }
  }, [ensureContext, open]);

  // Overlay webview is persistent; re-open the modal whenever the panel is shown.
  // Keep cached projects/contacts — do not flash a loading state on every show.
  useEffect(() => {
    const reopen = () => {
      setOpen(true);
      void ensureContext();
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
  };
  const active = context ?? emptyContext;

  return (
    <ComposeModal
      open={open}
      onOpenChange={handleOpenChange}
      pathname={pathname}
      projects={active.projects}
      contacts={active.contacts}
      defaultAssigneeId={getDefaultAssigneeId()}
      documentFoldersByTarget={active.documentFoldersByTarget}
      contextLoading={contextLoading && !context}
      contextError={contextError}
      projectsHref="/projects"
      onNavigate={(href) => {
        void completeDesktopOverlayNavigation(href);
      }}
      onCreateTask={async (input) =>
        createComposeOverlayTask(client, input, active.projectsById)
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
