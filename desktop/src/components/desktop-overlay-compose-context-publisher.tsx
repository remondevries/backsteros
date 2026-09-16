import { useEffect, useRef } from "react";

import {
  buildComposeOverlayContext,
  type ComposeOverlayContext,
} from "../lib/compose-overlay-data";
import { getDefaultAssigneeId } from "../lib/default-assignee";
import {
  DESKTOP_OVERLAY_COMPOSE_CONTEXT_EVENT,
  DESKTOP_OVERLAY_REQUEST_COMPOSE_CONTEXT_EVENT,
  snapshotComposeOverlayContext,
} from "../lib/desktop-overlay";
import { isTauriRuntime } from "../lib/whoop";
import {
  useDesktopWorkspaceDocuments,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";

function buildContextFromWorkspace(input: {
  projects: ReturnType<typeof useDesktopWorkspaceProjects>["projects"];
  contacts: ReturnType<typeof useDesktopWorkspacePeople>["contacts"];
  knowledgeDocuments: ReturnType<
    typeof useDesktopWorkspaceDocuments
  >["knowledgeDocuments"];
  projectDocuments: ReturnType<
    typeof useDesktopWorkspaceDocuments
  >["projectDocuments"];
}): ComposeOverlayContext {
  return buildComposeOverlayContext({
    projects: input.projects,
    contacts: input.contacts,
    documents: [
      ...input.knowledgeDocuments.map((document) => ({
        path: document.path ?? "",
        title: document.title,
        kind: document.kind ?? "document",
        type: "knowledge" as const,
        projectId: null,
      })),
      ...input.projectDocuments.map((document) => ({
        path: document.path ?? "",
        title: document.title,
        kind: document.kind ?? "document",
        type: "project" as const,
        projectId: document.projectId ?? null,
      })),
    ],
    defaultAssigneeId: getDefaultAssigneeId(),
  });
}

/**
 * Main window: when the compose overlay asks for options, reply with the warm
 * workspace snapshot so the overlay skips three REST list GETs.
 */
export function DesktopOverlayComposeContextPublisher() {
  const { projects } = useDesktopWorkspaceProjects();
  const { contacts } = useDesktopWorkspacePeople();
  const { knowledgeDocuments, projectDocuments } =
    useDesktopWorkspaceDocuments();

  const contextRef = useRef<ComposeOverlayContext>(
    buildContextFromWorkspace({
      projects,
      contacts,
      knowledgeDocuments,
      projectDocuments,
    }),
  );
  contextRef.current = buildContextFromWorkspace({
    projects,
    contacts,
    knowledgeDocuments,
    projectDocuments,
  });

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { listen, emit } = await import("@tauri-apps/api/event");
        if (cancelled) return;

        unlisten = await listen(
          DESKTOP_OVERLAY_REQUEST_COMPOSE_CONTEXT_EVENT,
          () => {
            void emit(
              DESKTOP_OVERLAY_COMPOSE_CONTEXT_EVENT,
              snapshotComposeOverlayContext(contextRef.current),
            );
          },
        );
      } catch {
        // Ignore when the desktop shell is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return null;
}
